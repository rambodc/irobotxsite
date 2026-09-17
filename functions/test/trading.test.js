import test from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import {
  asset,
  makePair,
  defaultPair,
  RLUSD,
  DEFAULT_RULES as r,
  rules,
  bookLevels,
  signal,
  execute,
  emptyPortfolio,
  valuation,
} from "../trading/engine.js";
import { canTrade, miniApps, tradingOwner } from "../trading/access.js";
const at = 1800000000000;
const snapshot = (extra = {}) => ({
  at,
  ledger: 100,
  bid: "1.99",
  ask: "2",
  bids: [{ price: "1.99", quantity: "1000" }],
  asks: [{ price: "2", quantity: "1000" }],
  ...extra,
});
const history = (mid = "1.98") =>
  Array.from({ length: 5 }, (_, i) => ({
    minute: Math.floor(at / 60000) - 5 + i,
    ledger: 95 + i,
    mid,
  }));
test("owner-only access does not extend to other administrators", () => {
  assert.ok(canTrade(tradingOwner(), { status: "active" }));
  assert.equal(canTrade("other", { status: "active", role: "admin" }), false);
  assert.equal(canTrade(tradingOwner(), { status: "disabled" }), false);
  assert.ok(
    !miniApps("other", { status: "active", role: "admin" }).includes("trading"),
  );
});
test("token identity validates checksum, preserves case and encodes RLUSD correctly", () => {
  assert.equal(RLUSD.currency.length, 40);
  assert.deepEqual(asset({ currency: "RLUSD", issuer: RLUSD.issuer }), RLUSD);
  assert.throws(() => asset({ currency: "USD", issuer: "rInvalid" }));
  assert.throws(() =>
    asset({ currency: "0".repeat(40), issuer: RLUSD.issuer }),
  );
  assert.notEqual(
    makePair({ currency: "usd", issuer: RLUSD.issuer }, "XRP").id,
    makePair({ currency: "USD", issuer: RLUSD.issuer }, "XRP").id,
  );
  assert.throws(() => makePair({ currency: "XRP" }, "XRP"));
  assert.throws(() => makePair({ currency: "XRP" }, "USD"));
});
test("strategy bounds reject non-finite, unknown and inconsistent values", () => {
  assert.deepEqual(rules(r), r);
  for (const bad of [
    { ...r, orderSize: NaN },
    { ...r, maxPosition: 50 },
    { ...r, cooldown: 0 },
    { ...r, unexpected: true },
  ])
    assert.throws(() => rules(bad));
});
test("funded books convert XRP drops and both directions correctly", () => {
  const pair = defaultPair();
  const token = (value) => ({ ...RLUSD, value });
  const asks = bookLevels(
    [
      {
        TakerGets: "100000000",
        TakerPays: token("200"),
        taker_gets_funded: "10000000",
        taker_pays_funded: token("20"),
      },
    ],
    pair,
    "ask",
  );
  assert.deepEqual(asks, [{ price: "2", quantity: "10" }]);
  assert.deepEqual(
    bookLevels(
      [{ TakerGets: token("200"), TakerPays: "100000000" }],
      pair,
      "bid",
    ),
    [{ price: "2", quantity: "100" }],
  );
  assert.deepEqual(
    bookLevels(
      [
        {
          TakerGets: "1",
          TakerPays: { currency: "USD", issuer: RLUSD.issuer, value: "1" },
        },
      ],
      pair,
      "ask",
    ),
    [],
  );
});
test("six consecutive samples produce buy, sell and wait explanations", () => {
  assert.equal(signal(history("1.98"), snapshot(), r, at).side, "WAIT");
  const tight = snapshot({ bid: "1.998" });
  assert.equal(signal(history("1.98"), tight, r, at).side, "BUY");
  assert.equal(signal(history("2.1"), tight, r, at).side, "SELL");
  assert.equal(signal(history("1.999"), tight, r, at).side, "WAIT");
});
test("missing minute, duplicate ledger, stale quote and crossed market fail closed", () => {
  const h = history();
  h[2].minute--;
  assert.equal(signal(h, snapshot({ bid: "1.998" }), r, at).side, "WAIT");
  const duplicate = history();
  duplicate[4].ledger = 100;
  assert.match(
    signal(duplicate, snapshot({ bid: "1.998" }), r, at).reason,
    /Warming/,
  );
  for (const s of [
    snapshot({ at: at - 31000 }),
    snapshot({ bid: "3" }),
    snapshot({ bids: [] }),
    snapshot({ bid: "0" }),
  ])
    assert.equal(signal(history(), s, r, at).side, "WAIT");
});
test("paper buys fill funded depth, charge fees and preserve exact cost", () => {
  const result = execute(
    emptyPortfolio(),
    snapshot({ bid: "1.998" }),
    "BUY",
    r,
    at,
  );
  assert.equal(result.portfolio.cash, "9899.9");
  assert.equal(result.portfolio.quantity, "50");
  assert.equal(result.portfolio.cost, "100.1");
  assert.equal(result.fill.fee, "0.1");
});
test("round trip realizes cost basis and never shorts", () => {
  const bought = execute(
    emptyPortfolio(),
    snapshot({ bid: "1.998" }),
    "BUY",
    r,
    at,
  ).portfolio;
  const next = snapshot({
    at: at + 60000,
    ledger: 101,
    bid: "2.2",
    ask: "2.201",
    bids: [{ price: "2.2", quantity: "1000" }],
  });
  const sold = execute(
    bought,
    next,
    "SELL",
    { ...r, orderSize: 1000 },
    at + 60000,
  );
  assert.equal(sold.portfolio.quantity, "0");
  assert.equal(sold.portfolio.cost, "0");
  assert.equal(sold.portfolio.realized, "9.79");
  assert.equal(sold.portfolio.cash, "10009.79");
  assert.match(
    execute(emptyPortfolio(), snapshot({ bid: "1.998" }), "SELL", r, at).error,
    /No position/,
  );
});
test("partial fills and slippage cutoff never invent liquidity", () => {
  const s = snapshot({
    bid: "1.998",
    asks: [
      { price: "2", quantity: "2" },
      { price: "2.1", quantity: "999" },
    ],
  });
  const result = execute(emptyPortfolio(), s, "BUY", r, at);
  assert.equal(result.fill.quantity, "2");
  assert.equal(result.fill.notional, "4");
  assert.equal(result.portfolio.cash, "9995.996");
});
test("insufficient cash, positions, cooldown and replay protect balances", () => {
  const s = snapshot({ bid: "1.998" }),
    p = emptyPortfolio();
  assert.ok(execute({ ...p, cash: "0.5" }, s, "BUY", r, at).error);
  assert.ok(execute({ ...p, quantity: "1000" }, s, "BUY", r, at).error);
  assert.ok(execute({ ...p, lastTradeAt: at - 1000 }, s, "BUY", r, at).error);
  assert.ok(execute({ ...p, lastLedger: 100 }, s, "BUY", r, at).error);
  const small = execute({ ...p, cash: "50" }, s, "BUY", r, at);
  assert.ok(new Decimal(small.portfolio.cash).gte(0));
  assert.ok(
    new Decimal(small.portfolio.quantity).mul("2.01").lte(r.maxPosition),
  );
});
test("stale and unavailable valuations show unknown instead of false zero", () => {
  const p = {
    ...emptyPortfolio(),
    cash: "9899.9",
    quantity: "50",
    cost: "100.1",
  };
  assert.equal(valuation(p, snapshot({ bid: "2.2" }), at).totalPnl, "9.79");
  assert.equal(valuation(p, snapshot(), at + 91000).equity, null);
  assert.equal(valuation(p, { error: "offline" }, at).unrealized, null);
});
