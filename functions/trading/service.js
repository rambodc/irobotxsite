import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { randomUUID } from "node:crypto";
import { tradingOwner, canTrade } from "./access.js";
import {
  initialConfig,
  emptyPortfolio,
  makePair,
  rules,
  signal,
  execute,
  midpoint,
  quoteProblem,
  valuation,
} from "./engine.js";
import { readMarkets } from "./market.js";
const root = (db, uid) => db.doc(`users/${uid}/miniApps/trading`);
const expiry = (now) => new Date(now + 7 * 86400000);
const requireObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpsError("invalid-argument", "Invalid request.");
  return value;
};
export function createTradingHandlers({ endpoint, base, current, rate }) {
  async function access(request) {
    const a = await current(request);
    if (!canTrade(a.uid, a.profile))
      throw new HttpsError(
        "permission-denied",
        "This mini app is private to its owner.",
      );
    return { ...a, db: getFirestore(), ref: root(getFirestore(), a.uid) };
  }
  async function config(a) {
    return a.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(a.ref);
      if (snapshot.exists) return snapshot.data();
      const value = initialConfig();
      tx.create(a.ref, value);
      return value;
    });
  }
  const tradingDashboard = endpoint(base, async (request) => {
    const a = await access(request),
      settings = await config(a);
    const [marketDocs, portfolioDocs, health] = await Promise.all([
      a.db.getAll(
        ...settings.pairs.map((p) => a.ref.collection("markets").doc(p.id)),
      ),
      a.db.getAll(
        ...settings.pairs.map((p) => a.ref.collection("portfolios").doc(p.id)),
      ),
      a.ref.collection("system").doc("health").get(),
    ]);
    return {
      config: settings,
      markets: marketDocs.map((d) =>
        d.exists
          ? d.data()
          : {
              pairId: d.id,
              history: [],
              error: "Waiting for the next scheduled sample.",
            },
      ),
      portfolios: portfolioDocs.map((d, i) => {
        const p = d.data() || emptyPortfolio();
        return { pairId: d.id, ...p, ...valuation(p, marketDocs[i].data()) };
      }),
      health: health.data() || null,
    };
  });
  const tradingConfigure = endpoint(base, async (request) => {
    const a = await access(request);
    await rate(request, "trading-settings", 120);
    const input = requireObject(request.data);
    if (
      !["addPair", "removePair", "selectPair", "rules"].includes(input.action)
    )
      throw new HttpsError("invalid-argument", "Unknown settings action.");
    const pair =
      input.action === "addPair" ? makePair(input.base, input.quote) : null;
    const validatedRules = input.action === "rules" ? rules(input.rules) : null;
    if (
      ["removePair", "selectPair"].includes(input.action) &&
      !/^[a-f0-9]{24}$/.test(input.pairId || "")
    )
      throw new HttpsError("invalid-argument", "Invalid pair.");
    return a.db.runTransaction(async (tx) => {
      const [snap, profile] = await Promise.all([
        tx.get(a.ref),
        tx.get(a.db.doc(`users/${a.uid}`)),
      ]);
      if (!canTrade(a.uid, profile.data()))
        throw new HttpsError(
          "permission-denied",
          "Access is no longer active.",
        );
      const c = snap.data() || initialConfig();
      if (pair) {
        if (c.pairs.some((p) => p.id === pair.id))
          throw new HttpsError(
            "already-exists",
            "This pair is already watched.",
          );
        if (c.pairs.length >= 5)
          throw new HttpsError(
            "failed-precondition",
            "Watch up to five pairs.",
          );
        c.pairs.push(pair);
      } else if (input.action === "removePair") {
        if (c.pairs.length === 1 || c.activePair === input.pairId)
          throw new HttpsError(
            "failed-precondition",
            "Select another active pair before removing this pair.",
          );
        if (!c.pairs.some((p) => p.id === input.pairId))
          throw new HttpsError("invalid-argument", "Unknown pair.");
        c.pairs = c.pairs.filter((p) => p.id !== input.pairId);
      } else if (input.action === "selectPair") {
        if (!c.pairs.some((p) => p.id === input.pairId))
          throw new HttpsError("invalid-argument", "Unknown pair.");
        c.activePair = input.pairId;
      } else c.rules = validatedRules;
      c.enabled = false;
      c.revision += 1;
      tx.set(a.ref, c);
      return c;
    });
  });
  const tradingAutomation = endpoint(base, async (request) => {
    const a = await access(request);
    await rate(request, "trading-automation", 120);
    if (typeof request.data?.enabled !== "boolean")
      throw new HttpsError("invalid-argument", "Choose Start or Pause.");
    return a.db.runTransaction(async (tx) => {
      const [snap, profile] = await Promise.all([
        tx.get(a.ref),
        tx.get(a.db.doc(`users/${a.uid}`)),
      ]);
      if (!canTrade(a.uid, profile.data()))
        throw new HttpsError(
          "permission-denied",
          "Access is no longer active.",
        );
      const c = snap.data() || initialConfig();
      c.enabled = request.data.enabled;
      c.revision += 1;
      tx.set(a.ref, c);
      return c;
    });
  });
  const tradingHistory = endpoint(base, async (request) => {
    const a = await access(request),
      input = requireObject(request.data);
    let query = a.ref
      .collection("trades")
      .orderBy("at", "desc")
      .orderBy("__name__", "desc");
    if (input.cursor) {
      if (
        !Number.isSafeInteger(input.cursor.at) ||
        !/^[a-f0-9]{24}-\d+$/.test(input.cursor.id || "")
      )
        throw new HttpsError("invalid-argument", "Invalid history cursor.");
      query = query.startAfter(input.cursor.at, input.cursor.id);
    }
    const docs = (await query.limit(26).get()).docs,
      visible = docs.slice(0, 25);
    return {
      trades: visible.map((d) => ({ id: d.id, ...d.data() })),
      cursor:
        docs.length > 25
          ? { id: visible.at(-1).id, at: visible.at(-1).data().at }
          : null,
    };
  });
  return {
    tradingDashboard,
    tradingConfigure,
    tradingAutomation,
    tradingHistory,
  };
}

// Exported runner allows emulator tests of real transactions without a public trigger.
export async function runTradingTick({
  db = getFirestore(),
  auth = getAuth(),
  feed = readMarkets,
  now = () => Date.now(),
} = {}) {
  const uid = tradingOwner(),
    ref = root(db, uid),
    leaseRef = ref.collection("system").doc("lease"),
    healthRef = ref.collection("system").doc("health");
  const token = randomUUID(),
    started = now(),
    minute = Math.floor(started / 60000);
  const acquired = await db.runTransaction(async (tx) => {
    const [config, lease, profile] = await Promise.all([
      tx.get(ref),
      tx.get(leaseRef),
      tx.get(db.doc(`users/${uid}`)),
    ]);
    if (!config.exists || !canTrade(uid, profile.data())) return null;
    const lock = lease.data();
    if (lock?.until > started || lock?.completedMinute === minute) return null;
    tx.set(leaseRef, {
      token,
      until: started + 55000,
      completedMinute: lock?.completedMinute ?? -1,
    });
    tx.set(healthRef, { lastAttempt: started }, { merge: true });
    return config.data();
  });
  if (!acquired) return { skipped: true };
  let error = null;
  try {
    const user = await auth.getUser(uid);
    if (user.disabled) throw new Error("Owner account is disabled.");
    const snapshots = await feed(acquired.pairs);
    // Recheck Auth immediately before committing; Firestore profile and settings
    // are also read inside the transaction so revocation/pause conflicts retry.
    if ((await auth.getUser(uid)).disabled)
      throw new Error("Owner account is disabled.");
    await db.runTransaction(async (tx) => {
      const [fresh, lease, profile, ...marketDocs] = await Promise.all([
        tx.get(ref),
        tx.get(leaseRef),
        tx.get(db.doc(`users/${uid}`)),
        ...acquired.pairs.map((p) =>
          tx.get(ref.collection("markets").doc(p.id)),
        ),
      ]);
      const c = fresh.data();
      if (
        lease.data()?.token !== token ||
        lease.data().until < now() ||
        !canTrade(uid, profile.data()) ||
        c.revision !== acquired.revision
      )
        return;
      const portfolioRef = ref.collection("portfolios").doc(c.activePair);
      const portfolioDoc = await tx.get(portfolioRef);
      const portfolio = portfolioDoc.data() || emptyPortfolio();
      const time = now();
      let decision = {
        side: "WAIT",
        reason: "No fresh market data.",
        momentum: null,
      };
      let activeError = null;
      snapshots.forEach((s, index) => {
        const pair = acquired.pairs[index],
          old = marketDocs[index].data();
        const previous = old?.history || [];
        const history = previous.at(-1)?.minute === minute - 1 ? previous : [];
        const problem =
          s.error || quoteProblem(s, { ...c.rules, maxSpread: Infinity }, time);
        const marketRef = ref.collection("markets").doc(pair.id);
        if (problem) {
          tx.set(marketRef, {
            pairId: pair.id,
            history: [],
            error: problem,
            updatedAt: time,
          });
          if (pair.id === c.activePair) {
            decision = { side: "WAIT", reason: problem, momentum: null };
            activeError = problem;
          }
          return;
        }
        const sample = { minute, at: s.at, ledger: s.ledger, mid: midpoint(s) };
        const updatedHistory = [
          ...history.filter((h) => h.minute < minute).slice(-59),
          sample,
        ];
        tx.set(marketRef, {
          ...s,
          history: updatedHistory,
          error: null,
          updatedAt: time,
        });
        tx.set(ref.collection("samples").doc(`${pair.id}-${s.ledger}`), {
          pairId: pair.id,
          ...sample,
          expiresAt: expiry(time),
        });
        if (pair.id !== c.activePair) return;
        decision = signal(history, s, c.rules, time);
        if (c.enabled && decision.side !== "WAIT") {
          const result = execute(portfolio, s, decision.side, c.rules, time);
          if (result.error) decision = { ...decision, execution: result.error };
          else {
            tx.set(portfolioRef, result.portfolio);
            tx.create(ref.collection("trades").doc(`${pair.id}-${s.ledger}`), {
              ...result.fill,
              pairId: pair.id,
              pairName: pair.name,
              quote: pair.quote.symbol,
              reason: decision.reason,
            });
            decision = { ...decision, execution: "Simulated fill recorded." };
          }
        } else
          decision = {
            ...decision,
            execution: c.enabled ? "No trade." : "Automation is paused.",
          };
      });
      tx.set(ref.collection("decisions").doc(String(minute)), {
        ...decision,
        pairId: c.activePair,
        at: time,
        expiresAt: expiry(time),
      });
      tx.set(
        healthRef,
        {
          lastAttempt: started,
          lastEvaluation: time,
          ...(activeError ? {} : { lastSuccess: time }),
          configRevision: c.revision,
          error: activeError,
          decision,
        },
        { merge: true },
      );
      tx.set(leaseRef, { token, until: 0, completedMinute: minute });
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Market evaluation failed.";
    console.error("Trading evaluation failed", { message: error });
  } finally {
    await db.runTransaction(async (tx) => {
      const lease = await tx.get(leaseRef);
      if (lease.data()?.token !== token) return;
      tx.set(leaseRef, { until: 0 }, { merge: true });
      if (error)
        tx.set(
          healthRef,
          {
            error,
            lastAttempt: started,
            decision: { side: "WAIT", reason: error, momentum: null },
          },
          { merge: true },
        );
    });
  }
  return { error };
}
export const tradingTick = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    timeoutSeconds: 55,
    memory: "256MiB",
    maxInstances: 1,
    retryCount: 0,
  },
  () => runTradingTick(),
);
