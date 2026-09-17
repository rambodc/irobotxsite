import Decimal from "decimal.js";
import { isValidClassicAddress } from "ripple-address-codec";
import { createHash } from "node:crypto";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });
const D = (value) => new Decimal(value);
const positive = (value) => {
  try {
    return D(value).isFinite() && D(value).gt(0);
  } catch {
    return false;
  }
};
export const RLUSD = {
  currency: "524C555344".padEnd(40, "0"),
  issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  symbol: "RLUSD",
};
export const XRP = { currency: "XRP", symbol: "XRP" };
export const DEFAULT_RULES = {
  orderSize: 100,
  maxPosition: 1000,
  maxSpread: 0.5,
  threshold: 0.15,
  cooldown: 60,
};
export const emptyPortfolio = () => ({
  cash: "10000",
  quantity: "0",
  cost: "0",
  realized: "0",
  fees: "0",
  lastTradeAt: 0,
  lastLedger: 0,
});
export function asset(input) {
  if (!input || typeof input.currency !== "string")
    throw new Error("invalid-argument");
  const code = input.currency.trim();
  if (code === "XRP" && !input.issuer) return XRP;
  if (!isValidClassicAddress(input.issuer || ""))
    throw new Error("invalid-argument");
  // XRPL standard currency codes are case-sensitive. Longer names use hex encoding.
  let currency = code;
  if (/^[a-zA-Z0-9]{4,20}$/.test(code))
    currency = Buffer.from(code, "ascii")
      .toString("hex")
      .padEnd(40, "0")
      .toUpperCase();
  if (!/^[a-zA-Z0-9]{3}$/.test(currency) && !/^[a-fA-F0-9]{40}$/.test(currency))
    throw new Error("invalid-argument");
  if (currency.length === 40) currency = currency.toUpperCase();
  if (
    currency === "XRP" ||
    /^0{40}$/.test(currency) ||
    (currency.length === 40 && currency.startsWith("00"))
  )
    throw new Error("invalid-argument");
  const decoded =
    currency.length === 40
      ? Buffer.from(currency, "hex").toString("ascii").replace(/\0+$/, "")
      : currency;
  const symbol = /^[a-zA-Z0-9]{3,20}$/.test(decoded)
    ? decoded
    : currency.slice(0, 8) + "…";
  return { currency, issuer: input.issuer, symbol };
}
export function makePair(baseInput, quoteName) {
  const base = asset(baseInput);
  if (!["XRP", "RLUSD"].includes(quoteName))
    throw new Error("invalid-argument");
  const quote = quoteName === "XRP" ? XRP : RLUSD;
  if (base.currency === quote.currency && base.issuer === quote.issuer)
    throw new Error("invalid-argument");
  const id = createHash("sha256")
    .update(
      JSON.stringify([
        base.currency,
        base.issuer || "",
        quote.currency,
        quote.issuer || "",
      ]),
    )
    .digest("hex")
    .slice(0, 24);
  return { id, base, quote, name: `${base.symbol} / ${quote.symbol}` };
}
export const defaultPair = () => makePair(XRP, "RLUSD");
export const initialConfig = () => {
  const pair = defaultPair();
  return {
    schemaVersion: 1,
    enabled: false,
    revision: 0,
    activePair: pair.id,
    pairs: [pair],
    rules: { ...DEFAULT_RULES },
  };
};
export function rules(input) {
  if (
    !input ||
    Object.keys(input).sort().join() !==
      Object.keys(DEFAULT_RULES).sort().join()
  )
    throw new Error("invalid-argument");
  const ranges = {
    orderSize: [1, 1000],
    maxPosition: [1, 10000],
    maxSpread: [0.01, 5],
    threshold: [0.01, 5],
    cooldown: [60, 3600],
  };
  for (const [key, [min, max]] of Object.entries(ranges))
    if (
      typeof input[key] !== "number" ||
      !Number.isFinite(input[key]) ||
      input[key] < min ||
      input[key] > max
    )
      throw new Error("invalid-argument");
  if (input.maxPosition < input.orderSize || !Number.isInteger(input.cooldown))
    throw new Error("invalid-argument");
  return { ...input };
}
function amount(value, a) {
  if (a.currency === "XRP") {
    if (typeof value !== "string") throw new Error("Invalid XRP amount");
    return D(value).div(1e6);
  }
  if (
    !value ||
    typeof value !== "object" ||
    value.currency !== a.currency ||
    value.issuer !== a.issuer
  )
    throw new Error("Invalid token amount");
  return D(value.value);
}
export function bookLevels(offers, pair, side) {
  const ask = side === "ask";
  return offers
    .flatMap((o) => {
      try {
        const gets = amount(
          o.taker_gets_funded ?? o.TakerGets,
          ask ? pair.base : pair.quote,
        );
        const pays = amount(
          o.taker_pays_funded ?? o.TakerPays,
          ask ? pair.quote : pair.base,
        );
        if (!gets.isFinite() || !pays.isFinite() || gets.lte(0) || pays.lte(0))
          return [];
        return [
          {
            price: (ask ? pays.div(gets) : gets.div(pays)).toString(),
            quantity: (ask ? gets : pays).toString(),
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => D(a.price).cmp(b.price) * (ask ? 1 : -1));
}
export const midpoint = (s) => D(s.bid).plus(s.ask).div(2).toString();
export const spreadPct = (s) =>
  D(s.ask).minus(s.bid).div(midpoint(s)).mul(100).toNumber();
export function quoteProblem(s, r, now) {
  if (!s || !Number.isFinite(s.at) || now - s.at > 30000 || s.at > now + 5000)
    return "Waiting for a fresh validated ledger.";
  if (
    !Number.isSafeInteger(s.ledger) ||
    s.ledger <= 0 ||
    !positive(s.bid) ||
    !positive(s.ask) ||
    D(s.ask).lt(s.bid) ||
    !s.bids?.length ||
    !s.asks?.length
  )
    return "A healthy two-sided order book is required.";
  if (spreadPct(s) > r.maxSpread)
    return "Spread exceeds your configured limit.";
  return null;
}
export function signal(history, snapshot, r, now) {
  const wait = (reason) => ({ side: "WAIT", reason, momentum: null });
  const problem = quoteProblem(snapshot, r, now);
  if (problem) return wait(problem);
  const minute = Math.floor(now / 60000);
  const prior = history.filter((p) => p.minute < minute).slice(-5);
  if (
    prior.length !== 5 ||
    prior.some((p, i) => p.minute !== minute - 5 + i || !positive(p.mid)) ||
    new Set([...prior.map((p) => p.ledger), snapshot.ledger]).size !== 6
  )
    return wait("Warming up: six consecutive one-minute samples are required.");
  const average = prior.reduce((sum, p) => sum.plus(p.mid), D(0)).div(5);
  const momentum = D(midpoint(snapshot))
    .div(average)
    .minus(1)
    .mul(100)
    .toNumber();
  return {
    side:
      momentum >= r.threshold
        ? "BUY"
        : momentum <= -r.threshold
          ? "SELL"
          : "WAIT",
    momentum,
    reason: `Price is ${Math.abs(momentum).toFixed(3)}% ${momentum >= 0 ? "above" : "below"} the previous five-sample average.`,
  };
}
export function execute(p, s, side, r, now) {
  const problem = quoteProblem(s, r, now);
  if (problem) return { error: problem };
  if (!["BUY", "SELL"].includes(side))
    return { error: "No actionable signal." };
  if (s.ledger <= p.lastLedger)
    return { error: "This ledger has already been traded." };
  if (now - p.lastTradeAt < r.cooldown * 1000)
    return { error: "Trade cooldown is active." };
  const buy = side === "BUY",
    feeRate = D("0.001");
  let budget = D(r.orderSize);
  if (buy) {
    // Include possible price movement when bounding total position value.
    const maximumPrice = D(s.ask).mul("1.005");
    const availableQuantity = Decimal.max(
      0,
      D(r.maxPosition).div(maximumPrice).minus(p.quantity),
    );
    budget = Decimal.min(
      budget,
      D(p.cash).div(feeRate.plus(1)),
      availableQuantity.mul(s.ask),
    );
  } else budget = Decimal.min(budget, D(p.quantity).mul(s.bid));
  if (budget.lt(1))
    return {
      error: buy
        ? "Cash or position limit reached."
        : "No position available to sell.",
    };
  let quantity = D(0),
    notional = D(0);
  for (const level of buy ? s.asks : s.bids) {
    if (!positive(level.price) || !positive(level.quantity)) continue;
    const price = D(level.price);
    if (buy ? price.gt(D(s.ask).mul("1.005")) : price.lt(D(s.bid).mul("0.995")))
      break;
    const take = Decimal.min(
      level.quantity,
      budget.div(price),
      buy ? Infinity : D(p.quantity).minus(quantity),
    );
    const value = take.mul(price);
    quantity = quantity.plus(take);
    notional = notional.plus(value);
    budget = budget.minus(value);
    if (budget.lte("0.000000000001")) break;
  }
  if (notional.lt(1))
    return { error: "Insufficient funded depth within the slippage limit." };
  const fee = notional.mul(feeRate);
  const costSold = buy
    ? D(0)
    : quantity.eq(p.quantity)
      ? D(p.cost)
      : D(p.cost).div(p.quantity).mul(quantity);
  const pnl = buy ? D(0) : notional.minus(fee).minus(costSold);
  const portfolio = {
    cash: D(p.cash)
      .plus(buy ? notional.plus(fee).neg() : notional.minus(fee))
      .toString(),
    quantity: D(p.quantity)
      .plus(buy ? quantity : quantity.neg())
      .toString(),
    cost: D(p.cost)
      .plus(buy ? notional.plus(fee) : costSold.neg())
      .toString(),
    realized: D(p.realized).plus(pnl).toString(),
    fees: D(p.fees).plus(fee).toString(),
    lastTradeAt: now,
    lastLedger: s.ledger,
  };
  return {
    portfolio,
    fill: {
      side,
      quantity: quantity.toString(),
      price: notional.div(quantity).toString(),
      notional: notional.toString(),
      fee: fee.toString(),
      pnl: pnl.toString(),
      at: now,
      ledger: s.ledger,
    },
  };
}
export function valuation(p, market, now = Date.now()) {
  if (
    !market?.bid ||
    !positive(market.bid) ||
    now - market.at > 90000 ||
    market.error
  )
    return { equity: null, unrealized: null, totalPnl: null };
  const value = D(p.quantity).mul(market.bid).mul("0.999");
  return {
    equity: D(p.cash).plus(value).toString(),
    unrealized: value.minus(p.cost).toString(),
    totalPnl: D(p.cash).plus(value).minus(10000).toString(),
  };
}
