import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "../functions/node_modules/firebase-admin/lib/app/index.js";
import { getAuth } from "../functions/node_modules/firebase-admin/lib/auth/index.js";
import { getFirestore } from "../functions/node_modules/firebase-admin/lib/firestore/index.js";
import { runTradingTick } from "../functions/trading/service.js";
import { tradingOwner } from "../functions/trading/access.js";
import {
  initialConfig,
  defaultPair,
  emptyPortfolio,
} from "../functions/trading/engine.js";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Emulators required.");
initializeApp({ projectId: "demo-irobotx" });
const db = getFirestore(),
  auth = getAuth(),
  owner = tradingOwner(),
  pair = defaultPair(),
  root = db.doc(`users/${owner}/miniApps/trading`);
const password = "Testing-password-123!";
async function seed(uid, email, role = "admin") {
  await auth.createUser({ uid, email, password });
  await db
    .doc(`users/${uid}`)
    .set({
      email,
      name: "Trading Test",
      company: "iRobotX",
      role,
      status: "active",
      apps: [],
    });
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return (await response.json()).idToken;
}
async function call(name, data = {}, token) {
  const res = await fetch(
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
  return res.json();
}
let minute = 30000000;
const time = () => minute * 60000 + 5000;
const quote = () => ({
  pairId: pair.id,
  at: time(),
  ledger: minute,
  bid: "2",
  ask: "2.001",
  bids: [{ price: "2", quantity: "10000" }],
  asks: [{ price: "2.001", quantity: "10000" }],
});
async function warm() {
  await root
    .collection("markets")
    .doc(pair.id)
    .set({
      ...quote(),
      history: Array.from({ length: 5 }, (_, i) => ({
        minute: minute - 5 + i,
        ledger: minute - 5 + i,
        mid: "1.99",
        at: time() - (5 - i) * 60000,
      })),
    });
}
test("Trading authorization, persistence and scheduled execution", async (t) => {
  const token = await seed(owner, "trading-owner@example.com"),
    other = await seed("other-admin", "other-admin@example.com");
  await t.test(
    "all trading callables reject anonymous and other admin users",
    async () => {
      for (const endpoint of [
        "tradingDashboard",
        "tradingConfigure",
        "tradingAutomation",
        "tradingHistory",
      ]) {
        assert.equal((await call(endpoint)).error.status, "UNAUTHENTICATED");
        assert.equal(
          (await call(endpoint, {}, other)).error.status,
          "PERMISSION_DENIED",
        );
      }
      const p = (await call("getProfile", {}, token)).result;
      assert.ok(p.miniApps.includes("trading"));
      assert.ok(
        !(await call("getProfile", {}, other)).result.miniApps.includes(
          "trading",
        ),
      );
    },
  );
  await t.test(
    "dashboard initializes paused and saves owner configuration",
    async () => {
      const d = (await call("tradingDashboard", {}, token)).result;
      assert.equal(d.config.enabled, false);
      assert.equal(d.portfolios[0].cash, "10000");
      assert.equal(
        (await call("tradingAutomation", { enabled: true }, token)).result
          .enabled,
        true,
      );
      assert.equal(
        (
          await call(
            "tradingConfigure",
            { action: "rules", rules: initialConfig().rules },
            token,
          )
        ).result.enabled,
        false,
      );
      assert.equal(
        (await call("tradingAutomation", { enabled: "true" }, token)).error
          .status,
        "INVALID_ARGUMENT",
      );
    },
  );
  await t.test("browser Firestore access stays denied", async () => {
    const result = await fetch(
      `http://127.0.0.1:8080/v1/projects/demo-irobotx/databases/(default)/documents/users/${owner}/miniApps/trading`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(result.status, 403);
  });
  await t.test(
    "pair changes preserve portfolios and pause execution",
    async () => {
      const added = (
        await call(
          "tradingConfigure",
          {
            action: "addPair",
            base: { currency: "USD", issuer: pair.quote.issuer },
            quote: "XRP",
          },
          token,
        )
      ).result;
      assert.equal(added.pairs.length, 2);
      assert.equal(added.enabled, false);
      const id = added.pairs[1].id;
      await root
        .collection("portfolios")
        .doc(id)
        .set({ ...emptyPortfolio(), cash: "9990" });
      await call(
        "tradingConfigure",
        { action: "removePair", pairId: id },
        token,
      );
      assert.equal(
        (await root.collection("portfolios").doc(id).get()).data().cash,
        "9990",
      );
      assert.equal(
        (
          await call(
            "tradingConfigure",
            {
              action: "addPair",
              base: { currency: "USD", issuer: "rInvalid" },
              quote: "XRP",
            },
            token,
          )
        ).error.status,
        "INVALID_ARGUMENT",
      );
    },
  );
  await t.test(
    "runs with no browser; replay and overlap cannot duplicate fills",
    async () => {
      await call("tradingAutomation", { enabled: true }, token);
      await warm();
      const feed = async () => [quote()];
      await Promise.all([
        runTradingTick({ db, auth, feed, now: time }),
        runTradingTick({ db, auth, feed, now: time }),
      ]);
      assert.equal((await root.collection("trades").get()).size, 1);
      const result = await runTradingTick({ db, auth, feed, now: time });
      assert.equal(result.skipped, true);
      assert.equal((await root.collection("trades").get()).size, 1);
      const dashboard = (await call("tradingDashboard", {}, token)).result;
      assert.ok(Number(dashboard.portfolios[0].quantity) > 0);
      assert.equal(
        (await call("tradingHistory", {}, token)).result.trades.length,
        1,
      );
    },
  );
  await t.test("Pause during market fetch blocks a pending fill", async () => {
    minute++;
    await warm();
    let release, entered;
    const gate = new Promise((r) => (release = r));
    const started = new Promise((r) => (entered = r));
    const running = runTradingTick({
      db,
      auth,
      now: time,
      feed: async () => {
        entered();
        await gate;
        return [quote()];
      },
    });
    await started;
    await call("tradingAutomation", { enabled: false }, token);
    release();
    await running;
    assert.equal((await root.collection("trades").get()).size, 1);
    assert.equal((await root.get()).data().enabled, false);
  });
  await t.test("enabled run respects a newly disabled account", async () => {
    minute++;
    await call("tradingAutomation", { enabled: true }, token);
    await warm();
    await runTradingTick({
      db,
      auth,
      now: time,
      feed: async () => {
        await db.doc(`users/${owner}`).update({ status: "disabled" });
        return [quote()];
      },
    });
    assert.equal((await root.collection("trades").get()).size, 1);
    assert.equal(
      (await call("tradingDashboard", {}, token)).error.status,
      "PERMISSION_DENIED",
    );
    await db.doc(`users/${owner}`).update({ status: "active" });
  });
  await t.test(
    "failed feed produces WAIT and leaves balances unchanged",
    async () => {
      minute++;
      const result = await runTradingTick({
        db,
        auth,
        now: time,
        feed: async () => {
          throw new Error("Test feed offline");
        },
      });
      assert.equal(result.error, "Test feed offline");
      assert.equal(
        (await root.collection("system").doc("health").get()).data().decision
          .side,
        "WAIT",
      );
      assert.equal((await root.collection("trades").get()).size, 1);
    },
  );
  await t.test(
    "missing liquidity resets samples and blocks execution",
    async () => {
      minute++;
      await runTradingTick({
        db,
        auth,
        now: time,
        feed: async () => [{ ...quote(), bids: [], bid: "0" }],
      });
      assert.deepEqual(
        (await root.collection("markets").doc(pair.id).get()).data().history,
        [],
      );
      assert.equal((await root.collection("trades").get()).size, 1);
    },
  );
  await t.test("trade pagination is stable at equal timestamps", async () => {
    const batch = db.batch();
    for (let i = 1; i <= 30; i++)
      batch.set(root.collection("trades").doc(`${pair.id}-${i}`), {
        at: 1,
        pairId: pair.id,
      });
    await batch.commit();
    const first = (await call("tradingHistory", {}, token)).result,
      second = (await call("tradingHistory", { cursor: first.cursor }, token))
        .result;
    assert.equal(first.trades.length, 25);
    assert.equal(second.trades.length, 6);
    assert.equal(
      new Set([...first.trades, ...second.trades].map((t) => t.id)).size,
      31,
    );
  });
});
