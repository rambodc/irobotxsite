import test from "node:test";
import assert from "node:assert/strict";
import { initialState, D, RLUSD } from "../mainnet/config.js";
import { prepareSwap, swapInput } from "../mainnet/swap.js";
import { verifyFresh } from "../mainnet/execution.js";
import { accountFill } from "../mainnet/strategy.js";
const state = () => ({
  ...initialState(),
  expected: { xrp: "30", rlusd: "50" },
});
const market = {
  bid: "2",
  ask: "2.005",
  bids: [{ price: "2", quantity: "100", value: "200" }],
  asks: [{ price: "2.005", quantity: "100", value: "200.5" }],
};
const wallet = { funded: true, available: "28.8" };
const line = { balance: "50", limit: "1000" };
const quote = (input, c = state(), m = market, w = wallet, l = line) =>
  prepareSwap(c, input, m, w, l, "12", 1000);
test("XRP swap spends exact input with FOK and an upward-rounded minimum", () => {
  const { swap, order } = quote({ currency: "XRP", amount: "10" });
  assert.equal(swap.estimate, "20");
  assert.equal(swap.minimum, "19.9");
  assert.equal(order.TakerGets, "10000000");
  assert.deepEqual(order.TakerPays, { ...RLUSD, value: "19.9" });
  assert.equal(order.Flags, 0x800c0000);
});
test("RLUSD swap never rounds native minimum down", () => {
  const { swap, order } = quote({ currency: "RLUSD", amount: "10" });
  assert.equal(order.TakerGets.value, "10");
  assert.ok(D(swap.minimum).gte(D(10).div(D("2.005").mul("1.005"))));
  assert.equal(order.TakerPays, D(swap.minimum).mul(1e6).toFixed(0));
});
test("invalid amounts and unsupported assets are rejected", () => {
  for (const value of ["0", "-1", "NaN", "Infinity", "0.0000001", "1e2"])
    assert.throws(() => swapInput("XRP", value));
  assert.throws(() => swapInput("USD", "10"));
});
test("swaps preserve reserves, buffer, RLUSD balance and trust capacity", () => {
  assert.throws(() => quote({ currency: "XRP", amount: "24" }), /buffer/);
  assert.throws(
    () => quote({ currency: "RLUSD", amount: "51" }),
    /Insufficient RLUSD/,
  );
  assert.throws(
    () =>
      quote({ currency: "XRP", amount: "10" }, state(), market, wallet, {
        balance: "990",
        limit: "1000",
      }),
    /capacity/,
  );
});
test("swaps block running automation, bot holdings, unreviewed balances and stale quotes", () => {
  for (const patch of [
    { enabled: true },
    { mode: "running" },
    { position: { quantity: "1" } },
    { discrepancy: {} },
    { expected: null },
  ])
    assert.throws(() =>
      quote({ currency: "XRP", amount: "10" }, { ...state(), ...patch }),
    );
  assert.throws(
    () =>
      quote({ currency: "XRP", amount: "10", revision: 0, validUntil: 999 }),
    /expired/,
  );
  assert.throws(
    () =>
      quote({ currency: "XRP", amount: "10", revision: 2, validUntil: 2000 }),
    /changed/,
  );
});
test("full input must fit funded liquidity inside the confirmed price limit", () => {
  assert.throws(
    () =>
      quote({ currency: "XRP", amount: "10" }, state(), {
        ...market,
        bids: [
          { price: "2", quantity: "3", value: "6" },
          { price: "1.98", quantity: "100", value: "198" },
        ],
      }),
    /liquidity/,
  );
  assert.throws(
    () => quote({ currency: "XRP", amount: "10", minimum: "20.1" }),
    /liquidity/,
  );
  const { swap } = quote({ currency: "XRP", amount: "10", minimum: "20" });
  assert.equal(swap.minimum, "20");
});
test("manual swap fills and fees stay outside automated position and P/L", () => {
  const original = state().position;
  const next = accountFill(original, "swap", {
    fee: "0.000012",
    markPrice: "2",
    tradeXrp: "-10",
    tokenChange: "20",
  });
  assert.deepEqual(next, { ...original, setupFees: "0.000012" });
});

for (const currency of ["XRP", "RLUSD"]) {
  test(`${currency} swap preserves its confirmed minimum through favorable and adverse movement`, () => {
    const original = quote({ currency, amount: "10" });
    const signed = { ...original.order, Sequence: 1, Fee: "12" };
    for (const factor of ["1.002", "0.998"]) {
      const moved = {
        bid: D(market.bid).mul(factor).toString(),
        ask: D(market.ask).mul(factor).toString(),
        bids: market.bids.map((l) => ({
          ...l,
          price: D(l.price).mul(factor).toString(),
          value: D(l.value).mul(factor).toString(),
        })),
        asks: market.asks.map((l) => ({
          ...l,
          price: D(l.price).mul(factor).toString(),
          value: D(l.value).mul(factor).toString(),
        })),
      };
      const fresh = quote(original.swap, state(), moved);
      assert.equal(fresh.swap.minimum, original.swap.minimum);
      assert.deepEqual(fresh.order, original.order);
      assert.doesNotThrow(() =>
        verifyFresh(signed, { ...fresh.order, Sequence: 1, Fee: "12" }),
      );
    }
    const unfavorable = currency === "XRP" ? "0.98" : "1.02";
    const tooFar = {
      ...market,
      bids: market.bids.map((l) => ({
        ...l,
        price: D(l.price).mul(unfavorable).toString(),
      })),
      asks: market.asks.map((l) => ({
        ...l,
        price: D(l.price).mul(unfavorable).toString(),
      })),
    };
    assert.throws(() => quote(original.swap, state(), tooFar), /liquidity/);
  });
}
