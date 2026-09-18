import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError } from "firebase-functions/v2/https";
import { isValidClassicAddress } from "xrpl";
import { canTrade } from "../trading/access.js";
import {
  D,
  RLUSD,
  PAIRS,
  API_SA,
  LIMITS,
  day,
  settings,
  safeMessage,
} from "./config.js";
import { ledger, wallet, book, trustLine, balanceGuard } from "./ledger.js";
import {
  rootRef,
  ensureState,
  activeOwner,
  enqueue,
  dispatch,
  publicIntent,
  takeLease,
  releaseLease,
} from "./state.js";
import { evaluate, equity, approvalValid } from "./strategy.js";
export async function history(cursor) {
  let q = rootRef()
    .collection("intents")
    .orderBy("createdAt", "desc")
    .orderBy("__name__", "desc");
  if (cursor) {
    if (!Number.isFinite(cursor.at) || !/^[-\w]{8,80}$/.test(cursor.id))
      throw new Error("Invalid cursor.");
    q = q.startAfter(cursor.at, cursor.id);
  }
  const s = await q.limit(20).get(),
    last = s.docs.at(-1);
  return {
    transactions: s.docs.map((x) => publicIntent(x.id, x.data())),
    cursor: s.size === 20 ? { at: last.data().createdAt, id: last.id } : null,
  };
}
export async function dashboard() {
  const c = await ensureState();
  let w = null,
    m = c.market || null;
  try {
    const h = await ledger();
    w = await wallet(c.trader.address, h);
    try {
      m = await book(h, c.settings, c.trader.address);
    } catch (e) {
      m = { eligible: false, reason: safeMessage(e), at: h.at };
    }
  } catch (e) {
    w = { error: safeMessage(e), funded: false };
  }
  let line = null;
  try {
    line = w?.lines ? trustLine(w) : null;
  } catch (e) {
    w.error = safeMessage(e);
  }
  return {
    network: "mainnet",
    trader: c.trader.address,
    provisioning: c.provisioning,
    wallet: {
      ...w,
      rlusd: line?.balance || "0",
      trustReady: !!line,
      fundingMinimum: w?.reserve
        ? D(w.reserve)
            .plus(line ? 0 : w.reserveIncrement)
            .plus(5)
            .plus(".02")
            .toString()
        : "6.22",
    },
    market: m,
    enabled: c.enabled,
    mode: c.mode,
    pending: c.pending,
    settings: c.settings,
    pairs: PAIRS,
    position: c.position,
    unrealized: m?.bid
      ? D(c.position.quantity).mul(m.bid).minus(c.position.cost).toString()
      : null,
    health: c.health,
    signal: c.signal,
    analysis: c.analysis || null,
    news: c.news || null,
    aiUsage: c.aiUsage || { day: day(), spent: "0" },
    budget: c.budget,
    nextAnalysisAt: c.nextAnalysisAt,
    nextNewsAt: c.nextNewsAt,
    returnAddress: c.returnAddress || null,
    discrepancy: c.discrepancy || null,
    ...(await history(null)),
  };
}
export async function automation(mode) {
  if (!["running", "paused", "closing"].includes(mode))
    throw new Error("Invalid automation mode.");
  await activeOwner();
  const r = rootRef(),
    before = await ensureState();
  let closeBaseline = null;
  if (mode === "closing" && before.discrepancy) {
    const h = await ledger(),
      w = await wallet(before.trader.address, h);
    balanceGuard(w, before.position.quantity, 10000);
    closeBaseline = {
      xrp: w.balance,
      rlusd: trustLine(w)?.balance || "0",
      ledger: h.index,
    };
  }
  if (mode === "running") {
    if (before.daily.stoppedDay === day())
      throw new Error("Daily loss stop is active until a subsequent UTC day.");
    const h = await ledger(),
      w = await wallet(before.trader.address, h);
    balanceGuard(w, 0, 10000);
    const l = trustLine(w);
    if (
      !l ||
      (D(before.position.quantity).eq(0) &&
        D(l.balance).lt(before.settings.purchase))
    )
      throw new Error("Fund the RLUSD trust line before starting.");
    if (before.discrepancy)
      throw new Error(
        "Review the balance change and acknowledge it before starting.",
      );
    const m = await book(h, before.settings, before.trader.address);
    if (!m.eligible) throw new Error(m.reason);
  }
  return getFirestore().runTransaction(async (t) => {
    const c = (await t.get(r)).data();
    if (c.revision !== before.revision)
      throw new Error("Settings changed; retry.");
    if (mode !== "paused" && c.pending)
      throw new Error("Wait for the pending transaction.");
    if (mode === "closing" && D(c.position.quantity).lte(0))
      throw new Error("No trading position to close.");
    t.update(r, {
      mode,
      ...(closeBaseline ? { expected: closeBaseline } : {}),
      enabled: mode !== "paused",
      revision: c.revision + 1,
      analysis: null,
      nextAnalysisAt: 0,
      exit:
        mode === "closing"
          ? {
              startedAt: Date.now(),
              attempts: 0,
              reason: "Owner requested close position & stop.",
            }
          : null,
      health: { ...c.health, error: null },
    });
    return { mode, enabled: mode !== "paused" };
  });
}
export async function saveSettings(input) {
  const cfg = settings(input),
    r = rootRef();
  await getFirestore().runTransaction(async (t) => {
    const c = (await t.get(r)).data();
    t.update(r, {
      settings: cfg,
      revision: c.revision + 1,
      enabled: false,
      mode: "paused",
      analysis: null,
      nextAnalysisAt: 0,
      nextNewsAt: 0,
      exit: null,
    });
  });
  return { settings: cfg };
}
export function recentAuth(auth) {
  const at = auth?.token?.auth_time;
  if (
    !Number.isFinite(at) ||
    Date.now() / 1000 - at > 300 ||
    at > Date.now() / 1000 + 30
  )
    throw new HttpsError(
      "unauthenticated",
      "Sign in again within five minutes before saving the return address.",
    );
}
export async function saveReturnAddress(d, auth) {
  recentAuth(auth);
  if (
    !isValidClassicAddress(d.address) ||
    !(
      d.tag === null ||
      (Number.isInteger(d.tag) && d.tag >= 0 && d.tag <= 4294967295)
    )
  )
    throw new Error(
      "Enter a valid classic XRPL address and optional numeric destination tag.",
    );
  const r = rootRef();
  await getFirestore().runTransaction(async (t) => {
    const c = (await t.get(r)).data();
    if (c.mode !== "paused" || c.pending)
      throw new Error("Pause and resolve pending transactions first.");
    if (d.address === c.trader.address)
      throw new Error("Return address must differ from the trading wallet.");
    t.update(r, {
      returnAddress: { address: d.address, tag: d.tag },
      revision: c.revision + 1,
    });
  });
  return { saved: true };
}
export async function request(d) {
  if (
    Object.keys(d).some(
      (k) => !["action", "requestId", "amount", "currency"].includes(k),
    )
  )
    throw new Error("Unsupported request fields.");
  if (!["trust", "withdraw"].includes(d.action))
    throw new Error(
      "Only wallet setup and saved-address withdrawals can be requested directly.",
    );
  let withdrawal;
  if (d.action === "withdraw") {
    if (
      !["XRP", "RLUSD"].includes(d.currency) ||
      !/^\d{1,9}(\.\d{1,6})?$/.test(String(d.amount)) ||
      D(d.amount).lte(0)
    )
      throw new Error("Invalid withdrawal amount.");
    const c = await ensureState();
    if (!c.returnAddress) throw new Error("Save a return address first.");
    withdrawal = {
      ...c.returnAddress,
      amount: D(d.amount).toString(),
      currency: d.currency,
    };
  }
  return enqueue(d.action, d.requestId, { withdrawal });
}
export async function acknowledgeBalances() {
  const r = rootRef(),
    c = await ensureState();
  if (c.enabled || c.pending || D(c.position.quantity).gt(0))
    throw new Error(
      "Balance review requires a paused, flat wallet with no pending transaction.",
    );
  const h = await ledger(),
    w = await wallet(c.trader.address, h);
  await getFirestore().runTransaction(async (t) => {
    const n = (await t.get(r)).data();
    if (n.revision !== c.revision || n.pending)
      throw new Error("State changed; retry.");
    t.update(r, {
      discrepancy: null,
      expected: {
        xrp: w.balance,
        rlusd: trustLine(w)?.balance || "0",
        ledger: h.index,
      },
      revision: n.revision + 1,
    });
  });
  return { acknowledged: true };
}
export function createMainnetHandlers({ endpoint, base, current, rate }) {
  const wrap = (fn) =>
    endpoint(
      { ...base, serviceAccount: API_SA, timeoutSeconds: 90 },
      async (r) => {
        const a = await current(r);
        if (!canTrade(a.uid, a.profile))
          throw new HttpsError(
            "permission-denied",
            "This mini app is private to its owner.",
          );
        await rate(r, "mainnet", 180, 60000);
        try {
          await ensureState();
          return await fn(r.data || {}, r.auth);
        } catch (e) {
          if (e instanceof HttpsError) throw e;
          throw new HttpsError("failed-precondition", safeMessage(e));
        }
      },
    );
  return {
    mainnetDashboard: wrap(dashboard),
    mainnetSettings: wrap(saveSettings),
    mainnetAutomation: wrap((d) => automation(d.mode)),
    mainnetRequest: wrap(request),
    mainnetReturnAddress: wrap(saveReturnAddress),
    mainnetHistory: wrap((d) => history(d.cursor)),
    mainnetAcknowledgeBalances: wrap(acknowledgeBalances),
  };
}
export async function tick() {
  const r = rootRef();
  let lease;
  try {
    await ensureState();
    lease = await takeLease("tick", false);
    if (!lease) return;
    let c = (await r.get()).data();
    await r.set({ health: { heartbeat: Date.now() } }, { merge: true });
    if (c.pending) {
      await dispatch(c.pending);
      return;
    }
    await activeOwner();
    const h = await ledger(),
      w = await wallet(c.trader.address, h),
      m = await book(h, c.settings, c.trader.address),
      slot = Math.floor(Date.now() / 60000);
    const line = trustLine(w),
      expected = {
        xrp: w.balance,
        rlusd: line?.balance || "0",
        ledger: h.index,
      };
    const changed =
      c.expected &&
      (!D(c.expected.xrp).eq(expected.xrp) ||
        !D(c.expected.rlusd).eq(expected.rlusd));
    const samplesRef = r.collection("mainnetSamples");
    await samplesRef.doc(String(slot)).set({
      slot,
      at: h.at,
      mid: m.mid,
      ledger: h.index,
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000),
    });
    const samples = (
      await samplesRef.orderBy("slot", "desc").limit(60).get()
    ).docs
      .map((s) => s.data())
      .reverse();
    const signal = evaluate(c, samples, m);
    const updated = await getFirestore().runTransaction(async (t) => {
      const now = (await t.get(r)).data();
      if (now.revision !== c.revision || now.pending) return false;
      const patch = {
        market: m,
        signal,
        health: {
          ...now.health,
          heartbeat: Date.now(),
          lastSample: Date.now(),
          error: null,
        },
      };
      if (!c.expected) patch.expected = expected;
      if (changed) {
        patch.discrepancy = {
          at: Date.now(),
          expected: c.expected,
          actual: expected,
        };
        patch.enabled = false;
        patch.mode = "paused";
        patch.revision = c.revision + 1;
        patch.signal = {
          action: "WAIT",
          reason:
            "Ledger balances changed outside the tracked engine. Review funding or external activity.",
        };
      }
      if (c.daily.day !== day())
        patch.daily = {
          ...c.daily,
          day: day(),
          baseline: equity(c.position, m.bid)
            .minus(D(c.position.quantity).gt(0) ? D(".01").mul(m.ask) : 0)
            .toString(),
        };
      if (signal.dailyStop) {
        patch.daily = { ...(patch.daily || c.daily), stoppedDay: day() };
        if (c.enabled) {
          patch.mode = D(c.position.quantity).gt(0) ? "closing" : "paused";
          patch.enabled = D(c.position.quantity).gt(0);
        }
      }
      t.update(r, patch);
      return true;
    });
    if (!updated || changed) return;
    c = (await r.get()).data();
    if (!c.enabled) return;
    if (c.mode === "closing" || c.exit || signal.action === "SELL") {
      if (!c.exit)
        await getFirestore().runTransaction(async (t) => {
          const n = (await t.get(r)).data();
          if (n.revision === c.revision && n.enabled)
            t.update(r, {
              exit: {
                startedAt: Date.now(),
                attempts: 0,
                reason: signal.reason,
              },
            });
        });
      c = (await r.get()).data();
      if (!c.enabled || !c.exit) return;
      if (
        c.exit.attempts >= LIMITS.attempts ||
        Date.now() - c.exit.startedAt > LIMITS.duration
      )
        throw new Error(
          "Exit limits reached; residual holding requires attention.",
        );
      await enqueue("sell", `exit-${c.exit.startedAt}-${slot}`, {
        automatic: true,
        reason: c.exit.reason,
      });
      return;
    }
    if (signal.action === "BUY" && approvalValid(c.analysis, c)) {
      await enqueue("buy", `entry-${c.analysis.id}`, {
        automatic: true,
        reason: signal.reason,
      });
      return;
    }
    if (Date.now() >= c.nextAnalysisAt || Date.now() >= c.nextNewsAt)
      await dispatch(`analysis-${slot}`, "mainnetAnalyst");
  } catch (e) {
    await r.set(
      { health: { error: safeMessage(e), heartbeat: Date.now() } },
      { merge: true },
    );
    if (/access is disabled|Exit limits/.test(e.message))
      await r.update({ enabled: false, mode: "paused" });
  } finally {
    await releaseLease(lease);
  }
}
export const mainnetTick = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    serviceAccount: API_SA,
    timeoutSeconds: 90,
    maxInstances: 1,
    memory: "256MiB",
  },
  tick,
);
