// QB Chem backend. QuickBooks Online is the single master for items; Firestore
// stores only what QuickBooks cannot (setup extras keyed by QBO Item Id,
// recipes, production runs, sync log). Everything is admin-only.
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createHash, randomBytes } from "node:crypto";
import { createInput, updateInput, setupInput, recipeInput, runInput, qboId, docId, InputError } from "./policy.js";
import { toItem, mergeCatalog, findDuplicates } from "./catalog.js";
import { planRun, settleRun, residualJournalLines, productionBillLines, productionDocNumber } from "./costing.js";
import { createQbo, QboError, isStale, isDuplicateName, isDuplicateDocNumber, authorizeUrl, exchangeCode, publicConnection, CONNECTION_DOC } from "./qbo.js";

const clientIdSecret = defineSecret("QBO_CLIENT_ID");
const clientSecretSecret = defineSecret("QBO_CLIENT_SECRET");
export const OAUTH_REDIRECT_URI = "https://us-central1-irobotxsite.cloudfunctions.net/qbChemOAuthCallback";
const TIME_ZONE = "America/Edmonton";
export const PRODUCTION_VENDOR = "Uniquem Production (internal)";
// Preferred purchase tax codes for the internal $0 bill, most suitable first (QuickBooks Canada names).
const TAX_CODE_PREFERENCE = ["Out of Scope", "Exempt", "Zero-rated"];

const db = () => getFirestore();
const setupCol = () => db().collection("qbChemItems");
const recipeCol = () => db().collection("qbChemRecipes");
const runCol = () => db().collection("qbChemRuns");
const logCol = () => db().collection("qbChemSyncLog");
const settingsRef = () => db().doc("qbChemConfig/settings");
const lockRef = () => db().doc("qbChemConfig/runLock");
const stateRef = (s) => db().doc(`qbChemOAuthStates/${s}`);
const stamp = () => FieldValue.serverTimestamp();
const iso = (t) => (t && typeof t.toDate === "function" ? t.toDate().toISOString() : t || null);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

function toHttps(e) {
  if (e instanceof HttpsError) return e;
  if (e instanceof InputError) return new HttpsError("invalid-argument", e.message);
  if (e?.message === "qbo-not-connected")
    return new HttpsError("failed-precondition", "QuickBooks is not connected. Open Settings to connect.");
  if (e?.message === "qbo-reauth")
    return new HttpsError("failed-precondition", "QuickBooks needs to be reconnected. Open Settings and choose Connect QuickBooks.");
  if (e instanceof QboError) {
    console.error("QuickBooks API error", { status: e.status, code: e.qboCode });
    return new HttpsError(e.status >= 500 ? "unavailable" : "failed-precondition", `QuickBooks: ${e.detail}`);
  }
  console.error("QB Chem failure", { code: e?.code || e?.message || "unknown" });
  return new HttpsError("internal", "QB Chem could not complete the request.");
}

async function log(action, ok, summary) {
  await logCol().add({ action, ok, summary, at: stamp() });
}

async function setupMap() {
  const snap = await setupCol().get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, publicSetup(d.data())]));
}
function publicSetup(d) {
  return { role: d.role, baseUnit: d.baseUnit, containerType: d.containerType, containerCapacity: d.containerCapacity, notes: d.notes || "" };
}
async function catalog(q) {
  const [items, setups] = await Promise.all([q.items(), setupMap()]);
  return mergeCatalog(items.map(toItem), setups);
}
async function catalogItem(q, id) {
  const [item, setup] = await Promise.all([q.getItem(id), setupCol().doc(id).get()]);
  return mergeCatalog([toItem(item)], setup.exists ? { [id]: publicSetup(setup.data()) } : {})[0];
}

async function ensureSettings(q) {
  const cur = (await settingsRef().get()).data() || {};
  if (cur.wipAccountId && cur.inventoryAssetId && cur.incomeAccountId && cur.cogsAccountId && cur.residualAccountId && cur.vendorId && "taxCodeId" in cur)
    return cur;
  const accounts = await q.accounts();
  const pick = (f) => accounts.find((a) => a.Active !== false && f(a));
  const inventory = pick((a) => a.AccountSubType === "Inventory");
  const income = pick((a) => a.AccountSubType === "SalesOfProductIncome");
  const cogs = pick((a) => a.AccountType === "Cost of Goods Sold" && a.AccountSubType === "SuppliesMaterialsCogs" && a.Name === "Cost of Goods Sold") ||
    pick((a) => a.AccountType === "Cost of Goods Sold");
  let wip = pick((a) => a.Name === "Production WIP");
  if (!wip) wip = await q.createAccount({ Name: "Production WIP", AccountType: "Other Current Asset", AccountSubType: "OtherCurrentAssets" });
  if (!inventory || !income || !cogs)
    throw new HttpsError("failed-precondition", "QuickBooks needs an Inventory Asset, a product income and a Cost of Goods Sold account.");
  let vendor = cur.vendorId ? { Id: cur.vendorId } : await q.vendorByName(PRODUCTION_VENDOR);
  if (!vendor)
    vendor = await q.createVendor({
      DisplayName: PRODUCTION_VENDOR,
      CompanyName: "Uniquem",
      Notes: "Internal vendor used by QB Chem for $0 production bills. Never pay or edit these bills.",
    });
  let taxCodeId = cur.taxCodeId ?? null;
  if (!("taxCodeId" in cur)) {
    const codes = (await q.taxCodes()).filter((c) => c.Active !== false);
    const code = TAX_CODE_PREFERENCE.map((n) => codes.find((c) => c.Name === n)).find(Boolean);
    taxCodeId = code ? String(code.Id) : "";
  }
  const next = {
    vendorId: String(vendor.Id),
    taxCodeId,
    wipAccountId: String(wip.Id),
    inventoryAssetId: String(inventory.Id),
    incomeAccountId: String(income.Id),
    cogsAccountId: String(cogs.Id),
    // Rounding cents left in WIP go back to Inventory Asset so the balance sheet carries full batch cost.
    residualAccountId: cur.residualAccountId || String(inventory.Id),
    updatedAt: stamp(),
  };
  await settingsRef().set(next, { merge: true });
  return next;
}
async function publicSettings(q) {
  const s = (await settingsRef().get()).data();
  if (!s) return null;
  const names = {};
  try {
    for (const a of await q.accounts()) names[a.Id] = a.Name;
  } catch {
    /* names are cosmetic */
  }
  const acct = (id) => (id ? { id, name: names[id] || `Account ${id}` } : null);
  let wipBalance = null;
  let taxCode = null;
  try {
    if (s.wipAccountId) wipBalance = Number((await q.getAccount(s.wipAccountId)).CurrentBalance || 0);
    if (s.taxCodeId) taxCode = { id: s.taxCodeId, name: (await q.taxCodes()).find((c) => String(c.Id) === s.taxCodeId)?.Name || `Tax code ${s.taxCodeId}` };
  } catch {
    /* informational */
  }
  return {
    vendor: s.vendorId ? { id: s.vendorId, name: PRODUCTION_VENDOR } : null,
    taxCode,
    wipBalance,
    wip: acct(s.wipAccountId),
    inventoryAsset: acct(s.inventoryAssetId),
    income: acct(s.incomeAccountId),
    cogs: acct(s.cogsAccountId),
    residual: acct(s.residualAccountId),
  };
}

function serializeRecipe(id, d) {
  return { id, name: d.name, outputItemId: d.outputItemId, outputQty: d.outputQty, lines: d.lines || [], notes: d.notes || "", updatedAt: iso(d.updatedAt) };
}
function serializeRun(id, d) {
  return {
    id,
    status: d.status,
    recipeId: d.recipeId,
    recipeName: d.recipeName,
    outputItemId: d.outputItemId,
    outputName: d.outputName,
    outputQty: d.outputQty,
    lotNumber: d.lotNumber || "",
    note: d.note || "",
    plan: d.plan || null,
    result: d.result || null,
    qbo: d.qbo || {},
    error: d.error || null,
    createdAt: iso(d.createdAt),
    postedAt: iso(d.postedAt),
  };
}

async function readRecipe(id) {
  const snap = await recipeCol().doc(docId(id, "Recipe")).get();
  if (!snap.exists) throw new HttpsError("not-found", "Recipe not found.");
  return serializeRecipe(snap.id, snap.data());
}

async function acquireLock(uid) {
  await db().runTransaction(async (tx) => {
    const cur = (await tx.get(lockRef())).data();
    if (cur && cur.until > Date.now())
      throw new HttpsError("aborted", "Another production run is posting. Try again in a minute.");
    tx.set(lockRef(), { until: Date.now() + 5 * 60 * 1000, by: uid });
  });
}
const releaseLock = () => lockRef().delete();

export function createActions(q, account) {
  return {
    async load() {
      const [items, recipes, runs, settings] = await Promise.all([
        catalog(q),
        recipeCol().orderBy("name").limit(200).get(),
        runCol().orderBy("createdAt", "desc").limit(50).get(),
        publicSettings(q),
      ]);
      return {
        syncedAt: new Date().toISOString(),
        connection: publicConnection((await db().doc(CONNECTION_DOC).get()).data()),
        settings,
        oauthRedirectUri: OAUTH_REDIRECT_URI,
        items,
        recipes: recipes.docs.map((d) => serializeRecipe(d.id, d.data())),
        runs: runs.docs.map((d) => serializeRun(d.id, d.data())),
      };
    },

    async checkName(d) {
      const items = await catalog(q);
      return { duplicates: findDuplicates({ name: String(d.name || ""), sku: String(d.sku || "") }, items, { excludeId: d.excludeId || null }) };
    },

    async createItem(d) {
      const input = createInput(d);
      const items = await catalog(q);
      const duplicates = findDuplicates(input, items);
      if (duplicates.length && !input.force) return { status: "duplicates", duplicates };
      const s = await ensureSettings(q);
      let created;
      try {
        created = await q.saveItem({
          Name: input.name,
          ...(input.sku ? { Sku: input.sku } : {}),
          Type: "Inventory",
          TrackQtyOnHand: true,
          QtyOnHand: input.startQty,
          InvStartDate: input.startDate || today(),
          PurchaseCost: input.purchaseCost,
          UnitPrice: input.unitPrice,
          AssetAccountRef: { value: s.inventoryAssetId },
          IncomeAccountRef: { value: s.incomeAccountId },
          ExpenseAccountRef: { value: s.cogsAccountId },
        });
      } catch (e) {
        if (isDuplicateName(e))
          return { status: "duplicates", duplicates: findDuplicates(input, items).filter((m) => m.reason === "exact"), blocked: true };
        throw e;
      }
      const id = String(created.Id);
      await setupCol().doc(id).set({ ...input.setup, createdAt: stamp(), updatedAt: stamp(), by: account.uid });
      await log("create-item", true, { itemId: id });
      return { status: "created", item: mergeCatalog([toItem(created)], { [id]: input.setup })[0] };
    },

    async saveSetup(d) {
      const id = qboId(d.itemId);
      const setup = setupInput(d.setup);
      let item = await q.getItem(id);
      if (item.Type !== "Inventory" && item.Type !== "NonInventory")
        throw new HttpsError("failed-precondition", "Only inventory and non-inventory items can be used in QB Chem.");
      if (d.reactivate === true && item.Active === false) {
        item = await q.saveItem({ Id: id, SyncToken: item.SyncToken, sparse: true, Active: true });
        await log("reactivate-item", true, { itemId: id });
      }
      await setupCol().doc(id).set({ ...setup, updatedAt: stamp(), by: account.uid }, { merge: true });
      await log("save-setup", true, { itemId: id });
      return { status: "saved", item: mergeCatalog([toItem(item)], { [id]: setup })[0] };
    },

    async updateItem(d) {
      const input = updateInput(d);
      const live = await q.getItem(input.itemId);
      if (String(live.SyncToken) !== input.syncToken)
        return { status: "conflict", item: await catalogItem(q, input.itemId) };
      const current = toItem(live);
      const changes = {};
      if (input.fields.name !== undefined && input.fields.name !== current.name) changes.Name = input.fields.name;
      if (input.fields.sku !== undefined && input.fields.sku !== current.sku) changes.Sku = input.fields.sku;
      if (input.fields.unitPrice !== undefined && input.fields.unitPrice !== current.unitPrice) changes.UnitPrice = input.fields.unitPrice;
      if (input.fields.purchaseCost !== undefined && input.fields.purchaseCost !== current.purchaseCost) changes.PurchaseCost = input.fields.purchaseCost;
      if ((changes.Name || changes.Sku) && !input.force) {
        const duplicates = findDuplicates({ name: input.fields.name ?? current.name, sku: changes.Sku || "" }, await catalog(q), { excludeId: input.itemId })
          .filter((m) => changes.Name || m.reason === "sku");
        if (duplicates.length) return { status: "duplicates", duplicates };
      }
      if (Object.keys(changes).length) {
        try {
          await q.saveItem({ Id: input.itemId, SyncToken: input.syncToken, sparse: true, ...changes });
        } catch (e) {
          if (isStale(e)) return { status: "conflict", item: await catalogItem(q, input.itemId) };
          if (isDuplicateName(e)) return { status: "duplicates", duplicates: [], blocked: true };
          throw e;
        }
        await log("update-item", true, { itemId: input.itemId, fields: Object.keys(changes) });
      }
      if (input.setup) await setupCol().doc(input.itemId).set({ ...input.setup, updatedAt: stamp(), by: account.uid }, { merge: true });
      return { status: "saved", item: await catalogItem(q, input.itemId) };
    },

    async saveRecipe(d) {
      const input = recipeInput(d);
      const byId = Object.fromEntries((await catalog(q)).map((i) => [i.id, i]));
      const check = (id, label) => {
        const i = byId[id];
        if (!i || i.type !== "Inventory" || !i.trackQty)
          throw new HttpsError("failed-precondition", `${label} must be a quantity-tracked inventory item in QuickBooks.`);
        if (!i.active) throw new HttpsError("failed-precondition", `${i.name} is inactive in QuickBooks.`);
      };
      check(input.outputItemId, "The finished product");
      input.lines.forEach((l, n) => check(l.itemId, `Input ${n + 1}`));
      const ref = input.id ? recipeCol().doc(input.id) : recipeCol().doc();
      if (input.id && !(await ref.get()).exists) throw new HttpsError("not-found", "Recipe not found.");
      const { id: _ignored, ...doc } = input;
      void _ignored;
      await ref.set({ ...doc, updatedAt: stamp(), by: account.uid, ...(input.id ? {} : { createdAt: stamp() }) }, { merge: true });
      return { recipe: serializeRecipe(ref.id, (await ref.get()).data()) };
    },

    async deleteRecipe(d) {
      const ref = recipeCol().doc(docId(d.id, "Recipe"));
      await ref.delete();
      return { deleted: ref.id };
    },

    async previewRun(d) {
      const recipe = await readRecipe(d.recipeId);
      const outputQty = runInput({ ...d, runDate: null, requestId: "00000000-0000-0000-0000-000000000000" }).outputQty;
      const byId = Object.fromEntries((await catalog(q)).map((i) => [i.id, i]));
      return { plan: planRun(recipe, outputQty, byId), recipe };
    },

    async postRun(d) {
      const input = runInput(d, { today: today() });
      const id = createHash("sha256").update(`run:${input.requestId}`).digest("hex").slice(0, 24);
      const ref = runCol().doc(id);
      const prior = await ref.get();
      if (prior.exists) return { run: serializeRun(id, prior.data()), repeated: true };
      const recipe = await readRecipe(input.recipeId);
      const items = await catalog(q);
      const byId = Object.fromEntries(items.map((i) => [i.id, i]));
      const plan = planRun(recipe, input.outputQty, byId);
      if (!plan.ok) throw new HttpsError("failed-precondition", plan.problems.join(" "));
      if (input.runDate) {
        const early = [recipe.outputItemId, ...plan.lines.map((l) => l.itemId)]
          .map((i) => byId[i])
          .filter((i) => i?.startDate && input.runDate < i.startDate);
        if (early.length)
          throw new HttpsError(
            "failed-precondition",
            `Production date is before the QuickBooks inventory start date of ${early.map((i) => `${i.name} (${i.startDate})`).join(", ")}.`,
          );
      }
      const s = await ensureSettings(q);
      await acquireLock(account.uid);
      try {
        try {
          await ref.create({
            status: "posting",
            recipeId: recipe.id,
            recipeName: recipe.name,
            outputItemId: recipe.outputItemId,
            outputName: plan.outputName,
            outputQty: plan.outputQty,
            lotNumber: input.lotNumber,
            note: input.note,
            plan,
            qbo: {},
            createdAt: stamp(),
            createdBy: account.uid,
          });
        } catch {
          return { run: serializeRun(id, (await ref.get()).data()), repeated: true };
        }
        const date = input.runDate || today();
        const tag = `QB Chem run ${id.slice(0, 8)} · ${recipe.name}${input.lotNumber ? ` · lot ${input.lotNumber}` : ""}`;
        const doc = (suffix) => `QC${id.slice(0, 6).toUpperCase()}-${suffix}`;
        const wipBalance = async () => Number((await q.getAccount(s.wipAccountId)).CurrentBalance || 0);
        const qboIds = {};
        try {
          const wipBefore = await wipBalance();
          const consume = await q.createAdjustment({
            DocNumber: doc("C"),
            TxnDate: date,
            AdjustAccountRef: { value: s.wipAccountId },
            PrivateNote: `${tag} · consume inputs`,
            Line: plan.lines.map((l) => ({
              DetailType: "ItemAdjustmentLineDetail",
              ItemAdjustmentLineDetail: { ItemRef: { value: l.itemId }, QtyDiff: -l.qty },
            })),
          });
          qboIds.consumeAdjustmentId = String(consume.Id);
          await ref.update({ qbo: qboIds });
          const consumed = settleRun({ wipBefore, wipAfterConsume: await wipBalance(), outputQty: plan.outputQty });

          // Finished goods arrive on a $0 internal bill at the exact batch cost; the negative line clears WIP.
          const bill = {
            VendorRef: { value: s.vendorId },
            TxnDate: date,
            DocNumber: productionDocNumber(input.lotNumber, id),
            PrivateNote: `${tag} · run id ${id}${input.note ? ` · ${input.note}` : ""}`,
            ...(s.taxCodeId ? { GlobalTaxCalculation: "TaxExcluded" } : {}),
            Line: productionBillLines({
              itemId: recipe.outputItemId,
              outputQty: plan.outputQty,
              actualCost: consumed.actualCost,
              wipAccountId: s.wipAccountId,
              taxCodeId: s.taxCodeId,
              description: `Production run ${id.slice(0, 8)}${input.lotNumber ? ` · lot ${input.lotNumber}` : ""} · ${plan.outputName}`,
            }),
          };
          let produced;
          try {
            produced = await q.createBill(bill);
          } catch (e) {
            if (!isDuplicateDocNumber(e)) throw e;
            produced = await q.createBill({ ...bill, DocNumber: productionDocNumber("", id) });
          }
          qboIds.billId = String(produced.Id);
          qboIds.billDocNumber = produced.DocNumber || "";
          await ref.update({ qbo: qboIds });

          const settled = settleRun({ wipBefore, wipAfterConsume: wipBefore + consumed.actualCost, wipAfterBill: await wipBalance(), outputQty: plan.outputQty });
          const jeLines = residualJournalLines(settled.residual, s.wipAccountId, s.residualAccountId, `${tag} · clear WIP rounding`);
          if (jeLines.length) {
            const je = await q.createJournal({ DocNumber: doc("R"), TxnDate: date, PrivateNote: `${tag} · clear WIP rounding`, Line: jeLines });
            qboIds.journalEntryId = String(je.Id);
          }
          const wipAfter = await wipBalance();
          const after = await Promise.all([recipe.outputItemId, ...plan.lines.map((l) => l.itemId)].map((i) => q.getItem(i)));
          const result = {
            actualCost: settled.actualCost,
            unitCost: settled.unitCost,
            billAmount: Number(produced.Line?.[0]?.Amount ?? consumed.actualCost),
            billTotal: Number(produced.TotalAmt ?? 0),
            residual: settled.residual,
            runDate: date,
            wipBefore,
            wipAfter,
            qtyAfter: Object.fromEntries(after.map((i) => [String(i.Id), Number(i.QtyOnHand ?? 0)])),
          };
          await ref.update({ status: "posted", qbo: qboIds, result, postedAt: stamp() });
          await log("post-run", true, { runId: id, ...qboIds, actualCost: result.actualCost });
          return { run: serializeRun(id, (await ref.get()).data()) };
        } catch (e) {
          const message =
            e instanceof QboError
              ? `QuickBooks: ${e.detail}`
              : e?.message === "negative-batch-cost"
                ? "QuickBooks valued the consumed inputs below $0 (check for negative stock)."
                : "Posting stopped unexpectedly.";
          await ref.update({ status: "failed", qbo: qboIds, error: `${message} QuickBooks records already created are listed on this run; review them before retrying.` });
          await log("post-run", false, { runId: id, ...qboIds });
          throw e;
        }
      } finally {
        await releaseLock();
      }
    },

    async ensureSetup() {
      await ensureSettings(q);
      return { settings: await publicSettings(q) };
    },

    async connectStart() {
      const state = randomBytes(24).toString("hex");
      await stateRef(state).set({ uid: account.uid, expiresAt: Date.now() + 15 * 60 * 1000 });
      return { url: authorizeUrl({ clientId: clientIdSecret.value(), redirectUri: OAUTH_REDIRECT_URI, state }), redirectUri: OAUTH_REDIRECT_URI };
    },
  };
}

export const ACTIONS = ["load", "checkName", "createItem", "saveSetup", "updateItem", "saveRecipe", "deleteRecipe", "previewRun", "postRun", "ensureSetup", "connectStart"];

export function createQbChemHandlers({ endpoint, base, current }) {
  const qbChemApi = endpoint(
    { ...base, secrets: [clientIdSecret, clientSecretSecret], timeoutSeconds: 120, memory: "512MiB" },
    async (request) => {
      const account = await current(request, true);
      const action = request.data?.action;
      if (!ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown QB Chem action.");
      try {
        const q = createQbo({ db: db(), clientId: clientIdSecret.value(), clientSecret: clientSecretSecret.value() });
        return await createActions(q, account)[action](request.data.payload || {});
      } catch (e) {
        throw toHttps(e);
      }
    },
  );

  const qbChemOAuthCallback = onRequest(
    { region: "us-central1", secrets: [clientIdSecret, clientSecretSecret], maxInstances: 2, timeoutSeconds: 60, memory: "256MiB" },
    async (req, res) => {
      const page = (title, body, status = 200) =>
        res
          .status(status)
          .set("Cache-Control", "no-store")
          .type("html")
          .send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;background:#080d16;color:#e8edf5;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-weight:500">${title}</h1><p style="color:#93a5bd">${body}</p></main></body>`);
      try {
        const code = String(req.query.code || "");
        const state = String(req.query.state || "");
        const realmId = String(req.query.realmId || "");
        if (req.method !== "GET" || !/^[a-f0-9]{48}$/.test(state) || !code || !/^[0-9]{1,20}$/.test(realmId))
          return page("Connection not completed", "Start again from QB Chem → Settings.", 400);
        const st = await stateRef(state).get();
        await stateRef(state).delete();
        if (!st.exists || st.data().expiresAt < Date.now())
          return page("Link expired", "Start again from QB Chem → Settings.", 400);
        const creds = { clientId: clientIdSecret.value(), clientSecret: clientSecretSecret.value() };
        const t = await exchangeCode(creds, code, OAUTH_REDIRECT_URI);
        await db().doc(CONNECTION_DOC).set({
          env: "sandbox",
          realmId,
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
          connectedAt: stamp(),
          connectedBy: st.data().uid,
          companyName: null,
        });
        try {
          const info = await createQbo({ db: db(), ...creds }).companyInfo(realmId);
          await db().doc(CONNECTION_DOC).update({ companyName: info?.CompanyName || null });
        } catch {
          /* company name is cosmetic */
        }
        await log("connect", true, { realmId });
        return page("QuickBooks connected", "You can close this tab and return to QB Chem.");
      } catch (e) {
        console.error("QuickBooks OAuth callback failed", { code: e?.message || "unknown" });
        return page("Connection failed", "QuickBooks did not accept the connection. Try again from QB Chem → Settings.", 500);
      }
    },
  );

  return { qbChemApi, qbChemOAuthCallback };
}

