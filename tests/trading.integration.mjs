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
  ensureState,
  rootRef,
  enqueue,
  automation,
  processPending,
  takeLease,
  finish,
} from "../functions/testnet/service.js";
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
let missingAccount = false,
  gap = false,
  feeHook = null;
let sequence = 10,
  submitted = new Map(),
  submits = 0,
  simulateTimeout = false,
  network = 1,
  ledgerIndex = 1000,
  hook = null;
function ledgerFetch() {
  global.fetch = async (url, opts) => {
    if (!String(url).startsWith("https://s.altnet."))
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
            complete_ledgers: gap ? `999-${ledgerIndex}` : `1-${ledgerIndex}`,
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
            Balance: "100000000",
            OwnerCount: 0,
            Sequence: sequence,
            Flags: 8388608,
          },
        };
        break;
      case "account_lines":
        result = { lines: [] };
        break;
      case "fee":
        if (feeHook) await feeHook();
        result = { drops: { open_ledger_fee: "10" } };
        break;
      case "submit": {
        submits++;
        const tx = decode(p.tx_blob);
        const hash = hashes.hashSignedTx(p.tx_blob);
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
                meta: {
                  TransactionResult: "tesSUCCESS",
                  AffectedNodes: [
                    {
                      ModifiedNode: {
                        LedgerEntryType: "AccountRoot",
                        PreviousFields: { Balance: "100000000" },
                        FinalFields: {
                          Account: trader.classicAddress,
                          Balance: "98999988",
                        },
                      },
                    },
                  ],
                },
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
    network: "testnet",
    networkId: 1,
    provisioning: "ready",
    trader: {
      address: trader.classicAddress,
      secretVersion:
        "projects/irobotxsite/secrets/XRPL_TESTNET_TRADER_SEED/versions/1",
    },
    receiver: { address: recipient.classicAddress },
  });
  await ensureState();
  missingAccount = false;
  gap = false;
  feeHook = null;
  sequence = 10;
  submitted = new Map();
  submits = 0;
  simulateTimeout = false;
  network = 1;
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
await seed(owner);
const other = await seed("other-admin");
test("Owner-only Testnet API and durable engine", async (t) => {
  await t.test(
    "All callable interfaces reject anonymous and other administrator",
    async () => {
      for (const name of [
        "testnetDashboard",
        "testnetDiscover",
        "testnetRequest",
        "testnetAutomation",
        "testnetHistory",
      ]) {
        assert.equal((await call(name, {})).error.status, "UNAUTHENTICATED");
        assert.equal(
          (await call(name, {}, other)).error.status,
          "PERMISSION_DENIED",
        );
      }
    },
  );
  ledgerFetch();
  await t.test(
    "Duplicate requests create exactly one intent and cannot mutate action",
    async () => {
      await reset();
      await Promise.all([
        enqueue("payment", "duplicate-request"),
        enqueue("payment", "duplicate-request"),
      ]);
      assert.equal((await rootRef().collection("intents").get()).size, 1);
      await assert.rejects(() => enqueue("buy", "duplicate-request"));
    },
  );
  await t.test(
    "Overlapping workers acquire only one durable lease",
    async () => {
      await reset();
      await enqueue("payment", "lease-request");
      const leases = await Promise.all([takeLease(), takeLease()]);
      assert.equal(leases.filter(Boolean).length, 1);
    },
  );
  await t.test(
    "Payment is signed, persisted, submitted once and validated from metadata",
    async () => {
      await reset();
      await enqueue("payment", "payment-request");
      await processPending({ signer: trader, sleep: async () => {} });
      const i = (
        await rootRef().collection("intents").doc("payment-request").get()
      ).data();
      assert.equal(i.status, "validated");
      assert.equal(i.result.fee, "0.000012");
      assert.equal(i.result.xrpChange, "-1.000012");
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
    await enqueue("payment", "pause-request");
    await automation(false);
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
      await enqueue("payment", "pause-after-request");
      hook = () => automation(false);
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
      await enqueue("payment", "timeout-request");
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
      await enqueue("payment", "expiry-request");
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
    network = 0;
    await enqueue("payment", "network-request");
    await processPending({ signer: trader, sleep: async () => {} });
    assert.equal(submits, 0);
    assert.equal((await rootRef().collection("payloads").get()).size, 0);
  });
  await t.test("Disabled owner prevents worker execution", async () => {
    await reset();
    await enqueue("payment", "disabled-request");
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
        asset: { currency: "USD", issuer: recipient.classicAddress },
      });
      await enqueue("sell", "partial-request");
      const lease = await takeLease();
      await finish(lease, "validated", null, {
        fee: ".00001",
        tokenChange: "-1",
        tradeXrp: ".49",
        result: "tesSUCCESS",
      });
      const p = (await rootRef().get()).data().position;
      assert.equal(p.quantity, "1");
      assert.equal(p.cost, "0.5");
      assert.equal(p.realized, "-0.01001");
      await assert.rejects(() => enqueue("buy", "another-buy-request"));
    },
  );
  await t.test(
    "Crash after payload persistence resumes the same signed hash",
    async () => {
      await reset();
      await enqueue("payment", "persisted-request");
      const signed = trader.sign({
        TransactionType: "Payment",
        Account: trader.classicAddress,
        Destination: recipient.classicAddress,
        Amount: "1000000",
        Sequence: 10,
        Fee: "12",
        LastLedgerSequence: 1004,
        Flags: 0x80000000,
      });
      await rootRef()
        .collection("payloads")
        .doc("persisted-request")
        .set({ blob: signed.tx_blob });
      await rootRef()
        .collection("intents")
        .doc("persisted-request")
        .update({
          status: "signing",
          hash: signed.hash,
          sequence: 10,
          firstLedger: 1000,
          lastLedger: 1004,
          quoteAt: Date.now(),
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
      await enqueue("payment", "inflight-pause-request");
      let count = 0;
      feeHook = async () => {
        if (++count === 2) await automation(false);
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
  await t.test(
    "Account disappearance after Testnet reset stops signing",
    async () => {
      await reset();
      await enqueue("payment", "reset-request");
      missingAccount = true;
      await processPending({ signer: trader, sleep: async () => {} });
      assert.equal(submits, 0);
      assert.match(
        (
          await rootRef().collection("intents").doc("reset-request").get()
        ).data().error,
        /reset/,
      );
    },
  );
  global.fetch = realFetch;
});
