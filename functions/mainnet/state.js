import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getFunctions } from "firebase-admin/functions";
import { randomUUID } from "node:crypto";
import { canTrade, tradingOwner } from "../trading/access.js";
import { initialState, D } from "./config.js";
import { swapAllowed } from "./swap.js";
import { approvalValid } from "./strategy.js";
export const rootRef = () =>
  getFirestore().doc(`xrplMainnet/${tradingOwner()}`);
export const terminal = (s) =>
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
        "result",
        "error",
        "submittedAt",
        "reason",
        "withdrawal",
        "swap",
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
  const r = rootRef();
  await getFirestore().runTransaction(async (t) => {
    const s = await t.get(r);
    if (!s.data()?.trader?.address)
      throw new Error("Mainnet wallet provisioning is not complete.");
    if (!s.data().position) t.set(r, initialState(), { merge: true });
  });
  return (await r.get()).data();
}
export async function dispatch(id, worker = "mainnetWorker") {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;
  await getFunctions()
    .taskQueue(`locations/us-central1/functions/${worker}`)
    .enqueue({ id }, { dispatchDeadlineSeconds: 90 });
}
export async function enqueue(action, id, options = {}) {
  if (
    !["trust", "buy", "sell", "withdraw", "swap"].includes(action) ||
    !/^[-\w]{8,80}$/.test(id)
  )
    throw new Error("Invalid action or request ID.");
  await activeOwner();
  const root = rootRef(),
    ref = root.collection("intents").doc(id);
  const result = await getFirestore().runTransaction(async (t) => {
    const [s, old] = await Promise.all([t.get(root), t.get(ref)]),
      c = s.data();
    const withdrawal = options.withdrawal || null;
    const swapQuoteId = options.swapQuoteId || null;
    if (old.exists) {
      if (
        old.data().action !== action ||
        (old.data().swapQuoteId || null) !== swapQuoteId ||
        JSON.stringify(old.data().withdrawal) !== JSON.stringify(withdrawal)
      )
        throw new Error("Request ID belongs to another request.");
      return publicIntent(id, old.data());
    }
    if (c.provisioning !== "ready")
      throw new Error("Wallet provisioning is incomplete.");
    if (c.pending) throw new Error("Wait for the pending transaction.");
    if (options.automatic && !c.enabled)
      throw new Error("Automation is paused.");
    if (!options.automatic && c.mode !== "paused")
      throw new Error("Pause before requesting wallet actions.");
    if (
      action === "buy" &&
      (!options.automatic ||
        c.mode !== "running" ||
        D(c.position.quantity).gt(0) ||
        !approvalValid(c.analysis, c))
    )
      throw new Error("No fresh AI-approved entry is available.");
    if (action === "sell" && D(c.position.quantity).lte(0))
      throw new Error("No trading position to close.");
    if (
      action === "withdraw" &&
      (!withdrawal ||
        withdrawal.address !== c.returnAddress?.address ||
        withdrawal.tag !== c.returnAddress?.tag)
    )
      throw new Error("Withdrawal must use the saved return address.");
    let swap = null;
    if (action === "swap") {
      swapAllowed(c);
      if (
        options.automatic ||
        !/^[a-f0-9-]{36}$/.test(swapQuoteId || "") ||
        id !== `swap-${swapQuoteId}`
      )
        throw new Error("Invalid manual swap request.");
      const quote = await t.get(root.collection("swapQuotes").doc(swapQuoteId));
      if (
        !quote.exists ||
        quote.data().validUntil <= Date.now() ||
        quote.data().revision !== c.revision
      )
        throw new Error(
          "Swap quote expired or settings changed. Request a new quote.",
        );
      const { expiresAt, ...value } = quote.data();
      swap = value;
    }
    const intent = {
      action,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: c.revision,
      automatic: !!options.automatic,
      withdrawal,
      swapQuoteId,
      swap,
      reason:
        options.reason ||
        (swap
          ? `Manual ${swap.currency} → ${swap.receiveCurrency} swap`
          : action),
      decisionId: action === "buy" ? c.analysis.id : null,
    };
    t.create(ref, intent);
    t.update(root, { pending: id });
    return publicIntent(id, intent);
  });
  if (!terminal(result.status))
    try {
      await dispatch(id);
    } catch {
      await root.set(
        { health: { error: "Dispatch delayed; recovery will retry." } },
        { merge: true },
      );
    }
  return result;
}
export async function takeLease(kind = "worker", pending = true) {
  const r = rootRef(),
    token = randomUUID(),
    field = `${kind}Lease`;
  return getFirestore().runTransaction(async (t) => {
    const c = (await t.get(r)).data();
    if (!c || (pending && !c.pending) || c[field]?.until > Date.now())
      return null;
    t.update(r, { [field]: { token, until: Date.now() + 110000 } });
    return { token, id: c.pending, field };
  });
}
export async function releaseLease(l) {
  if (!l) return;
  await getFirestore().runTransaction(async (t) => {
    const r = rootRef(),
      c = (await t.get(r)).data();
    if (c?.[l.field]?.token === l.token) t.update(r, { [l.field]: null });
  });
}
export async function mutate(l, fn) {
  return getFirestore().runTransaction(async (t) => {
    const r = rootRef(),
      ref = r.collection("intents").doc(l.id);
    const [s, i] = await Promise.all([t.get(r), t.get(ref)]);
    const c = s.data();
    if (
      c?.[l.field]?.token !== l.token ||
      c[l.field].until < Date.now() ||
      c.pending !== l.id
    )
      throw new Error("Worker lease lost.");
    return fn(t, r, ref, c, i.data());
  });
}
