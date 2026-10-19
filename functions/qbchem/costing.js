import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const D = (v) => new Decimal(v ?? 0);

/** Containers from base quantity (floor). Remainder in base units. */
export function containersFromBase(qtyBase, capacity) {
  const cap = D(capacity);
  if (!cap.isFinite() || cap.lte(0)) throw new Error("invalid-argument");
  const qty = D(qtyBase);
  if (!qty.isFinite() || qty.lt(0)) throw new Error("invalid-argument");
  const whole = qty.div(cap).floor();
  const remainder = qty.minus(whole.mul(cap));
  return {
    containers: whole.toNumber(),
    remainderBase: remainder.toNumber(),
    qtyBase: qty.toNumber(),
  };
}

export function baseFromContainers(containers, capacity) {
  const n = D(containers);
  const cap = D(capacity);
  if (!n.isFinite() || n.lt(0) || !n.isInteger())
    throw new Error("invalid-argument");
  if (!cap.isFinite() || cap.lte(0)) throw new Error("invalid-argument");
  return n.mul(cap).toNumber();
}

/**
 * Scale recipe lines for a desired output quantity.
 * recipe: { outputQtyBase, lines: [{ chemicalId, qtyBase }] }
 */
export function scaleRecipe(recipe, outputQtyBase) {
  const baseOut = D(recipe.outputQtyBase);
  const wanted = D(outputQtyBase);
  if (!baseOut.isFinite() || baseOut.lte(0)) throw new Error("invalid-argument");
  if (!wanted.isFinite() || wanted.lte(0)) throw new Error("invalid-argument");
  const factor = wanted.div(baseOut);
  return {
    factor: factor.toNumber(),
    outputQtyBase: wanted.toNumber(),
    lines: (recipe.lines || []).map((line) => ({
      chemicalId: line.chemicalId,
      qtyBase: D(line.qtyBase).mul(factor).toDecimalPlaces(6).toNumber(),
    })),
  };
}

/**
 * Cost a scaled batch from unit costs (CAD per base unit).
 */
export function costBatch(scaledLines, unitCosts, outputQtyBase) {
  let total = D(0);
  const consumed = scaledLines.map((line) => {
    const unit = D(unitCosts[line.chemicalId]);
    if (!unit.isFinite() || unit.lt(0)) throw new Error("invalid-argument");
    const lineCost = D(line.qtyBase).mul(unit).toDecimalPlaces(4);
    total = total.plus(lineCost);
    return {
      chemicalId: line.chemicalId,
      qtyBase: line.qtyBase,
      unitCost: unit.toDecimalPlaces(6).toNumber(),
      cost: lineCost.toNumber(),
    };
  });
  const out = D(outputQtyBase);
  const costPerBase = out.gt(0)
    ? total.div(out).toDecimalPlaces(6).toNumber()
    : null;
  return {
    consumed,
    costTotal: total.toDecimalPlaces(2).toNumber(),
    costPerBase,
  };
}

export function money(v) {
  return D(v).toDecimalPlaces(2).toNumber();
}

export function residualToClear(wipBalance) {
  const b = D(wipBalance);
  if (!b.isFinite()) throw new Error("invalid-argument");
  return money(b);
}
