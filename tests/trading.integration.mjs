import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "../functions/node_modules/firebase-admin/lib/app/index.js";
import { getAuth } from "../functions/node_modules/firebase-admin/lib/auth/index.js";
import { getFirestore } from "../functions/node_modules/firebase-admin/lib/firestore/index.js";
import {
  Wallet,
  decode,
  hashes,
} from "../functions/node_modules/xrpl/dist/npm/index.js";
import {
  automation,
  acknowledgeBalances,
  saveSettings,
  saveReturnAddress,
  request as walletRequest,
} from "../functions/mainnet/service.js";
import {
  ensureState,
  rootRef,
  enqueue,
  takeLease,
} from "../functions/mainnet/state.js";
import { processPending, finish } from "../functions/mainnet/worker.js";
import { RLUSD, D } from "../functions/mainnet/config.js";
import { reserveCost, settleCost } from "../functions/mainnet/analyst.js";
import { tradingOwner } from "../functions/trading/access.js";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Emulators required.");
process.env.FUNCTIONS_EMULATOR = "true";
initializeApp({ projectId: "demo-irobotx" });
const auth = getAuth(),
  db = getFirestore(),
  owner = tradingOwner(),
  trader = Wallet.generate(),
  recipient = Wallet.generate();
const realFetch = global.fetch;
let frozenLine = false;
let hasLine = false,
  walletBalance = "100000000",
  tokenBalance = "100",
  metas = new Map(),
  thin = false;
let missingAccount = false,
  gap = false,
  feeHook = null;
let sequence = 10,
  submitted = new Map(),
  submits = 0,
  simulateTimeout = false,
  network = 0,
  ledgerIndex = 1000,
  hook = null;
function ledgerFetch() {
  global.fetch = async (url, opts) => {
    if (!String(url).startsWith("https://s1.ripple.com"))
      return realFetch(url, opts);
    const {
      method,
      params: [p],
    } = JSON.parse(opts.body);
    let result = {};
    const now = Math.floor(Date.now() / 1000) - 946684800;
    switch (method) {
      case "server_info":
        result = {
          info: {
            network_id: network,
            validated_ledger: {
              hash: "A".repeat(64),
              seq: ledgerIndex,
              reserve_base_xrp: 1,
              reserve_inc_xrp: 0.2,
            },
            complete_ledgers: gap ? `1002-${ledgerIndex}` : `1-${ledgerIndex}`,
          },
        };
        break;
      case "ledger":
        result = { validated: true, ledger: { close_time: now } };
        break;
      case "account_info":
        if (missingAccount) {
          result = { error: "actNotFound" };
          break;
        }
        result = {
          account_data: {
            Balance: walletBalance,
            OwnerCount: 0,
            Sequence: sequence,
            Flags: 8388608,
          },
        };
        break;
      case "account_lines":
        result = {
          lines: hasLine
            ? [
                {
                  currency: RLUSD.currency,
                  account: RLUSD.issuer,
                  freeze_peer: frozenLine,
                  balance: tokenBalance,
                  limit: "1000",
                },
              ]
            : [],
        };
        break;
      case "book_offers":
        result = {
          ledger_hash: p.ledger_hash,
          ledger_index: ledgerIndex,
          offers: thin
            ? []
            : p.taker_gets.currency === "XRP"
              ? [
                  {
                    TakerGets: "100000000",
                    TakerPays: { ...RLUSD, value: "130" },
                  },
                ]
              : [
                  {
                    TakerGets: { ...RLUSD, value: "129.99" },
                    TakerPays: "100000000",
                  },
                ],
        };
        break;
      case "fee":
        if (feeHook) await feeHook();
        result = { drops: { open_ledger_fee: "10" } };
        break;
      case "submit": {
        submits++;
        const tx = decode(p.tx_blob);
        const hash = hashes.hashSignedTx(p.tx_blob);
        const before = walletBalance,
          oldToken = tokenBalance;
        let delta = D(0),
          td = D(0);
        if (tx.TransactionType === "OfferCreate") {
          const buy = typeof tx.TakerGets === "object";
          delta = D(buy ? "7.69" : "-3");
          td = D(buy ? "-10" : "3.9");
        }
        if (tx.TransactionType === "Payment") {
          if (typeof tx.Amount === "string")
            delta = D(tx.Amount).div(1e6).neg();
          else td = D(tx.Amount.value).neg();
        }
        walletBalance = D(before).plus(delta.mul(1e6)).minus(tx.Fee).toFixed(0);
        tokenBalance = D(oldToken).plus(td).toString();
        const nodes = [
          {
            ModifiedNode: {
              LedgerEntryType: "AccountRoot",
              PreviousFields: { Balance: before },
              FinalFields: {
                Account: trader.classicAddress,
                Balance: walletBalance,
              },
            },
          },
        ];
        if (!td.eq(0))
          nodes.push({
            ModifiedNode: {
              LedgerEntryType: "RippleState",
              PreviousFields: {
                Balance: { currency: RLUSD.currency, value: oldToken },
              },
              FinalFields: {
                Balance: { currency: RLUSD.currency, value: tokenBalance },
                LowLimit: {
                  currency: RLUSD.currency,
                  issuer: trader.classicAddress,
                  value: "1000",
                },
                HighLimit: {
                  currency: RLUSD.currency,
                  issuer: RLUSD.issuer,
                  value: "0",
                },
              },
            },
          });
        metas.set(hash, {
          TransactionResult: "tesSUCCESS",
          AffectedNodes: nodes,
        });
        submitted.set(hash, tx);
        sequence++;
        if (hook) await hook();
        if (simulateTimeout) throw new Error("Network response lost.");
        result = { engine_result: "tesSUCCESS" };
        break;
      }
      case "tx": {
        const tx = submitted.get(p.transaction);
        result =
          tx && !simulateTimeout
            ? {
                validated: true,
                tx_json: { ...tx, date: now },
                ledger_index: ledgerIndex,
                meta: metas.get(p.transaction),
              }
            : { error: "txnNotFound", searched_all: !gap };
        break;
      }
      default:
        throw new Error("Unexpected mocked RPC " + method);
    }
    return { ok: true, json: async () => ({ result }) };
  };
}
async function reset() {
  await db.recursiveDelete(rootRef());
  await rootRef().set({
    network: "mainnet",
    networkId: 0,
    provisioning: "ready",
    trader: {
      address: trader.classicAddress,
      secretVersion:
        "projects/irobotxsite/secrets/XRPL_MAINNET_TRADER_SEED/versions/1",
    },
  });
  await ensureState();
  frozenLine = false;
  hasLine = false;
  walletBalance = "100000000";
  tokenBalance = "100";
  metas = new Map();
  thin = false;
  missingAccount = false;
  gap = false;
  feeHook = null;
  sequence = 10;
  submitted = new Map();
  submits = 0;
  simulateTimeout = false;
  network = 0;
  ledgerIndex = 1000;
  hook = null;
  await auth.updateUser(owner, { disabled: false });
  await db.doc(`users/${owner}`).set({ status: "active", role: "admin" });
}
async function seed(uid) {
  await auth.createUser({
    uid,
    email: `${uid}@example.com`,
    password: "Testing-password-123!",
  });
  await db.doc(`users/${uid}`).set({ status: "active", role: "admin" });
  const r = await realFetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${uid}@example.com`,
        password: "Testing-password-123!",
        returnSecureToken: true,
      }),
    },
  );
  return (await r.json()).idToken;
}
async function call(name, data, token) {
  const r = await realFetch(
    `http://127.0.0.1:5001/demo-irobotx/us-central1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ data }),
    },
  );
  return r.json();
}
const ownerToken = await seed(owner);
const other = await seed("other-admin");
test("Owner-only Mainnet API and durable engine", async (t) => {
  await t.test(
    "All callable interfaces reject anonymous and other administrator",
    async () => {
      for (const name of [
        "mainnetDashboard",
        "mainnetSettings",
        "mainnetRequest",
        "mainnetAutomation",
        "mainnetHistory",
        "mainnetReturnAddress",
        "mainnetAcknowledgeBalances",
      ]) {
        assert.equal((await call(name, {})).error.status, "UNAUTHENTICATED");
        assert.equal(
          (await call(name, {}, other)).error.status,
          "PERMISSION_DENIED",
        );
      }
    },
  );
  await t.test(
    "Browser Firestore reads and writes remain denied to the owner",
    async () => {
      const url = `http://127.0.0.1:8080/v1/projects/demo-irobotx/databases/(default)/documents/xrplMainnet/${owner}`;
      const headers = {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
      };
      assert.equal((await realFetch(url, { headers })).status, 403);
      assert.equal(
        (
          await realFetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { enabled: { booleanValue: true } },
            }),
          })
        ).status,
        403,
      );
    },
  );
  ledgerFetch();
  await t.test(
    "Duplicate requests create exactly one intent and cannot mutate action",
    async () => {
      await reset();
      await Promise.all([
        enqueue("trust", "duplicate-request"),
        enqueue("trust", "duplicate-request"),
      ]);
      assert.equal((await rootRef().collection("intents").get()).size, 1);
      await assert.rejects(() => enqueue("buy", "duplicate-request"));
    },
  );
  await t.test(
    "Overlapping workers acquire only one durable lease",
    async () => {
      await reset();
      await enqueue("trust", "lease-request");
      const leases = await Promise.all([takeLease(), takeLease()]);
      assert.equal(leases.filter(Boolean).length, 1);
    },
  );
  await t.test(
    "Trust-line setup is signed, persisted once and validated from metadata",
    async () => {
      await reset();
      await enqueue("trust", "payment-request");
      await processPending({ signer: trader, sleep: async () => {} });
      const i = (
        await rootRef().collection("intents").doc("payment-request").get()
      ).data();
      assert.equal(i.status, "validated");
      assert.equal(i.result.fee, "0.000012");
      assert.equal(i.result.xrpChange, "-0.000012");
      assert.equal(submits, 1);
      assert.ok(
        (
          await rootRef().collection("payloads").doc("payment-request").get()
        ).data().blob,
      );
      await processPending({ signer: trader });
      assert.equal(submits, 1);
    },
  );
  await t.test("Pause before submission cancels queued intent", async () => {
    await reset();
    await enqueue("trust", "pause-request");
    await automation("paused");
    await processPending({ signer: trader, sleep: async () => {} });
    assert.equal(submits, 0);
    assert.equal(
      (await rootRef().collection("intents").doc("pause-request").get()).data()
        .status,
      "cancelled",
    );
  });
  await t.test(
    "Pause after submit retains validated result and stops future work",
    async () => {
      await reset();
      await enqueue("trust", "pause-after-request");
      hook = () => automation("paused");
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(submits, 1);
      assert.equal(
        (
          await rootRef().collection("intents").doc("pause-after-request").get()
        ).data().status,
        "validated",
      );
      assert.equal((await rootRef().get()).data().enabled, false);
    },
  );
  await t.test(
    "Lost submit response remains pending; retry reconciles without another submission",
    async () => {
      await reset();
      simulateTimeout = true;
      await enqueue("trust", "timeout-request");
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(
        (
          await rootRef().collection("intents").doc("timeout-request").get()
        ).data().status,
        "pending",
      );
      simulateTimeout = false;
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(submits, 1);
      assert.equal(
        (
          await rootRef().collection("intents").doc("timeout-request").get()
        ).data().status,
        "validated",
      );
    },
  );
  await t.test(
    "Definitive expiry releases a transaction never seen on ledger",
    async () => {
      await reset();
      simulateTimeout = true;
      await enqueue("trust", "expiry-request");
      await processPending({ signer: trader, sleep: async () => {} });
      submitted.clear();
      sequence = 10;
      ledgerIndex = 1010;
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(submits, 1);
      assert.equal(
        (
          await rootRef().collection("intents").doc("expiry-request").get()
        ).data().status,
        "expired",
      );
    },
  );
  await t.test("Network mismatch never signs or submits", async () => {
    await reset();
    network = 1;
    await enqueue("trust", "network-request");
    await processPending({ signer: trader, sleep: async () => {} });
    assert.equal(submits, 0);
    assert.equal((await rootRef().collection("payloads").get()).size, 0);
  });
  await t.test("Disabled owner prevents worker execution", async () => {
    await reset();
    await enqueue("trust", "disabled-request");
    await auth.updateUser(owner, { disabled: true });
    await processPending({ signer: trader, sleep: async () => {} });
    assert.equal(submits, 0);
  });
  await t.test(
    "Actual partial sell preserves residual cost basis and prevents another buy",
    async () => {
      await reset();
      await rootRef().update({
        position: {
          quantity: "2",
          cost: "1",
          realized: "0",
          tradingFees: "0",
          setupFees: "0",
        },
        exit: { startedAt: Date.now(), attempts: 0 },
      });
      await enqueue("sell", "partial-request");
      const lease = await takeLease();
      await finish(lease, "validated", null, {
        fee: ".00001",
        tokenChange: ".49",
        tradeXrp: "-1",
        markPrice: "0.5",
        result: "tesSUCCESS",
      });
      const p = (await rootRef().get()).data().position;
      assert.equal(p.quantity, "1");
      assert.equal(p.cost, "0.5");
      assert.equal(p.realized, "-0.010005");
      await assert.rejects(() => enqueue("buy", "another-buy-request"));
    },
  );
  await t.test(
    "Crash after payload persistence resumes the same signed hash",
    async () => {
      await reset();
      await enqueue("trust", "persisted-request");
      const signed = trader.sign({
        TransactionType: "TrustSet",
        Account: trader.classicAddress,
        LimitAmount: { ...RLUSD, value: "1000" },
        Sequence: 10,
        Fee: "12",
        LastLedgerSequence: 1004,
        Flags: 0x80000000,
      });
      await rootRef()
        .collection("payloads")
        .doc("persisted-request")
        .set({ blob: signed.tx_blob });
      await rootRef().collection("intents").doc("persisted-request").update({
        status: "signing",
        hash: signed.hash,
        sequence: 10,
        firstLedger: 1000,
        lastLedger: 1004,
        quoteAt: Date.now(),
        markPrice: "0",
      });
      await processPending({ sleep: async () => {} });
      const result = (
        await rootRef().collection("intents").doc("persisted-request").get()
      ).data();
      assert.equal(result.hash, signed.hash);
      assert.equal(result.status, "validated");
      assert.equal(submits, 1);
    },
  );
  await t.test(
    "Pause during execution preparation prevents submission",
    async () => {
      await reset();
      await enqueue("trust", "inflight-pause-request");
      let count = 0;
      feeHook = async () => {
        if (++count === 2) await automation("paused");
      };
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(submits, 0);
      assert.equal(
        (
          await rootRef()
            .collection("intents")
            .doc("inflight-pause-request")
            .get()
        ).data().status,
        "cancelled",
      );
    },
  );
  await t.test("Unfunded account stops signing", async () => {
    await reset();
    await enqueue("trust", "reset-request");
    missingAccount = true;
    await processPending({ signer: trader, sleep: async () => {} });
    assert.equal(submits, 0);
    assert.match(
      (await rootRef().collection("intents").doc("reset-request").get()).data()
        .error,
      /fund/i,
    );
  });
  await t.test(
    "A gap in ledger history keeps an ambiguous transaction pending",
    async () => {
      await reset();
      simulateTimeout = true;
      await enqueue("trust", "history-gap-request");
      await processPending({ signer: trader, sleep: async () => {} });
      submitted.clear();
      sequence = 10;
      ledgerIndex = 1010;
      gap = true;
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(
        (
          await rootRef().collection("intents").doc("history-gap-request").get()
        ).data().status,
        "pending",
      );
      assert.equal(submits, 1);
    },
  );

  await t.test(
    "AI-approved buy signs correct direction and consumes approval exactly once",
    async () => {
      await reset();
      hasLine = true;
      const newsAt = Date.now();
      await rootRef().update({
        news: { at: newsAt, articles: [] },
        enabled: true,
        mode: "running",
        analysis: {
          id: "decision-123",
          newsAt,
          verdict: "allow",
          expiresAt: Date.now() + 300000,
          revision: 0,
          pair: "XRP-RLUSD",
          positionKey: "0:0",
          usedBy: null,
        },
      });
      await enqueue("buy", "mainnet-buy-123", { automatic: true });
      await processPending({ signer: trader, sleep: async () => {} });
      const c = (await rootRef().get()).data(),
        i = (
          await rootRef().collection("intents").doc("mainnet-buy-123").get()
        ).data();
      assert.equal(i.status, "validated", i.error);
      assert.equal(c.position.quantity, "7.69");
      assert.equal(c.budget.spent, "10");
      assert.equal(c.analysis.usedBy, "mainnet-buy-123");
      const tx = [...submitted.values()][0];
      assert.equal(tx.TakerGets.issuer, RLUSD.issuer);
      assert.equal(typeof tx.TakerPays, "string");
      await assert.rejects(() =>
        enqueue("buy", "another-entry-123", { automatic: true }),
      );
      await rootRef().update({
        exit: { startedAt: Date.now(), attempts: 0 },
        mode: "closing",
      });
      await enqueue("sell", "mainnet-sell-123", { automatic: true });
      await processPending({ signer: trader, sleep: async () => {} });
      const sold = (
        await rootRef().collection("intents").doc("mainnet-sell-123").get()
      ).data();
      assert.equal(sold.status, "validated", sold.error);
      assert.equal((await rootRef().get()).data().position.quantity, "4.69");
      assert.equal(submits, 2);
    },
  );
  await t.test(
    "expired AI approval and unavailable liquidity never buy",
    async () => {
      await reset();
      hasLine = true;
      const newsAt = Date.now();
      await rootRef().update({
        news: { at: newsAt, articles: [] },
        enabled: true,
        mode: "running",
        analysis: {
          id: "decision-123",
          newsAt,
          verdict: "allow",
          expiresAt: 0,
          revision: 0,
          pair: "XRP-RLUSD",
          positionKey: "0:0",
        },
      });
      await assert.rejects(() =>
        enqueue("buy", "expired-ai-buy", { automatic: true }),
      );
      await rootRef().update({ "analysis.expiresAt": Date.now() + 300000 });
      await enqueue("buy", "thin-buy-123", { automatic: true });
      thin = true;
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(submits, 0);
    },
  );
  await t.test("settings change cancels previously queued work", async () => {
    await reset();
    await enqueue("trust", "settings-request");
    await saveSettings({ analysisMinutes: 30 });
    await processPending({ signer: trader, sleep: async () => {} });
    assert.equal(submits, 0);
    assert.equal((await rootRef().get()).data().mode, "paused");
  });
  await t.test(
    "withdrawal validates saved address, recent sign-in, pause and exact action",
    async () => {
      await reset();
      await assert.rejects(() =>
        saveReturnAddress(
          { address: recipient.classicAddress, tag: null },
          { token: { auth_time: 0 } },
        ),
      );
      await saveReturnAddress(
        { address: recipient.classicAddress, tag: null },
        { token: { auth_time: Date.now() / 1000 } },
      );
      await assert.rejects(() =>
        walletRequest({
          action: "withdraw",
          requestId: "bad-withdraw-123",
          amount: "1",
          currency: "XRP",
          destination: trader.classicAddress,
        }),
      );
      await walletRequest({
        action: "withdraw",
        requestId: "withdraw-good-123",
        amount: "1",
        currency: "XRP",
      });
      await processPending({ signer: trader, sleep: async () => {} });
      const i = (
        await rootRef().collection("intents").doc("withdraw-good-123").get()
      ).data();
      assert.equal(i.status, "validated", i.error);
      assert.equal(
        [...submitted.values()][0].Destination,
        recipient.classicAddress,
      );
      assert.equal((await rootRef().get()).data().position.realized, "0");
    },
  );
  await t.test(
    "concurrent AI reservations cannot overbook budget and settlement is idempotent",
    async () => {
      await reset();
      await rootRef().update({ "settings.aiBudget": ".30" });
      const all = await Promise.allSettled([
        reserveCost(".20"),
        reserveCost(".20"),
      ]);
      assert.equal(all.filter((r) => r.status === "fulfilled").length, 1);
      const reservation = all.find((r) => r.status === "fulfilled").value;
      await settleCost(reservation, {
        usage: { input_tokens: 1000, output_tokens: 100 },
        output: [],
      });
      await settleCost(reservation, {
        usage: { input_tokens: 1000, output_tokens: 100 },
        output: [],
      });
      assert.equal((await rootRef().get()).data().aiUsage.spent, "0.0037");
    },
  );
  await t.test(
    "explicit close can resolve a tracked position after an external deposit",
    async () => {
      await reset();
      hasLine = true;
      await rootRef().update({
        position: {
          quantity: "3",
          cost: "3.9",
          realized: "0",
          tradingFees: "0",
          setupFees: "0",
        },
        discrepancy: { reason: "external deposit" },
        expected: { xrp: "99", rlusd: "100", ledger: 1000 },
      });
      await automation("closing");
      await enqueue("sell", "close-after-deposit", { automatic: true });
      await processPending({ signer: trader, sleep: async () => {} });
      const i = (
        await rootRef().collection("intents").doc("close-after-deposit").get()
      ).data();
      assert.equal(i.status, "validated", i.error);
      assert.equal((await rootRef().get()).data().mode, "paused");
      await acknowledgeBalances();
      assert.equal((await rootRef().get()).data().discrepancy, null);
    },
  );
  await t.test(
    "frozen RLUSD cannot prevent a native XRP withdrawal",
    async () => {
      await reset();
      hasLine = true;
      frozenLine = true;
      await saveReturnAddress(
        { address: recipient.classicAddress, tag: null },
        { token: { auth_time: Date.now() / 1000 } },
      );
      await walletRequest({
        action: "withdraw",
        requestId: "native-frozen-123",
        amount: "1",
        currency: "XRP",
      });
      await processPending({ signer: trader, sleep: async () => {} });
      const i = (
        await rootRef().collection("intents").doc("native-frozen-123").get()
      ).data();
      assert.equal(i.status, "validated", i.error);
      await walletRequest({
        action: "withdraw",
        requestId: "issued-frozen-123",
        amount: "1",
        currency: "RLUSD",
      });
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(submits, 1);
      assert.match(
        (
          await rootRef().collection("intents").doc("issued-frozen-123").get()
        ).data().error,
        /frozen/,
      );
    },
  );
  global.fetch = realFetch;
});
