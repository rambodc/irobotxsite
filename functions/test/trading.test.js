import test from "node:test";
import assert from "node:assert/strict";
import {
  assetValid,
  assertNetwork,
  balanceGuard,
  covered,
  drops,
  issued,
  issuerAllowed,
  levels,
  checkBook,
  actualResult,
} from "../testnet/ledger.js";
import { publicIntent } from "../testnet/service.js";
const asset = { currency: "USD", issuer: "rg2MAgwqwmV9TgMexVBpRDK89vMyJkpbC" };
test("Testnet network must be positively identified", () => {
  assert.doesNotThrow(() => assertNetwork({ network_id: 1 }));
  for (const network_id of [0, 2, undefined, "1"])
    assert.throws(() => assertNetwork({ network_id }));
});
test("Asset identity rejects native XRP and invalid issuer", () => {
  assert.ok(assetValid(asset));
  assert.ok(!assetValid({ ...asset, currency: "XRP" }));
  assert.ok(!assetValid({ ...asset, issuer: "rNotAnAddress" }));
});
test("Decimal XRP conversion and bounded issued precision", () => {
  assert.equal(drops("1.0000019"), "1000001");
  assert.equal(issued("1.2345678901234567"), "1.23456789012345");
});
test("Reserve buffer and fee cap", () => {
  const w = { funded: true, available: "6.000012" };
  balanceGuard(w, "1", "12");
  assert.throws(() => balanceGuard(w, "1", "13"));
  assert.throws(() => balanceGuard(w, "0", "10001"));
  assert.throws(() => balanceGuard(w, "1", "12", ".2"));
  assert.throws(() => balanceGuard({ funded: false }, 0, 12));
});
test("Issuer authorization, freeze, clawback and transfer fee restrictions", () => {
  issuerAllowed({ Flags: 8388608, TransferRate: 1000000000 });
  for (const Flags of [0x40000, 0x400000, 0x80000000])
    assert.throws(() => issuerAllowed({ Flags }));
  assert.throws(() => issuerAllowed({ Flags: 0, TransferRate: 1001000000 }));
});
test("Books use funded amounts, correct direction and issuer", () => {
  const offers = [
    {
      TakerGets: { ...asset, value: "100" },
      TakerPays: "50000000",
      taker_gets_funded: { ...asset, value: "2" },
      taker_pays_funded: "1000000",
    },
  ];
  assert.deepEqual(levels(offers, "ask", asset), [
    { quantity: "2", price: "0.5", xrp: "1" },
  ]);
  assert.equal(levels(offers, "bid", asset).length, 0);
  assert.equal(levels(offers, "ask", { ...asset, issuer: "other" }).length, 0);
});
test("Reject one-sided, crossed, wide and thin books", () => {
  const ask = { price: "1", quantity: "100", xrp: "100" },
    bid = { price: ".999", quantity: "100", xrp: "99.9" };
  assert.ok(checkBook({ asks: [ask], bids: [bid] }));
  assert.throws(() => checkBook({ asks: [], bids: [bid] }));
  assert.throws(() =>
    checkBook({ asks: [ask], bids: [{ ...bid, price: "2" }] }),
  );
  assert.throws(() =>
    checkBook({ asks: [ask], bids: [{ ...bid, price: ".9" }] }),
  );
  assert.throws(() =>
    checkBook({ asks: [{ ...ask, xrp: ".5" }], bids: [bid] }),
  );
  assert.throws(() => checkBook({ asks: [ask], bids: [bid] }, "101"));
});
test("Expiry requires continuous history covering the whole interval", () => {
  assert.ok(covered("1-20,25-30", 2, 18));
  assert.ok(!covered("1-20,25-30", 18, 28));
  assert.ok(!covered("25-30", 1, 20));
});
test("Public intent strips payloads, seeds and internal fields", () => {
  const output = publicIntent("x", {
    action: "buy",
    status: "queued",
    blob: "secret",
    seed: "secret",
    secretVersion: "hidden",
    revision: 4,
  });
  assert.deepEqual(output, { id: "x", action: "buy", status: "queued" });
});
test("Nonvalidated response is never successful", () => {
  assert.throws(() => actualResult({ validated: false, meta: {} }, "r"));
});
