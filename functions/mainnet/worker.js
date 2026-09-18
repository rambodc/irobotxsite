import { getFirestore } from "firebase-admin/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Wallet, decode } from "xrpl";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { canTrade, tradingOwner } from "../trading/access.js";
import {
  D,
  PROJECT,
  RLUSD,
  API_SA,
  SIGNER_SA,
  LIMITS,
  safeMessage,
} from "./config.js";
import {
  rpc,
  ledger,
  wallet,
  actualResult,
  covered,
  ledgerFailure,
} from "./ledger.js";
import {
  rootRef,
  activeOwner,
  takeLease,
  releaseLease,
  mutate,
} from "./state.js";
import { swapAllowed } from "./swap.js";
import { prepare, verifyFresh } from "./execution.js";
import { approvalValid, accountFill } from "./strategy.js";
const tokenBalance = (w) =>
  w.lines.find(
    (l) => l.currency === RLUSD.currency && l.account === RLUSD.issuer,
  )?.balance || "0";
export async function finish(lease, status, error, result = null) {
  await mutate(lease, (t, root, ref, c, i) => {
    const position = result
      ? accountFill(c.position, i.action, result)
      : c.position;
    const closed = i.action === "sell" && D(position.quantity).eq(0);
    const fatal = status !== "validated" && i.action !== "sell";
    const noFill =
      result &&
      ["buy", "sell", "swap"].includes(i.action) &&
      D(result.tradeXrp).eq(0);
    t.update(ref, {
      status,
      error: error || (noFill ? "Validated order had no fill." : null),
      result,
      updatedAt: Date.now(),
    });
    const updates = {
      pending: null,
      position,
      health: {
        ...c.health,
        lastReconciled: Date.now(),
        ...(status === "validated" ? { lastSuccess: Date.now() } : {}),
        error: error || null,
      },
    };
    if (result && i.beforeBalance !== undefined)
      updates.expected = {
        xrp: D(i.beforeBalance).plus(result.xrpChange).toString(),
        rlusd: D(i.beforeToken).plus(result.tokenChange).toString(),
        ledger: result.ledger,
      };
    if (closed) {
      updates.exit = null;
      updates.cooldownUntil = Date.now() + LIMITS.cooldown;
      if (c.mode === "closing") {
        updates.enabled = false;
        updates.mode = "paused";
      }
    }
    if (fatal) {
      updates.enabled = false;
      updates.mode = "paused";
    }
    t.update(root, updates);
  });
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
        RLUSD,
      );
      await finish(
        lease,
        actual.result === "tesSUCCESS" ? "validated" : "failed",
        actual.result === "tesSUCCESS" ? null : ledgerFailure(actual.result),
        { ...actual, markPrice: i.markPrice },
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
          mode: "paused",
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
      const prepared = await prepare(c, i, h);
      const tx = prepared.tx;
      const secret = c.trader.secretVersion;
      if (
        !new RegExp(
          `^projects/(?:${PROJECT}|881476176668)/secrets/XRPL_MAINNET_TRADER_SEED/versions/[0-9]+$`,
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
          markPrice: prepared.markPrice,
          beforeBalance: prepared.wallet.balance,
          beforeToken: tokenBalance(prepared.wallet),
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
    const fresh = await prepare(c, i, h);
    const freshTx = fresh.tx;
    const stored = (
      await rootRef().collection("payloads").doc(lease.id).get()
    ).data();
    const original = decode(stored.blob);
    verifyFresh(original, freshTx);
    const allowed = await mutate(lease, async (t, r, ref, state, intent) => {
      const profile = await t.get(
        getFirestore().doc(`users/${tradingOwner()}`),
      );
      if (!canTrade(tradingOwner(), profile.data()))
        throw new Error("Trading owner access is disabled.");
      if (
        state.revision !== intent.revision ||
        (intent.automatic && !state.enabled)
      )
        return false;
      if (intent.action === "swap") {
        swapAllowed(state);
        if (intent.swap.validUntil <= Date.now())
          throw new Error(
            "Swap quote expired before submission. Request a new quote.",
          );
      }
      const updates = {};
      if (intent.action === "buy") {
        const day = new Date().toISOString().slice(0, 10),
          spent = state.budget.day === day ? D(state.budget.spent) : D(0);
        if (
          !approvalValid(state.analysis, state) ||
          state.analysis.id !== intent.decisionId
        )
          throw new Error("AI approval expired before submission.");
        if (
          spent.plus(state.settings.purchase).gt(state.settings.dailyPurchases)
        )
          throw new Error("Daily purchase budget reached.");
        updates.budget = {
          day,
          spent: spent.plus(state.settings.purchase).toString(),
        };
        updates.analysis = { ...state.analysis, usedBy: lease.id };
      }
      if (intent.action === "sell")
        updates.exit = { ...state.exit, attempts: state.exit.attempts + 1 };
      if (Object.keys(updates).length) t.update(r, updates);
      t.update(ref, {
        status: "submitted",
        submittedAt: Date.now(),
        beforeBalance: fresh.wallet.balance,
        beforeToken: tokenBalance(fresh.wallet),
        updatedAt: Date.now(),
      });
      return true;
    });
    if (!allowed) {
      await finish(lease, "cancelled", "Paused before submission.");
      return;
    }
    i = (await rootRef().collection("intents").doc(lease.id).get()).data();
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
        {
          enabled: false,
          mode: "paused",
          health: { error: safeMessage(e), at: Date.now() },
        },
        { merge: true },
      );
    } else {
      try {
        await finish(lease, "failed", safeMessage(e));
      } catch {
        /* lease owner changed; recovery owns this intent */
      }
    }
  } finally {
    await releaseLease(lease);
  }
}

export const mainnetWorker = onTaskDispatched(
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
