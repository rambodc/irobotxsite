import { D, RLUSD, LIMITS, day } from "./config.js";
import {
  rpc,
  wallet,
  book,
  trustLine,
  balanceGuard,
  drops,
  issued,
  xrp,
  issuerAllowed,
} from "./ledger.js";
import { approvalValid } from "./strategy.js";
export async function prepare(c, i, h) {
  const w = await wallet(c.trader.address, h);
  if (!w.funded) throw new Error(w.reason);
  const fee = String(
    Math.max(
      12,
      Math.ceil(Number((await rpc("fee")).drops.open_ledger_fee) * 1.2),
    ),
  );
  if (!Number.isSafeInteger(Number(fee)) || Number(fee) > LIMITS.feeDrops)
    throw new Error("Transaction fee exceeds 0.01 XRP.");
  const line = trustLine(w);
  const issuer = await rpc("account_info", {
    account: RLUSD.issuer,
    ledger_hash: h.hash,
  });
  issuerAllowed(issuer.account_data);
  let tx = {
    Account: c.trader.address,
    Sequence: w.sequence,
    Fee: fee,
    LastLedgerSequence: h.index + 4,
    Flags: 0x80000000,
  };
  if (i.action === "trust") {
    balanceGuard(w, 0, fee, line ? "0" : h.increment);
    return {
      tx: {
        ...tx,
        TransactionType: "TrustSet",
        Flags: 0x80020000,
        LimitAmount: { ...RLUSD, value: LIMITS.trustLimit },
      },
      markPrice: "0",
      wallet: w,
    };
  }
  if (i.action === "withdraw") {
    if (
      c.mode !== "paused" ||
      !i.withdrawal ||
      JSON.stringify(c.returnAddress) !==
        JSON.stringify({ address: i.withdrawal.address, tag: i.withdrawal.tag })
    )
      throw new Error("Withdrawal destination or pause state changed.");
    const a = i.withdrawal,
      amount = D(a.amount);
    if (
      !["XRP", "RLUSD"].includes(a.currency) ||
      !amount.isFinite() ||
      amount.lte(0)
    )
      throw new Error("Invalid withdrawal amount.");
    const dest = await wallet(a.address, h);
    if (!dest.funded) throw new Error("Return address must already be funded.");
    if (dest.flags & 0x20000 && a.tag === null)
      throw new Error("Destination requires a tag.");
    if (dest.flags & 0x1000000)
      throw new Error(
        "Destination requires deposit authorization; unsupported.",
      );
    if (a.currency === "XRP") {
      if (
        !amount.mul(1e6).isInteger() ||
        D(w.available).minus(amount).minus(xrp(fee)).lt(c.position.quantity)
      )
        throw new Error(
          "Withdrawal exceeds non-position XRP above reserve and fee.",
        );
    } else {
      balanceGuard(w, 0, fee);
      const dl = trustLine(dest);
      if (
        !line ||
        D(line.balance).lt(amount) ||
        !dl ||
        D(dl.limit).minus(dl.balance).lt(amount)
      )
        throw new Error(
          "Insufficient RLUSD or destination trust-line capacity.",
        );
    }
    return {
      tx: {
        ...tx,
        TransactionType: "Payment",
        Destination: a.address,
        ...(a.tag !== null ? { DestinationTag: a.tag } : {}),
        Amount:
          a.currency === "XRP"
            ? drops(amount)
            : { ...RLUSD, value: issued(amount) },
      },
      markPrice: "0",
      wallet: w,
    };
  }
  if (!line) throw new Error("Create and fund the RLUSD trust line first.");
  const m = await book(h, c.settings, c.trader.address);
  if (!m.eligible) throw new Error(m.reason);
  if (
    c.expected &&
    (!D(c.expected.xrp).eq(w.balance) || !D(c.expected.rlusd).eq(line.balance))
  )
    throw new Error(
      "Ledger balance changed outside the engine; review before trading.",
    );
  const cfg = c.settings,
    movement = D(cfg.movement).div(100);
  if (i.action === "buy") {
    if (
      c.mode !== "running" ||
      !approvalValid(c.analysis, c) ||
      i.decisionId !== c.analysis.id ||
      Date.now() < c.cooldownUntil
    )
      throw new Error("Entry approval is stale or invalid.");
    if (D(c.position.quantity).gt(0))
      throw new Error("A trading position already exists.");
    if (c.daily.stoppedDay === day())
      throw new Error("Daily loss stop is active.");
    const spent = c.budget.day === day() ? D(c.budget.spent) : D(0),
      amount = D(cfg.purchase);
    if (
      spent.plus(amount).gt(cfg.dailyPurchases) ||
      amount.gt(cfg.positionCap) ||
      D(line.balance).lt(amount) ||
      D(m.buyDepth).lt(amount)
    )
      throw new Error(
        "Purchase exceeds available funds, liquidity, or configured limits.",
      );
    balanceGuard(w, 0, fee);
    const cap = D(m.ask).mul(D(1).plus(movement));
    const qty = amount.div(cap).mul(1e6).ceil().div(1e6); // round native minimum UP, never weaken the price limit
    if (qty.mul(m.ask).plus(xrp(fee).mul(m.ask)).gt(cfg.positionCap))
      throw new Error("Position including fee would exceed its cap.");
    return {
      tx: {
        ...tx,
        TransactionType: "OfferCreate",
        Flags: 0x800a0000,
        TakerGets: { ...RLUSD, value: issued(amount) },
        TakerPays: drops(qty),
      },
      markPrice: m.ask,
      wallet: w,
    };
  }
  const qty = D(c.position.quantity);
  if (qty.lte(0) || !qty.mul(1e6).isInteger())
    throw new Error("No executable XRP position.");
  if (
    !c.exit ||
    c.exit.attempts >= LIMITS.attempts ||
    Date.now() - c.exit.startedAt > LIMITS.duration
  )
    throw new Error(
      "Exit limits reached; residual holding requires attention.",
    );
  if (D(m.sellDepth).lte(0))
    throw new Error("Sell blocked: insufficient liquidity.");
  balanceGuard(w, qty, fee);
  const min = qty
    .mul(m.bid)
    .mul(D(1).minus(movement))
    .toSignificantDigits(16, 2)
    .toString();
  if (D(line.limit).minus(line.balance).lt(qty.mul(m.ask)))
    throw new Error("RLUSD trust line has insufficient capacity for exit.");
  return {
    tx: {
      ...tx,
      TransactionType: "OfferCreate",
      Flags: 0x800a0000,
      TakerGets: drops(qty),
      TakerPays: { ...RLUSD, value: min },
    },
    markPrice: m.bid,
    wallet: w,
  };
}
export function verifyFresh(original, fresh) {
  if (original.Sequence !== fresh.Sequence || D(original.Fee).lt(fresh.Fee))
    throw new Error("Sequence or fee changed before submission.");
  if (original.TransactionType === "OfferCreate") {
    const price = (t) =>
      typeof t.TakerGets === "string"
        ? D(t.TakerPays.value).div(xrp(t.TakerGets))
        : D(t.TakerGets.value).div(xrp(t.TakerPays));
    if (
      typeof original.TakerGets === "string"
        ? price(original).lt(price(fresh))
        : price(original).gt(price(fresh))
    )
      throw new Error("Signed order exceeds the fresh price limit.");
  }
}
