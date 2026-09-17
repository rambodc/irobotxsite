import { randomUUID, createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getFunctions } from "firebase-admin/functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { HttpsError } from "firebase-functions/v2/https";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Wallet, decode } from "xrpl";
import { canTrade, tradingOwner } from "../trading/access.js";
import {
  D,
  LIMITS,
  RPC,
  rpc,
  ledger,
  book,
  wallet,
  balanceGuard,
  actualResult,
  covered,
  drops,
  issued,
  assetValid,
  symbol,
  xrp,
} from "./ledger.js";
const PROJECT = "irobotxsite";
export const API_SA = `xrpl-testnet-api@${PROJECT}.iam.gserviceaccount.com`;
export const SIGNER_SA = `xrpl-testnet-signer@${PROJECT}.iam.gserviceaccount.com`;
export const rootRef = () =>
  getFirestore().doc(`xrplTestnet/${tradingOwner()}`);
const initial = {
  enabled: false,
  revision: 0,
  pending: null,
  run: null,
  position: {
    quantity: "0",
    cost: "0",
    realized: "0",
    tradingFees: "0",
    setupFees: "0",
  },
  budget: { day: "", spent: "0" },
  health: {},
};
const terminal = (s) =>
  ["validated", "failed", "expired", "cancelled"].includes(s);
export const publicIntent = (id, v) =>
  Object.fromEntries(
    Object.entries({ id, ...v }).filter(([k]) =>
      [
        "id",
        "action",
        "status",
        "createdAt",
        "updatedAt",
        "hash",
        "sequence",
        "lastLedger",
        "asset",
        "result",
        "error",
        "runId",
        "cycle",
        "submittedAt",
      ].includes(k),
    ),
  );
export async function activeOwner() {
  const [p, u] = await Promise.all([
    getFirestore().doc(`users/${tradingOwner()}`).get(),
    getAuth().getUser(tradingOwner()),
  ]);
  if (u.disabled || !canTrade(u.uid, p.data()))
    throw new Error("Trading owner access is disabled.");
}
export async function ensureState() {
  const ref = rootRef();
  await getFirestore().runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.data()?.trader?.address)
      throw new Error("Testnet wallets have not been provisioned.");
    if (!s.data().position) t.set(ref, initial, { merge: true });
  });
  return (await ref.get()).data();
}
const message = (e) => {
  const m = e?.message || "";
  return /seed|secret|credential|payload|PRIVATE/i.test(m)
    ? "Signing service unavailable."
    : m.slice(0, 240) || "Testnet service unavailable.";
};
async function dispatch(id) {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;
  await getFunctions()
    .taskQueue("locations/us-central1/functions/testnetWorker")
    .enqueue({ id }, { dispatchDeadlineSeconds: 90 });
}
export async function enqueue(action, id, automatic = false) {
  if (
    !["payment", "trust", "buy", "sell"].includes(action) ||
    !/^[-\w]{8,80}$/.test(id)
  )
    throw new HttpsError("invalid-argument", "Invalid action or request ID.");
  await activeOwner();
  const root = rootRef(),
    ref = root.collection("intents").doc(id);
  const out = await getFirestore().runTransaction(async (t) => {
    const [s, old] = await Promise.all([t.get(root), t.get(ref)]);
    const c = s.data();
    if (old.exists) {
      if (old.data().action !== action)
        throw new HttpsError(
          "already-exists",
          "Request ID belongs to another action.",
        );
      return publicIntent(id, old.data());
    }
    if (c.provisioning !== "ready")
      throw new HttpsError(
        "failed-precondition",
        "Wallet provisioning is incomplete.",
      );
    if (c.pending)
      throw new HttpsError(
        "failed-precondition",
        "Wait for the pending transaction to resolve.",
      );
    if (automatic && !c.enabled)
      throw new HttpsError("failed-precondition", "Automation is paused.");
    if (!automatic && c.enabled)
      throw new HttpsError(
        "failed-precondition",
        "Pause the automatic run before individual tests.",
      );
    if (action !== "payment" && !assetValid(c.asset))
      throw new HttpsError(
        "failed-precondition",
        "Discover an eligible Testnet market first.",
      );
    if (action === "buy" && D(c.position.quantity).gt(0))
      throw new HttpsError(
        "failed-precondition",
        "Sell the current cycle holding before another purchase.",
      );
    if (action === "sell" && D(c.position.quantity).lte(0))
      throw new HttpsError(
        "failed-precondition",
        "No tokens acquired by this test cycle to sell.",
      );
    const intent = {
      action,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: c.revision,
      asset: action === "payment" ? null : c.asset,
      automatic,
      runId: automatic ? c.run?.id : null,
      cycle: automatic ? c.run?.completed || 0 : null,
    };
    t.create(ref, intent);
    t.update(root, { pending: id });
    return publicIntent(id, intent);
  });
  try {
    if (!terminal(out.status)) await dispatch(id);
  } catch {
    await root.set(
      {
        health: {
          error: "Dispatch delayed; the scheduler will retry.",
          at: Date.now(),
        },
      },
      { merge: true },
    );
  }
  return out;
}
export async function discover() {
  const root = rootRef();
  const c = await ensureState();
  const h = await ledger();
  // Continue a bounded scan on its pinned validated ledger. Reset only when that snapshot is unavailable or complete.
  let scan = c.discovery || {},
    candidates = scan.candidates || [];
  if (
    !scan.hash ||
    !scan.marker ||
    Date.now() - (scan.startedAt || 0) > 3600000
  )
    scan = { hash: h.hash, marker: null, startedAt: Date.now() };
  for (let page = 0; page < 4; page++) {
    let r;
    try {
      r = await rpc("ledger_data", {
        ledger_hash: scan.hash,
        type: "offer",
        limit: 400,
        ...(scan.marker ? { marker: scan.marker } : {}),
      });
    } catch (e) {
      await root.update({
        discovery: { candidates, marker: null, startedAt: 0 },
      });
      throw e;
    }
    for (const entry of r.state || []) {
      const a =
        typeof entry.TakerGets === "object" &&
        typeof entry.TakerPays === "string"
          ? entry.TakerGets
          : typeof entry.TakerPays === "object" &&
              typeof entry.TakerGets === "string"
            ? entry.TakerPays
            : null;
      if (
        assetValid(a) &&
        !candidates.some(
          (x) => x.currency === a.currency && x.issuer === a.issuer,
        )
      )
        candidates.push({ currency: a.currency, issuer: a.issuer });
    }
    scan.marker = r.marker || null;
    if (!scan.marker) break;
  }
  candidates = candidates.slice(-100);
  await root.update({ discovery: { ...scan, candidates } });
  let selected = null,
    reasons = [];
  for (const a of candidates.slice(
    -(scan.examined || 0) - 12,
    candidates.length - (scan.examined || 0) || undefined,
  )) {
    try {
      selected = await book(a, h);
      break;
    } catch (e) {
      reasons.push(`${symbol(a.currency)}: ${message(e)}`);
    }
  }
  await root.update({
    "discovery.examined":
      ((scan.examined || 0) + 12) % Math.max(1, candidates.length),
  });
  if (!selected) {
    await root.update({
      market: {
        eligible: false,
        reason: "No eligible market available.",
        details: reasons,
        at: Date.now(),
        source: RPC,
      },
    });
    return { eligible: false, reason: "No eligible market available." };
  }
  await getFirestore().runTransaction(async (t) => {
    const s = await t.get(root),
      v = s.data();
    if (v.pending || v.enabled || D(v.position.quantity).gt(0))
      throw new HttpsError(
        "failed-precondition",
        "Pause and resolve the current holding before changing markets.",
      );
    t.update(root, {
      asset: selected.asset,
      market: selected,
      revision: v.revision + 1,
    });
  });
  return selected;
}
export async function dashboard() {
  const c = await ensureState();
  let w = null,
    m = c.market || null;
  try {
    const h = await ledger();
    w = await wallet(c.trader.address, h);
    if (c.asset) {
      try {
        m = await book(
          c.asset,
          h,
          D(c.position.quantity).gt(0) ? c.position.quantity : null,
        );
      } catch (e) {
        m = {
          asset: c.asset,
          symbol: symbol(c.asset.currency),
          eligible: false,
          reason: message(e),
          at: h.at,
          ledger: h.index,
          source: RPC,
        };
      }
    }
  } catch (e) {
    w = { address: c.trader.address, funded: false, error: message(e) };
  }
  const latest = await rootRef()
    .collection("intents")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  return {
    network: "testnet",
    trader: c.trader.address,
    receiver: c.receiver.address,
    provisioning: c.provisioning,
    wallet: w,
    market: m,
    enabled: c.enabled,
    run: c.run,
    position: c.position,
    pending: c.pending,
    health: c.health,
    limits: LIMITS,
    transactions: latest.docs.map((s) => publicIntent(s.id, s.data())),
  };
}
export async function automation(enabled) {
  await activeOwner();
  const root = rootRef();
  return getFirestore().runTransaction(async (t) => {
    const s = await t.get(root),
      c = s.data();
    if (enabled) {
      if (c.enabled) return { enabled: true };
      if (c.pending || D(c.position.quantity).gt(0))
        throw new HttpsError(
          "failed-precondition",
          "Resolve pending transactions and sell the current holding first.",
        );
      if (!c.asset)
        throw new HttpsError(
          "failed-precondition",
          "Discover an eligible market first.",
        );
      t.update(root, {
        enabled: true,
        revision: c.revision + 1,
        run: {
          id: randomUUID(),
          completed: 0,
          sellAttempts: 0,
          cycleStarted: null,
          status: "Starting bounded test",
          startedAt: Date.now(),
        },
      });
    } else {
      t.update(root, {
        enabled: false,
        revision: c.revision + 1,
        ...(c.run
          ? {
              run: {
                ...c.run,
                status: "Paused — submitted transactions still reconcile",
              },
            }
          : {}),
      });
    }
    return { enabled };
  });
}
export function createTestnetHandlers({ endpoint, base, current, rate }) {
  const options = { ...base, serviceAccount: API_SA, timeoutSeconds: 120 };
  const owner = async (r) => {
    const a = await current(r);
    if (!canTrade(a.uid, a.profile))
      throw new HttpsError(
        "permission-denied",
        "This mini app is private to its owner.",
      );
    await rate(r, "testnet", 180, 60000);
    await ensureState();
  };
  const wrap = (fn) =>
    endpoint(options, async (r) => {
      await owner(r);
      try {
        return await fn(r.data || {});
      } catch (e) {
        if (e instanceof HttpsError) throw e;
        throw new HttpsError("failed-precondition", message(e));
      }
    });
  return {
    testnetDashboard: wrap(dashboard),
    testnetDiscover: wrap(discover),
    testnetRequest: wrap((d) => {
      if (Object.keys(d).some((k) => !["action", "requestId"].includes(k)))
        throw new HttpsError(
          "invalid-argument",
          "Only an action and request ID are accepted.",
        );
      return enqueue(d.action, d.requestId);
    }),
    testnetAutomation: wrap((d) => {
      if (typeof d.enabled !== "boolean")
        throw new HttpsError("invalid-argument", "enabled must be boolean.");
      return automation(d.enabled);
    }),
    testnetHistory: wrap(async (d) => {
      let q = rootRef()
        .collection("intents")
        .orderBy("createdAt", "desc")
        .orderBy("__name__", "desc");
      if (d.cursor) {
        if (!Number.isFinite(d.cursor.at) || !/^[-\w]{8,80}$/.test(d.cursor.id))
          throw new HttpsError("invalid-argument", "Invalid cursor.");
        q = q.startAfter(d.cursor.at, d.cursor.id);
      }
      const s = await q.limit(20).get(),
        last = s.docs.at(-1);
      return {
        transactions: s.docs.map((x) => publicIntent(x.id, x.data())),
        cursor:
          s.size === 20 ? { at: last.data().createdAt, id: last.id } : null,
      };
    }),
  };
}
export async function takeLease() {
  const root = rootRef(),
    token = randomUUID();
  return getFirestore().runTransaction(async (t) => {
    const s = await t.get(root),
      c = s.data();
    if (!c?.pending || c.lease?.until > Date.now()) return null;
    t.update(root, { lease: { token, until: Date.now() + 110000 } });
    return { token, id: c.pending };
  });
}
async function mutate(lease, fn) {
  return getFirestore().runTransaction(async (t) => {
    const root = rootRef(),
      ref = root.collection("intents").doc(lease.id);
    const [s, i] = await Promise.all([t.get(root), t.get(ref)]);
    if (
      s.data()?.lease?.token !== lease.token ||
      s.data().lease.until < Date.now() ||
      s.data().pending !== lease.id
    )
      throw new Error("Worker lease lost.");
    return fn(t, root, ref, s.data(), i.data());
  });
}
export async function finish(lease, status, error, result = null) {
  await mutate(lease, (t, root, ref, c, i) => {
    let position = { ...c.position },
      run = c.run,
      budget = c.budget;
    if (result) {
      const fee = D(result.fee);
      if (
        ["buy", "sell"].includes(i.action) &&
        (status !== "validated" || D(result.tokenChange).eq(0))
      )
        position.realized = D(position.realized).minus(fee).toString();
      if (["buy", "sell"].includes(i.action))
        position.tradingFees = D(position.tradingFees).plus(fee).toString();
      else position.setupFees = D(position.setupFees).plus(fee).toString();
      if (status === "validated" && i.action === "buy") {
        const q = D(result.tokenChange),
          spent = D(result.tradeXrp).neg();
        if (q.gt(0) && spent.gt(0)) {
          position.quantity = q.toString();
          position.cost = spent.plus(fee).toString();
          if (i.automatic && run)
            run = {
              ...run,
              cycleStarted: Date.now(),
              sellAttempts: 0,
              status: "Buy validated; preparing sell",
            };
        }
      }
      if (status === "validated" && i.action === "sell") {
        const sold = D(result.tokenChange).neg(),
          oldQ = D(position.quantity);
        if (sold.gt(0) && sold.lte(oldQ)) {
          const cost = D(position.cost).mul(sold.div(oldQ));
          position.quantity = oldQ.minus(sold).toString();
          position.cost = D(position.cost).minus(cost).toString();
          position.realized = D(position.realized)
            .plus(result.tradeXrp)
            .minus(fee)
            .minus(cost)
            .toString();
          if (D(position.quantity).eq(0) && i.automatic && run)
            run = {
              ...run,
              completed: run.completed + 1,
              cycleStarted: null,
              sellAttempts: 0,
              status: "Cycle complete",
            };
        }
      }
    }
    const noFill =
      result &&
      ["buy", "sell"].includes(i.action) &&
      D(result.tokenChange).eq(0);
    const stop =
      status !== "validated" ||
      (noFill && i.action === "buy") ||
      run?.completed >= 3;
    t.update(ref, {
      status,
      error: error || (noFill ? "Validated IOC order had no fill." : null),
      result,
      updatedAt: Date.now(),
    });
    t.update(root, {
      pending: null,
      position,
      run: run
        ? {
            ...run,
            ...(stop
              ? {
                  status:
                    run.completed >= 3
                      ? "Completed three cycles"
                      : error || "Stopped: no fill",
                }
              : {}),
          }
        : null,
      enabled: stop ? false : c.enabled,
      health: { lastSuccess: Date.now(), error: error || null },
      budget,
    });
  });
}
export async function prepare(c, i, h) {
  const w = await wallet(c.trader.address, h);
  if (!w.funded) throw new Error(w.reason);
  const fees = await rpc("fee");
  const fee = String(
    Math.max(12, Math.ceil(Number(fees.drops.open_ledger_fee) * 1.2)),
  );
  let tx = {
    Account: c.trader.address,
    Sequence: w.sequence,
    Fee: fee,
    LastLedgerSequence: h.index + 4,
    Flags: 0x80000000,
  };
  if (i.action === "payment") {
    balanceGuard(w, 1, fee);
    const recipient = await wallet(c.receiver.address, h);
    if (!recipient.funded)
      throw new Error("Payment recipient requires faucet funding.");
    tx = {
      ...tx,
      TransactionType: "Payment",
      Destination: c.receiver.address,
      Amount: "1000000",
    };
  } else {
    const m = await book(
      i.asset,
      h,
      i.action === "sell" ? c.position.quantity : null,
    );
    const line = w.lines.find(
      (l) => l.currency === i.asset.currency && l.account === i.asset.issuer,
    );
    if (
      line &&
      (line.freeze ||
        line.freeze_peer ||
        line.deep_freeze ||
        line.deep_freeze_peer)
    )
      throw new Error("Trust line is frozen.");
    if (i.action === "trust") {
      balanceGuard(w, 0, fee, line ? "0" : h.increment);
      tx = {
        ...tx,
        TransactionType: "TrustSet",
        Flags: 0x80020000,
        LimitAmount: { ...i.asset, value: issued(D(10).div(m.ask).mul(1.1)) },
      };
    } else {
      if (!line)
        throw new Error("Create the bounded trust line before buying.");
      if (i.action === "buy") {
        if (D(c.position.quantity).gt(0))
          throw new Error("Current cycle still holds tokens.");
        const today = new Date().toISOString().slice(0, 10),
          spent = c.budget.day === today ? D(c.budget.spent) : D(0);
        if (spent.plus(1).gt(10))
          throw new Error("Daily purchase budget of 10 test XRP reached.");
        balanceGuard(w, 1, fee);
        const min = issued(D(1).div(D(m.ask).mul(1.0049)));
        if (D(line.limit).minus(line.balance).lt(D(1).div(m.ask).mul(1.005)))
          throw new Error("Trust line capacity is too small.");
        tx = {
          ...tx,
          TransactionType: "OfferCreate",
          Flags: 0x800a0000,
          TakerGets: "1000000",
          TakerPays: { ...i.asset, value: min },
        };
      } else {
        const qty = D(c.position.quantity);
        if (qty.lte(0) || D(line.balance).lt(qty))
          throw new Error("Cycle holding does not match the ledger balance.");
        if (
          c.run?.cycleStarted &&
          Date.now() - c.run.cycleStarted > LIMITS.duration &&
          i.automatic
        )
          throw new Error(
            "Cycle exceeded ten minutes; residual holding requires attention.",
          );
        if (i.automatic && c.run.sellAttempts >= LIMITS.attempts)
          throw new Error(
            "Sell attempt limit reached; residual holding remains.",
          );
        balanceGuard(w, 0, fee);
        const min = drops(qty.mul(m.bid).mul(0.9951));
        if (D(min).lte(0))
          throw new Error("Residual holding is below one XRP drop of value.");
        tx = {
          ...tx,
          TransactionType: "OfferCreate",
          Flags: 0x800a0000,
          TakerGets: { ...i.asset, value: issued(qty) },
          TakerPays: min,
        };
      }
    }
  }
  return tx;
}
async function reconcile(lease, i, h) {
  try {
    const result = await rpc("tx", {
      transaction: i.hash,
      binary: false,
      min_ledger: i.firstLedger,
      max_ledger: i.lastLedger,
    });
    if (result.validated) {
      const actual = actualResult(
        result,
        (await rootRef().get()).data().trader.address,
        i.asset,
      );
      await finish(
        lease,
        actual.result === "tesSUCCESS" ? "validated" : "failed",
        actual.result === "tesSUCCESS" ? null : actual.result,
        actual,
      );
      return true;
    }
  } catch (e) {
    if (e.code !== "txnNotFound") throw e;
    if (
      h.index > i.lastLedger &&
      (e.result?.searched_all === true ||
        covered(h.complete, i.firstLedger, i.lastLedger))
    ) {
      const c = (await rootRef().get()).data();
      const w = await wallet(c.trader.address, h);
      if (w.funded && w.sequence > i.sequence) {
        await rootRef().update({
          enabled: false,
          health: {
            error:
              "Unknown sequence consumption. Pending transaction requires review.",
            at: Date.now(),
          },
        });
        return false;
      }
      await finish(
        lease,
        "expired",
        "Transaction did not validate before its ledger expiry.",
      );
      return true;
    }
  }
  return false;
}
export async function processPending(deps = {}) {
  const lease = await takeLease();
  if (!lease) return;
  try {
    let c = (await rootRef().get()).data(),
      i = (await rootRef().collection("intents").doc(lease.id).get()).data();
    let h = await ledger();
    if (i.hash && (await reconcile(lease, i, h))) return;
    if (i.submittedAt) {
      await mutate(lease, (t, r, ref) =>
        t.update(ref, { status: "pending", updatedAt: Date.now() }),
      );
      return;
    }
    await activeOwner();
    if (i.revision !== c.revision || (i.automatic && !c.enabled)) {
      await finish(lease, "cancelled", "Paused before submission.");
      return;
    }
    if (!i.hash) {
      await mutate(lease, (t, r, ref) =>
        t.update(ref, { status: "signing", updatedAt: Date.now() }),
      );
      const tx = await prepare(c, i, h);
      const secret = c.trader.secretVersion;
      if (
        !new RegExp(
          `^projects/(?:${PROJECT}|881476176668)/secrets/XRPL_TESTNET_TRADER_SEED/versions/[0-9]+$`,
        ).test(secret)
      )
        throw new Error("Invalid pinned signing secret.");
      let signer;
      if (deps.signer) signer = deps.signer;
      else {
        const client = new SecretManagerServiceClient();
        const [v] = await client.accessSecretVersion({ name: secret });
        signer = Wallet.fromSeed(v.payload.data.toString());
      }
      if (signer.classicAddress !== c.trader.address)
        throw new Error("Signing account mismatch.");
      await activeOwner();
      await ledger(); // Verify the network again immediately before signing.
      const signed = signer.sign(tx);
      await mutate(lease, (t, r, ref, state, intent) => {
        if (
          state.revision !== intent.revision ||
          (intent.automatic && !state.enabled)
        )
          throw new Error("Paused before signing completed.");
        t.create(r.collection("payloads").doc(lease.id), {
          blob: signed.tx_blob,
        });
        t.update(ref, {
          status: "signing",
          hash: signed.hash,
          sequence: tx.Sequence,
          firstLedger: h.index,
          lastLedger: tx.LastLedgerSequence,
          quoteAt: h.at,
          updatedAt: Date.now(),
        });
      });
      i = (await rootRef().collection("intents").doc(lease.id).get()).data();
    }
    h = await ledger();
    if (Date.now() - i.quoteAt > 30000 || h.index >= i.lastLedger) {
      await finish(
        lease,
        "cancelled",
        "Quote expired before first submission.",
      );
      return;
    }
    // Recheck permissions, reserves and market at the submission gate. The stored
    // payload is immutable: retries reconcile this hash, never generate a new buy.
    c = (await rootRef().get()).data();
    await activeOwner();
    const freshTx = await prepare(c, i, h);
    const stored = (
      await rootRef().collection("payloads").doc(lease.id).get()
    ).data();
    const original = decode(stored.blob);
    if (original.Sequence !== freshTx.Sequence)
      throw new Error("Wallet sequence changed before submission.");
    if (
      i.action === "buy" &&
      D(original.TakerPays.value).lt(freshTx.TakerPays.value)
    )
      throw new Error("Buy quote moved beyond the fresh price limit.");
    if (i.action === "sell" && D(original.TakerPays).lt(freshTx.TakerPays))
      throw new Error("Sell quote moved beyond the fresh price limit.");
    const allowed = await mutate(lease, (t, r, ref, state, intent) => {
      if (
        state.revision !== intent.revision ||
        (intent.automatic && !state.enabled)
      )
        return false;
      const updates = {};
      if (intent.action === "buy") {
        const day = new Date().toISOString().slice(0, 10),
          spent = state.budget.day === day ? D(state.budget.spent) : D(0);
        if (spent.plus(1).gt(10))
          throw new Error("Daily purchase budget reached.");
        updates.budget = { day, spent: spent.plus(1).toString() };
      }
      if (intent.action === "sell" && state.run)
        updates.run = {
          ...state.run,
          sellAttempts: state.run.sellAttempts + 1,
          status: "Waiting for sell validation",
        };
      if (Object.keys(updates).length) t.update(r, updates);
      t.update(ref, {
        status: "submitted",
        submittedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return true;
    });
    if (!allowed) {
      await finish(lease, "cancelled", "Paused before submission.");
      return;
    }
    try {
      await rpc("submit", { tx_blob: stored.blob, fail_hard: false });
    } catch {
      /* A lost response is pending, never proof of failure. */
    }
    for (let n = 0; n < 4; n++) {
      await (deps.sleep
        ? deps.sleep()
        : new Promise((r) => setTimeout(r, 4000)));
      h = await ledger();
      if (await reconcile(lease, i, h)) return;
    }
    await mutate(lease, (t, r, ref) =>
      t.update(ref, { status: "pending", updatedAt: Date.now() }),
    );
  } catch (e) {
    const ref = rootRef().collection("intents").doc(lease.id),
      i = (await ref.get()).data();
    if (i?.submittedAt) {
      await rootRef().set(
        { enabled: false, health: { error: message(e), at: Date.now() } },
        { merge: true },
      );
    } else {
      try {
        await finish(lease, "failed", message(e));
      } catch {
        /* lease owner changed; recovery owns this intent */
      }
    }
  } finally {
    await getFirestore().runTransaction(async (t) => {
      const r = rootRef(),
        s = await t.get(r);
      if (s.data()?.lease?.token === lease.token) t.update(r, { lease: null });
    });
  }
}
export async function tick() {
  const root = rootRef();
  try {
    const c = await ensureState();
    await root.set({ health: { heartbeat: Date.now() } }, { merge: true });
    if (c.pending) {
      await dispatch(c.pending);
      return;
    }
    await activeOwner();
    if (!c.enabled) return;
    if (c.run.completed >= 3) {
      await root.update({
        enabled: false,
        "run.status": "Completed three cycles",
      });
      return;
    }
    const h = await ledger(),
      w = await wallet(c.trader.address, h);
    if (!w.funded) throw new Error(w.reason);
    let action;
    if (D(c.position.quantity).gt(0)) {
      if (c.run.sellAttempts >= 5 || Date.now() - c.run.cycleStarted > 600000)
        throw new Error("Sell limits reached; residual holding remains.");
      action = "sell";
    } else {
      const line = w.lines.find(
        (l) => l.currency === c.asset.currency && l.account === c.asset.issuer,
      );
      action = line ? "buy" : "trust";
    }
    await enqueue(
      action,
      `${c.run.id}-${c.run.completed}-${action}-${action === "sell" ? c.run.sellAttempts : 0}`,
      true,
    );
  } catch (e) {
    await root.set(
      { enabled: false, health: { error: message(e), heartbeat: Date.now() } },
      { merge: true },
    );
  }
}
export const testnetWorker = onTaskDispatched(
  {
    region: "us-central1",
    serviceAccount: SIGNER_SA,
    invoker: [API_SA, SIGNER_SA],
    timeoutSeconds: 90,
    memory: "512MiB",
    maxInstances: 1,
    concurrency: 1,
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 15 },
    rateLimits: { maxConcurrentDispatches: 1, maxDispatchesPerSecond: 1 },
  },
  async () => processPending(),
);
export const testnetTick = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    serviceAccount: API_SA,
    timeoutSeconds: 120,
    maxInstances: 1,
    memory: "256MiB",
  },
  tick,
);
