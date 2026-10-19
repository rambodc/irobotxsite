import Decimal from "decimal.js";

const D = (v) => new Decimal(v ?? 0);
export const money = (v) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
export const qty = (v) => D(v).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
// Display unit cost (the posted value is always the exact batch total).
export const unitCost = (v) => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();

/** Scale a recipe (inputs per `outputQty`) to the quantity actually produced. */
export function scaleRecipe(recipe, outputQty) {
  const base = D(recipe.outputQty);
  const wanted = D(outputQty);
  if (!base.gt(0) || !wanted.gt(0)) throw new Error("invalid-argument");
  const factor = wanted.div(base);
  return recipe.lines.map((l) => ({ itemId: l.itemId, qty: qty(D(l.qty).mul(factor)) }));
}

/**
 * Pre-posting plan from LIVE QuickBooks items: what is consumed, stock after,
 * shortages, and an estimated cost from each input's QuickBooks purchase cost.
 * The posted cost is the actual FIFO cost QuickBooks removes from inventory.
 */
export function planRun(recipe, outputQty, itemsById) {
  const lines = scaleRecipe(recipe, outputQty).map((l) => {
    const item = itemsById[l.itemId];
    const available = item ? item.qtyOnHand : 0;
    const est = D(l.qty).mul(item ? item.purchaseCost : 0);
    return {
      itemId: l.itemId,
      name: item ? item.name : `Missing item ${l.itemId}`,
      qty: l.qty,
      available,
      after: qty(D(available).minus(l.qty)),
      unitCost: item ? item.purchaseCost : 0,
      estCost: money(est),
      missing: !item || !item.active || !item.trackQty,
      short: !item || D(available).lt(l.qty),
    };
  });
  const out = itemsById[recipe.outputItemId];
  const estTotal = money(lines.reduce((s, l) => s.plus(l.estCost), D(0)));
  const problems = [];
  if (!out || !out.active || !out.trackQty)
    problems.push("The finished product is missing, inactive or not quantity-tracked in QuickBooks.");
  for (const l of lines) {
    if (l.missing) problems.push(`${l.name} is missing, inactive or not quantity-tracked in QuickBooks.`);
    else if (l.short) problems.push(`Not enough ${l.name}: needs ${l.qty}, ${l.available} on hand.`);
  }
  return {
    outputItemId: recipe.outputItemId,
    outputName: out ? out.name : `Missing item ${recipe.outputItemId}`,
    outputQty: qty(outputQty),
    finishedBefore: out ? out.qtyOnHand : 0,
    finishedAfter: qty(D(out ? out.qtyOnHand : 0).plus(outputQty)),
    lines,
    estTotal,
    estUnitCost: unitCost(D(estTotal).div(outputQty)),
    problems,
    ok: problems.length === 0,
  };
}

/**
 * Settle a run from the WIP clearing account balances QuickBooks reports:
 *  - the consume adjustment debits WIP with QuickBooks' actual (FIFO) cost of the raws removed,
 *  - the $0 production bill credits WIP with exactly that cost and adds it to the finished item,
 *  - anything left in WIP (should be $0.00) is cleared by journal entry.
 */
export function settleRun({ wipBefore, wipAfterConsume, wipAfterBill = null, outputQty }) {
  const actualCost = money(D(wipAfterConsume).minus(wipBefore));
  const perUnit = unitCost(D(actualCost).div(outputQty));
  if (wipAfterBill === null) return { actualCost, unitCost: perUnit };
  return { actualCost, unitCost: perUnit, residual: money(D(wipAfterBill).minus(wipBefore)) };
}

/**
 * Lines of the $0 internal production bill: the finished item comes in at the exact batch cost
 * (QuickBooks keeps the line Amount; UnitPrice is informational) and an equal negative line
 * credits Production WIP, so the bill total and the payable are $0.
 */
export function productionBillLines({ itemId, outputQty, actualCost, wipAccountId, taxCodeId, description }) {
  const amount = money(actualCost);
  if (amount < 0) throw new Error("negative-batch-cost");
  const tax = taxCodeId ? { TaxCodeRef: { value: taxCodeId } } : {};
  return [
    {
      DetailType: "ItemBasedExpenseLineDetail",
      Amount: amount,
      Description: description,
      ItemBasedExpenseLineDetail: {
        ItemRef: { value: itemId },
        Qty: qty(outputQty),
        UnitPrice: D(amount).div(outputQty).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber(),
        ...tax,
      },
    },
    {
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: -amount,
      Description: `${description} · clear Production WIP`,
      AccountBasedExpenseLineDetail: { AccountRef: { value: wipAccountId }, ...tax },
    },
  ];
}

/** Bill DocNumber (QuickBooks allows 21 characters): PR-<lot>, or PR-<run id> without a lot. */
export function productionDocNumber(lotNumber, runId) {
  const lot = String(lotNumber || "").replace(/\s+/g, "-");
  const byLot = `PR-${lot}`;
  return lot && byLot.length <= 21 ? byLot : `PR-${String(runId).slice(0, 12).toUpperCase()}`;
}

/** Journal entry lines clearing a WIP residual to the chosen account. */
export function residualJournalLines(residual, wipAccountId, residualAccountId, memo) {
  const amt = Math.abs(money(residual));
  if (amt < 0.01) return [];
  const wipSide = residual > 0 ? "Credit" : "Debit";
  const otherSide = residual > 0 ? "Debit" : "Credit";
  const line = (side, account) => ({
    Amount: amt,
    DetailType: "JournalEntryLineDetail",
    Description: memo,
    JournalEntryLineDetail: { PostingType: side, AccountRef: { value: account } },
  });
  return [line(wipSide, wipAccountId), line(otherSide, residualAccountId)];
}
