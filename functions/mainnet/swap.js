import { D, RLUSD } from "./config.js";
import { balanceGuard, drops, issued } from "./ledger.js";

export function swapInput(currency, amount) {
  if (
    !["XRP", "RLUSD"].includes(currency) ||
    !/^\d{1,9}(\.\d{1,6})?$/.test(String(amount)) ||
    D(amount).lte(0)
  )
    throw new Error(
      "Enter a positive swap amount with up to six decimal places.",
    );
  return { currency, amount: D(amount).toString() };
}

export function swapAllowed(c) {
  if (c.mode !== "paused" || c.enabled || D(c.position.quantity).gt(0))
    throw new Error(
      "Pause automation and close the trading position before swapping.",
    );
  if (c.discrepancy || !c.expected)
    throw new Error("Acknowledge current balances before requesting a swap.");
}

// All values originate in a server-created quote. Never accept client prices.
export function prepareSwap(c, input, m, w, line, fee, now = Date.now()) {
  swapAllowed(c);
  const { currency, amount } = swapInput(input.currency, input.amount);
  if (
    input.validUntil !== undefined &&
    (input.validUntil <= now || input.revision !== c.revision)
  )
    throw new Error(
      "Swap quote expired or settings changed. Request a new quote.",
    );
  const sellXrp = currency === "XRP",
    spend = D(amount);
  balanceGuard(w, sellXrp ? spend : 0, fee);
  if (!sellXrp && D(line.balance).lt(spend))
    throw new Error("Insufficient RLUSD for this swap.");
  const movement = D(c.settings.movement).div(100);
  const boundary = sellXrp
    ? D(m.bid).mul(D(1).minus(movement))
    : D(m.ask).mul(D(1).plus(movement));
  const rawMinimum = sellXrp ? spend.mul(boundary) : spend.div(boundary);
  // Set the bound once when quoting. Rechecks preserve the owner's confirmed
  // minimum exactly; repricing it could reject a signed order when prices improve.
  // Current spread, funded depth, balances, expiry and reserves are still checked.
  const minimum =
    input.minimum !== undefined
      ? D(input.minimum)
      : sellXrp
        ? rawMinimum.toSignificantDigits(16, 2)
        : rawMinimum.mul(1e6).ceil().div(1e6);
  const limit = sellXrp ? minimum.div(spend) : spend.div(minimum);
  let remaining = spend,
    estimate = D(0);
  for (const level of sellXrp ? m.bids : m.asks) {
    const price = D(level.price);
    if (sellXrp ? price.lt(limit) : price.gt(limit)) break;
    const capacity = D(sellXrp ? level.quantity : level.value);
    const used = remaining.lt(capacity) ? remaining : capacity;
    estimate = estimate.plus(sellXrp ? used.mul(price) : used.div(price));
    remaining = remaining.minus(used);
    if (remaining.eq(0)) break;
  }
  if (remaining.gt(0))
    throw new Error(
      "Insufficient liquidity within the swap price limit. Try a smaller amount.",
    );
  if (sellXrp && D(line.limit).minus(line.balance).lt(spend.mul(m.bid)))
    throw new Error(
      "RLUSD trust line has insufficient capacity for this swap.",
    );
  const swap = {
    currency,
    amount,
    receiveCurrency: sellXrp ? "RLUSD" : "XRP",
    minimum: minimum.toString(),
    estimate: sellXrp
      ? issued(estimate)
      : D(drops(estimate)).div(1e6).toString(),
    movement: c.settings.movement,
    maxFee: "0.01",
    revision: c.revision,
    validUntil: input.validUntil ?? now + 60000,
  };
  return {
    swap,
    order: {
      TransactionType: "OfferCreate",
      // Fully spend the input or cancel; never leave an order on the book.
      Flags: 0x800c0000,
      TakerGets: sellXrp ? drops(spend) : { ...RLUSD, value: issued(spend) },
      TakerPays: sellXrp
        ? { ...RLUSD, value: minimum.toString() }
        : drops(minimum),
    },
  };
}
