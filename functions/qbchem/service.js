import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { randomBytes } from "node:crypto";
import { chemicalInput, recipeInput, batchInput, text, num } from "./policy.js";
import {
  scaleRecipe,
  costBatch,
  containersFromBase,
  residualToClear,
} from "./costing.js";
import * as qbo from "./qbo.js";

const qboClientId = defineSecret("QBO_CLIENT_ID");
const qboClientSecret = defineSecret("QBO_CLIENT_SECRET");

export const OAUTH_REDIRECT =
  "https://us-central1-irobotxsite.cloudfunctions.net/qbChemOAuthCallback";

const chemCol = () => getFirestore().collection("qbChemChemicals");
const recipeCol = () => getFirestore().collection("qbChemRecipes");
const batchCol = () => getFirestore().collection("qbChemBatches");
const syncCol = () => getFirestore().collection("qbChemSyncLog");
const settingsRef = () => getFirestore().doc("qbChemConfig/settings");
const oauthStateRef = (state) =>
  getFirestore().doc(`qbChemOAuthStates/${state}`);

const stamp = () => FieldValue.serverTimestamp();

function creds() {
  return {
    clientId: qboClientId.value(),
    clientSecret: qboClientSecret.value(),
  };
}

function mapHttps(e) {
  if (e instanceof HttpsError) throw e;
  if (e.message === "permission-denied")
    throw new HttpsError("permission-denied", "Administrator access required.");
  if (e.message === "invalid-argument")
    throw new HttpsError("invalid-argument", "Request could not be accepted.");
  if (e.message === "qbo-not-connected")
    throw new HttpsError(
      "failed-precondition",
      "QuickBooks is not connected. Connect the sandbox first.",
    );
  if (e.message === "qbo-api-error") {
    console.error("QBO API error", { status: e.status });
    throw new HttpsError("internal", "QuickBooks request failed.");
  }
  console.error("QB Chem operation failed", { code: e.code || e.message });
  throw new HttpsError("internal", "The request could not be completed.");
}

function call(options, fn) {
  // endpoint factory injected from index.js
  return options.__endpoint(options, async (request) => {
    try {
      return await fn(request);
    } catch (e) {
      mapHttps(e);
    }
  });
}

export function createQbChemHandlers({ endpoint, base, current }) {
  const secretsBase = {
    ...base,
    secrets: [qboClientId, qboClientSecret],
    timeoutSeconds: 120,
    memory: "512MiB",
  };

  const adminCall = (opts, fn) =>
    endpoint(opts, async (request) => {
      try {
        const account = await current(request, true);
        return await fn(request, account);
      } catch (e) {
        mapHttps(e);
      }
    });

  const qbChemStatus = adminCall(secretsBase, async () => {
    const [conn, settings, chemicals, recipes, batches] = await Promise.all([
      qbo.publicConnection(await qbo.getConnection()),
      settingsRef().get(),
      chemCol().orderBy("name").limit(100).get(),
      recipeCol().orderBy("name").limit(100).get(),
      batchCol().orderBy("createdAt", "desc").limit(50).get(),
    ]);
    return {
      connection: conn,
      settings: settings.exists ? publicSettings(settings.data()) : null,
      oauthRedirectUri: OAUTH_REDIRECT,
      chemicals: chemicals.docs.map((d) => serializeChem(d.id, d.data())),
      recipes: recipes.docs.map((d) => serializeRecipe(d.id, d.data())),
      batches: batches.docs.map((d) => serializeBatch(d.id, d.data())),
    };
  });

  const qbChemUpsertChemical = adminCall(secretsBase, async (request, account) => {
    const input = chemicalInput(request.data || {});
    const id = request.data.id ? text(request.data.id, 128) : null;
    const c = creds();
    const settings = await ensureSettings(c);

    if (id) {
      const ref = chemCol().doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError("not-found", "Chemical not found.");
      const prev = snap.data();
      if (prev.qboItemId) {
        const existing = (await qbo.getItem(c, prev.qboItemId)).Item;
        await qbo.updateItem(c, {
          Id: prev.qboItemId,
          SyncToken: existing.SyncToken,
          sparse: true,
          Name: existing.Name,
          Type: "Inventory",
          TrackQtyOnHand: true,
          QtyOnHand: existing.QtyOnHand,
          InvStartDate: existing.InvStartDate,
          PurchaseCost: input.purchaseCost,
          UnitPrice: input.unitPrice,
          IncomeAccountRef: existing.IncomeAccountRef,
          ExpenseAccountRef: existing.ExpenseAccountRef,
          AssetAccountRef: existing.AssetAccountRef,
          ...(input.sku ? { Sku: input.sku } : {}),
        });
      }
      const containers = containersFromBase(
        prev.qtyBaseOnHand || 0,
        input.containerCapacity,
      );
      await ref.update({
        ...input,
        containersOnHand: containers.containers,
        updatedAt: stamp(),
        updatedBy: account.uid,
      });
      const next = (await ref.get()).data();
      return serializeChem(id, next);
    }

    const startQty = num(Number(request.data.initialQtyBase ?? 0), { min: 0 });
    const itemBody = {
      Name: input.name,
      Type: "Inventory",
      TrackQtyOnHand: true,
      QtyOnHand: startQty,
      InvStartDate: new Date().toISOString().slice(0, 10),
      PurchaseCost: input.purchaseCost,
      UnitPrice: input.unitPrice || input.purchaseCost,
      IncomeAccountRef: { value: settings.incomeAccountId },
      ExpenseAccountRef: { value: settings.cogsAccountId },
      AssetAccountRef: { value: settings.inventoryAssetId },
    };
    if (input.sku) itemBody.Sku = input.sku;
    let created;
    try {
      created = await qbo.createItem(c, itemBody);
    } catch (e) {
      // Name collision — suffix and retry once
      itemBody.Name = `${input.name} (${Date.now().toString(36).slice(-4)})`;
      created = await qbo.createItem(c, itemBody);
    }
    const qboItemId = created.Item.Id;
    const containers = containersFromBase(startQty, input.containerCapacity);
    const ref = chemCol().doc();
    const doc = {
      ...input,
      name: created.Item.Name || input.name,
      qboItemId,
      qtyBaseOnHand: startQty,
      containersOnHand: containers.containers,
      createdAt: stamp(),
      updatedAt: stamp(),
      createdBy: account.uid,
    };
    await ref.set(doc);
    await logSync("create-chemical", { chemicalId: ref.id, qboItemId }, true);
    return serializeChem(ref.id, { ...doc, createdAt: null, updatedAt: null });
  });

  const qbChemUpsertRecipe = adminCall(base, async (request, account) => {
    const input = recipeInput(request.data || {});
    const finished = await chemCol().doc(input.finishedChemicalId).get();
    if (!finished.exists || finished.data().kind !== "finished")
      throw new HttpsError("invalid-argument", "Finished product required.");
    for (const line of input.lines) {
      const raw = await chemCol().doc(line.chemicalId).get();
      if (!raw.exists || raw.data().kind !== "raw")
        throw new HttpsError(
          "invalid-argument",
          "Recipe lines must be raw chemicals.",
        );
    }
    const id = request.data.id ? text(request.data.id, 128) : null;
    if (id) {
      const ref = recipeCol().doc(id);
      if (!(await ref.get()).exists)
        throw new HttpsError("not-found", "Recipe not found.");
      await ref.update({ ...input, updatedAt: stamp(), updatedBy: account.uid });
      return serializeRecipe(id, (await ref.get()).data());
    }
    const ref = recipeCol().doc();
    const doc = {
      ...input,
      createdAt: stamp(),
      updatedAt: stamp(),
      createdBy: account.uid,
    };
    await ref.set(doc);
    return serializeRecipe(ref.id, { ...doc, createdAt: null, updatedAt: null });
  });

  const qbChemPostBatch = adminCall(secretsBase, async (request, account) => {
    const input = batchInput(request.data || {});
    const recipeSnap = await recipeCol().doc(input.recipeId).get();
    if (!recipeSnap.exists || recipeSnap.data().active === false)
      throw new HttpsError("not-found", "Recipe not found.");
    const recipe = recipeSnap.data();
    const scaled = scaleRecipe(recipe, input.outputQtyBase);
    const unitCosts = {};
    const chemSnaps = {};
    for (const line of scaled.lines) {
      const snap = await chemCol().doc(line.chemicalId).get();
      if (!snap.exists) throw new HttpsError("not-found", "Raw chemical missing.");
      const chem = snap.data();
      if ((chem.qtyBaseOnHand || 0) + 1e-9 < line.qtyBase)
        throw new HttpsError(
          "failed-precondition",
          `Insufficient stock for ${chem.name}.`,
        );
      chemSnaps[line.chemicalId] = { id: snap.id, ...chem };
      unitCosts[line.chemicalId] = Number(chem.purchaseCost) || 0;
    }
    const finishedSnap = await chemCol().doc(recipe.finishedChemicalId).get();
    if (!finishedSnap.exists)
      throw new HttpsError("not-found", "Finished chemical missing.");
    const finished = { id: finishedSnap.id, ...finishedSnap.data() };
    const costing = costBatch(scaled.lines, unitCosts, input.outputQtyBase);
    const settings = await ensureSettings(creds());
    const c = creds();
    const batchRef = batchCol().doc();
    const txnDate = new Date().toISOString().slice(0, 10);
    const privateNote = `QB Chem batch ${batchRef.id}${
      input.lotNumber ? ` lot ${input.lotNumber}` : ""
    }`;

    await batchRef.set({
      recipeId: input.recipeId,
      finishedChemicalId: finished.id,
      outputQtyBase: input.outputQtyBase,
      outputContainers: containersFromBase(
        input.outputQtyBase,
        finished.containerCapacity,
      ).containers,
      lotNumber: input.lotNumber || "",
      note: input.note || "",
      status: "posting",
      costTotal: costing.costTotal,
      costPerBase: costing.costPerBase,
      consumed: costing.consumed,
      qbo: {},
      createdBy: account.uid,
      createdAt: stamp(),
    });

    try {
      const decreaseLines = costing.consumed.map((line) => ({
        DetailType: "ItemAdjustmentLineDetail",
        ItemAdjustmentLineDetail: {
          ItemRef: { value: chemSnaps[line.chemicalId].qboItemId },
          QtyDiff: -line.qtyBase,
        },
      }));
      const iaDown = await qbo.createInventoryAdjustment(c, {
        AdjustAccountRef: { value: settings.wipAccountId },
        TxnDate: txnDate,
        PrivateNote: `${privateNote} — consume raws`,
        DocNumber: docNum("R", batchRef.id),
        Line: decreaseLines,
      });

      const fgItem = (await qbo.getItem(c, finished.qboItemId)).Item;
      await qbo.updateItem(c, {
        Id: finished.qboItemId,
        SyncToken: fgItem.SyncToken,
        sparse: true,
        PurchaseCost: costing.costPerBase,
        Name: fgItem.Name,
        Type: "Inventory",
        TrackQtyOnHand: true,
        QtyOnHand: fgItem.QtyOnHand,
        InvStartDate: fgItem.InvStartDate,
        IncomeAccountRef: fgItem.IncomeAccountRef,
        ExpenseAccountRef: fgItem.ExpenseAccountRef,
        AssetAccountRef: fgItem.AssetAccountRef,
      });

      const iaUp = await qbo.createInventoryAdjustment(c, {
        AdjustAccountRef: { value: settings.wipAccountId },
        TxnDate: txnDate,
        PrivateNote: `${privateNote} — produce finished`,
        DocNumber: docNum("F", batchRef.id),
        Line: [
          {
            DetailType: "ItemAdjustmentLineDetail",
            ItemAdjustmentLineDetail: {
              ItemRef: { value: finished.qboItemId },
              QtyDiff: input.outputQtyBase,
            },
          },
        ],
      });

      let journalEntryId = null;
      let wipBalance = 0;
      const wip = (await qbo.getAccount(c, settings.wipAccountId)).Account;
      wipBalance = Number(wip.CurrentBalance || 0);
      const residual = residualToClear(wipBalance);
      if (Math.abs(residual) >= 0.01) {
        const je = await qbo.createJournalEntry(c, {
          TxnDate: txnDate,
          PrivateNote: `${privateNote} — clear WIP residual`,
          Line: [
            {
              Amount: Math.abs(residual),
              DetailType: "JournalEntryLineDetail",
              Description: "QB Chem WIP clear",
              JournalEntryLineDetail: {
                PostingType: residual > 0 ? "Credit" : "Debit",
                AccountRef: { value: settings.wipAccountId },
              },
            },
            {
              Amount: Math.abs(residual),
              DetailType: "JournalEntryLineDetail",
              Description: "QB Chem WIP clear",
              JournalEntryLineDetail: {
                PostingType: residual > 0 ? "Debit" : "Credit",
                AccountRef: { value: settings.inventoryAssetId },
              },
            },
          ],
        });
        journalEntryId = je.JournalEntry?.Id || null;
      }

      for (const line of costing.consumed) {
        const chem = chemSnaps[line.chemicalId];
        const nextQty = roundQty(chem.qtyBaseOnHand - line.qtyBase);
        const caps = containersFromBase(nextQty, chem.containerCapacity);
        await chemCol().doc(chem.id).update({
          qtyBaseOnHand: nextQty,
          containersOnHand: caps.containers,
          updatedAt: stamp(),
        });
      }
      const nextFg = roundQty(finished.qtyBaseOnHand + input.outputQtyBase);
      const fgCaps = containersFromBase(nextFg, finished.containerCapacity);
      await chemCol().doc(finished.id).update({
        qtyBaseOnHand: nextFg,
        containersOnHand: fgCaps.containers,
        purchaseCost: costing.costPerBase,
        updatedAt: stamp(),
      });

      const qboMeta = {
        adjustmentIds: [
          iaDown.InventoryAdjustment?.Id,
          iaUp.InventoryAdjustment?.Id,
        ].filter(Boolean),
        journalEntryId,
        wipResidualCleared: residual,
        wipBalanceBeforeClear: wipBalance,
        syncedAt: new Date().toISOString(),
      };
      await batchRef.update({
        status: "posted",
        qbo: qboMeta,
        postedAt: stamp(),
      });
      await logSync("post-batch", { batchId: batchRef.id, ...qboMeta }, true);
      return {
        id: batchRef.id,
        status: "posted",
        costTotal: costing.costTotal,
        costPerBase: costing.costPerBase,
        qbo: qboMeta,
      };
    } catch (e) {
      await batchRef.update({
        status: "failed",
        qbo: { error: String(e.message || e) },
        updatedAt: stamp(),
      });
      await logSync(
        "post-batch",
        { batchId: batchRef.id, error: e.message },
        false,
      );
      throw e;
    }
  });

  const qbChemConnectStart = adminCall(secretsBase, async (_request, account) => {
    const state = randomBytes(24).toString("hex");
    await oauthStateRef(state).set({
      uid: account.uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    const url = qbo.authorizeUrl({
      clientId: qboClientId.value(),
      redirectUri: OAUTH_REDIRECT,
      state,
    });
    return { url, redirectUri: OAUTH_REDIRECT };
  });

  const qbChemEnsureSetup = adminCall(secretsBase, async () => {
    const settings = await ensureSettings(creds());
    return { settings: publicSettings(settings) };
  });

  const qbChemOAuthCallback = onRequest(
    {
      region: "us-central1",
      secrets: [qboClientId, qboClientSecret],
      cors: false,
      maxInstances: 2,
      timeoutSeconds: 60,
    },
    async (req, res) => {
      try {
        if (req.method !== "GET") {
          res.status(405).send("Method not allowed");
          return;
        }
        const code = String(req.query.code || "");
        const state = String(req.query.state || "");
        const realmId = String(req.query.realmId || "");
        if (!code || !state || !realmId) {
          res.status(400).send("Missing OAuth parameters.");
          return;
        }
        const st = await oauthStateRef(state).get();
        if (!st.exists || st.data().expiresAt < Date.now()) {
          res.status(400).send("OAuth state expired. Start Connect again.");
          return;
        }
        const tokens = await qbo.exchangeCode({
          clientId: qboClientId.value(),
          clientSecret: qboClientSecret.value(),
          code,
          redirectUri: OAUTH_REDIRECT,
        });
        await qbo.saveConnection({
          env: "sandbox",
          realmId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
          connectedAt: FieldValue.serverTimestamp(),
          connectedBy: st.data().uid,
          companyName: null,
        });
        await oauthStateRef(state).delete();
        try {
          const info = await qbo.getCompanyInfo(
            {
              clientId: qboClientId.value(),
              clientSecret: qboClientSecret.value(),
            },
            realmId,
          );
          await qbo.saveConnection({
            companyName: info.CompanyInfo?.CompanyName || null,
          });
        } catch {
          /* optional */
        }
        res
          .status(200)
          .type("html")
          .send(
            "<!doctype html><html><body style=\"font-family:system-ui;padding:2rem\"><h1>QuickBooks connected</h1><p>You can close this tab and return to QB Chem.</p></body></html>",
          );
      } catch (e) {
        console.error("OAuth callback failed", { code: e.code || e.message });
        res.status(500).send("Could not complete QuickBooks connection.");
      }
    },
  );

  return {
    qbChemStatus,
    qbChemUpsertChemical,
    qbChemUpsertRecipe,
    qbChemPostBatch,
    qbChemConnectStart,
    qbChemEnsureSetup,
    qbChemOAuthCallback,
  };
}

function publicSettings(s) {
  return {
    wipAccountId: s.wipAccountId || null,
    inventoryAssetId: s.inventoryAssetId || null,
    incomeAccountId: s.incomeAccountId || null,
    cogsAccountId: s.cogsAccountId || null,
    ready: Boolean(s.wipAccountId && s.inventoryAssetId),
  };
}

function serializeChem(id, d) {
  return {
    id,
    name: d.name,
    kind: d.kind,
    baseUnit: d.baseUnit,
    containerType: d.containerType,
    containerCapacity: d.containerCapacity,
    sku: d.sku || "",
    notes: d.notes || "",
    purchaseCost: d.purchaseCost ?? 0,
    unitPrice: d.unitPrice ?? 0,
    active: d.active !== false,
    qboItemId: d.qboItemId || null,
    qtyBaseOnHand: d.qtyBaseOnHand ?? 0,
    containersOnHand: d.containersOnHand ?? 0,
  };
}

function serializeRecipe(id, d) {
  return {
    id,
    name: d.name,
    finishedChemicalId: d.finishedChemicalId,
    outputQtyBase: d.outputQtyBase,
    lines: d.lines || [],
    active: d.active !== false,
  };
}

function serializeBatch(id, d) {
  return {
    id,
    recipeId: d.recipeId,
    finishedChemicalId: d.finishedChemicalId,
    outputQtyBase: d.outputQtyBase,
    outputContainers: d.outputContainers,
    lotNumber: d.lotNumber || "",
    note: d.note || "",
    status: d.status,
    costTotal: d.costTotal,
    costPerBase: d.costPerBase,
    consumed: d.consumed || [],
    qbo: d.qbo || {},
  };
}

function roundQty(v) {
  return Math.round(Number(v) * 1e6) / 1e6;
}

function docNum(kind, id) {
  return `QC${kind}${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`.slice(0, 21);
}

async function logSync(action, summary, ok) {
  await syncCol().add({ action, ok, summary, at: stamp() });
}

async function ensureSettings(c) {
  const snap = await settingsRef().get();
  if (snap.exists && snap.data().wipAccountId && snap.data().inventoryAssetId) {
    return snap.data();
  }
  const accounts = await qbo.qboQuery(
    c,
    "select Id, Name, AccountType, AccountSubType from Account maxresults 200",
  );
  const list = accounts.QueryResponse?.Account || [];
  const find = (pred) => list.find(pred);
  const inventoryAsset = find(
    (a) => a.AccountSubType === "Inventory" || a.Name === "Inventory Asset",
  );
  const income = find(
    (a) =>
      a.Name === "Sales of Product Income" ||
      a.AccountSubType === "SalesOfProductIncome",
  );
  const cogs = find(
    (a) =>
      a.Name === "Cost of Goods Sold" ||
      a.AccountSubType === "SuppliesMaterialsCogs",
  );
  let wip = find((a) => a.Name === "Production WIP");
  if (!wip) {
    const created = await qbo.createAccount(c, {
      Name: "Production WIP",
      AccountType: "Other Current Asset",
      AccountSubType: "OtherCurrentAssets",
    });
    wip = created.Account;
  }
  if (!inventoryAsset || !income || !cogs) {
    throw new HttpsError(
      "failed-precondition",
      "Sandbox chart of accounts is missing inventory income/COGS accounts.",
    );
  }
  const settings = {
    wipAccountId: wip.Id,
    inventoryAssetId: inventoryAsset.Id,
    incomeAccountId: income.Id,
    cogsAccountId: cogs.Id,
    updatedAt: stamp(),
  };
  await settingsRef().set(settings, { merge: true });
  return settings;
}

void call;
