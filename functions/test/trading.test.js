import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  settings,
  initialState,
  RLUSD,
  D,
} from "../mainnet/config.js";
import {
  assertNetwork,
  ledger,
  balanceGuard,
  drops,
  issued,
  issuerAllowed,
  levels,
  checkBook,
  trustLine,
  covered,
  actualResult,
} from "../mainnet/ledger.js";
import {
  averages,
  evaluate,
  approvalValid,
  accountFill,
} from "../mainnet/strategy.js";
import { publicIntent } from "../mainnet/state.js";
import { verifyFresh } from "../mainnet/execution.js";
import {
  validateAnalysis,
  validateNews,
  approvedURL,
} from "../mainnet/analyst.js";
import { recentAuth } from "../mainnet/service.js";
const samples = (now = Date.now()) =>
  Array.from({ length: 60 }, (_, i) => ({
    slot: Math.floor(now / 60000) - 59 + i,
    at: now - (59 - i) * 60000,
    mid: i >= 40 ? "1.31" : "1.30",
  }));
test("network must positively identify Mainnet", () => {
  assertNetwork({ network_id: 0 });
  for (const network_id of [1, 2, undefined, "0"])
    assert.throws(() => assertNetwork({ network_id }));
});
test("settings reject invalid limits, unknown pairs and extra fields", () => {
  assert.deepEqual(settings(DEFAULTS), DEFAULTS);
  for (const patch of [
    { pair: "XRP-FAKE" },
    { purchase: "51" },
    { analysisMinutes: 4 },
    { newsMinutes: 1441 },
    { spread: "1.1" },
    { movement: "0" },
    { aiBudget: "NaN" },
    { stopLoss: "101" },
    { purchase: "-1" },
    { privateKey: "x" },
  ])
    assert.throws(() => settings({ ...DEFAULTS, ...patch }));
});
test("XRP conversion, issued precision and fee/reserve bounds", () => {
  assert.equal(drops("1.0000019"), "1000001");
  assert.equal(issued("1.2345678901234567"), "1.234567890123456");
  balanceGuard({ funded: true, available: "6.000012" }, 1, 12);
  for (const fee of [13, 10001])
    assert.throws(() =>
      balanceGuard({ funded: true, available: "6.000012" }, 1, fee),
    );
});
test("RLUSD clawback allowed; authorization, freezes and fees rejected", () => {
  issuerAllowed({ Flags: 0x80000000, TransferRate: 1000000000 });
  for (const Flags of [0x40000, 0x400000])
    assert.throws(() => issuerAllowed({ Flags }));
  assert.throws(() => issuerAllowed({ Flags: 0, TransferRate: 1000000001 }));
  for (const field of [
    "freeze",
    "freeze_peer",
    "deep_freeze",
    "deep_freeze_peer",
  ])
    assert.throws(() =>
      trustLine({
        lines: [
          { currency: RLUSD.currency, account: RLUSD.issuer, [field]: true },
        ],
      }),
    );
});
test("funded native/issued book direction and issuer identity", () => {
  const ask = {
    TakerGets: "10000000",
    TakerPays: { ...RLUSD, value: "13" },
    taker_gets_funded: "2000000",
    taker_pays_funded: { ...RLUSD, value: "2.6" },
  };
  assert.deepEqual(levels([ask], "ask"), [
    { price: "1.3", quantity: "2", value: "2.6" },
  ]);
  assert.equal(levels([ask], "bid").length, 0);
  assert.equal(
    levels(
      [{ ...ask, TakerPays: { ...RLUSD, issuer: "wrong", value: "13" } }],
      "ask",
    ).length,
    0,
  );
});
test("book rejects one-sided/crossed and marks wide spread ineligible", () => {
  const m = {
    asks: [{ price: "1.3", quantity: "10", value: "13" }],
    bids: [{ price: "1.299", quantity: "10", value: "12.99" }],
  };
  assert.ok(checkBook(m, DEFAULTS).eligible);
  assert.throws(() => checkBook({ ...m, asks: [] }, DEFAULTS));
  assert.throws(() => checkBook({ ...m, bids: [{ price: "2" }] }, DEFAULTS));
  assert.equal(
    checkBook({ ...m, bids: [{ price: "1", quantity: "10" }] }, DEFAULTS)
      .eligible,
    false,
  );
});
test("60 fresh consecutive samples and trend thresholds", () => {
  const now = Date.now(),
    s = samples(now);
  assert.ok(averages(s, now));
  assert.equal(averages(s.slice(1), now), null);
  s[15].slot++;
  assert.equal(averages(s, now), null);
  assert.equal(averages(samples(now - 120000), now), null);
  const c = initialState();
  assert.equal(
    evaluate(c, samples(now), { bid: "1.3", ask: "1.31" }, now).action,
    "WAIT",
  );
  const rising = samples(now);
  rising[59].mid = "1.32";
  assert.equal(
    evaluate(c, rising, { bid: "1.3", ask: "1.31" }, now).action,
    "BUY",
  );
});
test("protective exits work without AI or trend warmup; cooldown prevents buys", () => {
  const c = initialState();
  c.position = { ...c.position, quantity: "10", cost: "13" };
  assert.equal(evaluate(c, [], { bid: "1.2", ask: "1.21" }).action, "SELL");
  assert.equal(evaluate(c, [], { bid: "1.4", ask: "1.41" }).action, "SELL");
  const flat = initialState();
  flat.cooldownUntil = Date.now() + 100000;
  assert.match(
    evaluate(flat, samples(), { bid: "1.3", ask: "1.31" }).reason,
    /cooldown/,
  );
});
test("daily loss uses realized plus marked position and latches", () => {
  const c = initialState();
  c.position.realized = "-6";
  c.daily = {
    day: new Date().toISOString().slice(0, 10),
    baseline: "0",
    stoppedDay: null,
  };
  assert.equal(evaluate(c, [], { bid: "1.3", ask: "1.31" }).action, "STOP");
});
test("AI permission is single-use, revision/position bound and expiring", () => {
  const c = { ...initialState(), news: { at: Date.now() } },
    a = {
      newsAt: c.news.at,
      verdict: "allow",
      expiresAt: Date.now() + 10000,
      revision: 0,
      pair: "XRP-RLUSD",
      positionKey: "0:0",
    };
  assert.ok(approvalValid(a, c));
  for (const p of [
    { usedBy: "intent" },
    { revision: 1 },
    { positionKey: "1:2" },
    { expiresAt: 0 },
    { verdict: "block" },
    { newsAt: 0 },
  ])
    assert.ok(!approvalValid({ ...a, ...p }, c));
  assert.ok(!approvalValid(a, { ...c, news: null }));
});
test("actual partial fills preserve cost basis; transfer costs excluded", () => {
  let p = initialState().position;
  p = accountFill(p, "buy", {
    fee: ".000012",
    markPrice: "1.3",
    tradeXrp: "10",
    tokenChange: "-13",
  });
  assert.equal(p.quantity, "10");
  assert.equal(p.cost, "13.0000156");
  p = accountFill(p, "sell", {
    fee: ".000012",
    markPrice: "1.4",
    tradeXrp: "-4",
    tokenChange: "5.6",
  });
  assert.equal(p.quantity, "6");
  assert.equal(p.cost, "7.80000936");
  assert.equal(p.realized, "0.39997696");
  const realized = p.realized;
  p = accountFill(p, "withdraw", { fee: ".000012", markPrice: "0" });
  assert.equal(p.realized, realized);
});
test("payload and secret fields never enter public intent", () => {
  const p = publicIntent("id", {
    action: "buy",
    blob: "secret",
    secretVersion: "secret",
    hash: "public",
    beforeBalance: "10",
  });
  assert.deepEqual(p, { id: "id", action: "buy", hash: "public" });
});
test("fresh quote bounds preserve order direction", () => {
  const buy = {
    TransactionType: "OfferCreate",
    Sequence: 1,
    Fee: "12",
    TakerGets: { ...RLUSD, value: "10" },
    TakerPays: "7000000",
  };
  assert.throws(() => verifyFresh(buy, { ...buy, TakerPays: "8000000" }));
  verifyFresh(buy, { ...buy, TakerPays: "6000000" });
  const sell = {
    ...buy,
    TakerGets: "7000000",
    TakerPays: { ...RLUSD, value: "10" },
  };
  assert.throws(() =>
    verifyFresh(sell, { ...sell, TakerPays: { ...RLUSD, value: "11" } }),
  );
});
test("news filters unknown URLs, dates, duplicate sources and malicious hostnames", () => {
  assert.ok(!approvedURL("https://ripple.com.evil.test/x"));
  const url = "https://ripple.com/news/item",
    at = new Date().toISOString();
  assert.equal(
    validateNews(
      [
        { url, title: "News", summary: "data", publishedAt: at },
        { url, title: "Duplicate", summary: "data", publishedAt: at },
      ],
      new Set([url]),
    ).length,
    1,
  );
  assert.equal(
    validateNews(
      [{ url, title: "Old", summary: "data", publishedAt: "2000-01-01" }],
      new Set([url]),
    ).length,
    0,
  );
  assert.throws(() =>
    validateAnalysis(
      { verdict: "allow", reason: "go", sources: ["https://fake.test"] },
      [],
    ),
  );
  assert.throws(() =>
    validateAnalysis({ verdict: "BUY", reason: "go", sources: [] }, []),
  );
});
test("recent authentication and continuous expiry evidence", () => {
  recentAuth({ token: { auth_time: Date.now() / 1000 } });
  assert.throws(() => recentAuth({ token: { auth_time: 0 } }));
  assert.ok(covered("1-1000", 50, 500));
  assert.ok(!covered("1-49,51-1000", 40, 60));
});
test("only validated ledger metadata can produce a fill", () => {
  assert.throws(() => actualResult({ validated: false }, "r", RLUSD));
  assert.ok(D("0.000001").mul(1e6).eq(1));
});

test("stale validated ledger is rejected before execution", async () => {
  const original = global.fetch;
  global.fetch = async (_url, opts) => ({
    ok: true,
    json: async () =>
      JSON.parse(opts.body).method === "server_info"
        ? {
            result: {
              info: {
                network_id: 0,
                validated_ledger: {
                  hash: "A".repeat(64),
                  seq: 10,
                  reserve_base_xrp: 1,
                  reserve_inc_xrp: 0.2,
                },
              },
            },
          }
        : {
            result: {
              validated: true,
              ledger: {
                close_time: Math.floor(Date.now() / 1000) - 946684800 - 120,
              },
            },
          },
  });
  try {
    await assert.rejects(() => ledger(), /stale/);
  } finally {
    global.fetch = original;
  }
});
