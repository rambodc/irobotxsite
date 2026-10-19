import test from "node:test";
import assert from "node:assert/strict";
import { createInput, updateInput, setupInput, recipeInput, runInput, InputError } from "../qbchem/policy.js";
import { toItem, mergeCatalog, findDuplicates, similarity } from "../qbchem/catalog.js";
import { scaleRecipe, planRun, settleRun, residualJournalLines, productionBillLines, productionDocNumber, unitCost, money } from "../qbchem/costing.js";
import { createQbo, QboError, isStale, isDuplicateName, publicConnection } from "../qbchem/qbo.js";
import { ACTIONS } from "../qbchem/service.js";

const setup = { role: "raw", baseUnit: "L", containerType: "drum", containerCapacity: 205 };
const item = (id, name, extra = {}) => ({ id, name, sku: "", type: "Inventory", active: true, trackQty: true, qtyOnHand: 0, purchaseCost: 0, unitPrice: 0, syncToken: "0", ...extra });

test("setup extras accept only known roles, units and containers", () => {
  assert.deepEqual(setupInput(setup), { ...setup, notes: "" });
  assert.throws(() => setupInput({ ...setup, baseUnit: "gal" }), InputError);
  assert.throws(() => setupInput({ ...setup, containerType: "bag" }), InputError);
  assert.throws(() => setupInput({ ...setup, containerCapacity: 0 }), /greater than/);
  assert.throws(() => setupInput({ ...setup, containerCapacity: "205" }), /number/);
});

test("create input validates QuickBooks-safe names and starting stock", () => {
  const c = createInput({ name: " Methanol ", sku: "MEOH", unitPrice: 0, purchaseCost: 1.25, startQty: 410, startDate: "2026-10-19", setup });
  assert.equal(c.name, "Methanol");
  assert.equal(c.force, false);
  assert.throws(() => createInput({ name: "Parent:Child", setup }), /sub-items/);
  assert.throws(() => createInput({ name: "", setup }), /required/);
  assert.throws(() => createInput({ name: "X", startQty: -1, setup }), /at least 0/);
  assert.throws(() => createInput({ name: "X", startDate: "19/10/2026", setup }), /date/);
});

test("update input is partial, needs the QuickBooks SyncToken and a numeric id", () => {
  const u = updateInput({ itemId: "33", syncToken: "4", fields: { name: "CI-100" } });
  assert.deepEqual(u.fields, { name: "CI-100" });
  assert.equal(u.setup, null);
  assert.throws(() => updateInput({ itemId: "abc", syncToken: "1", fields: {} }), /id is invalid/);
  assert.throws(() => updateInput({ itemId: "33", fields: {} }), /Sync token/);
});

test("recipes link by QuickBooks id, reject duplicate inputs and self-reference", () => {
  const r = recipeInput({ name: "CI-100", outputItemId: "35", outputQty: 1000, lines: [{ itemId: "33", qty: 800 }, { itemId: "34", qty: 20 }] });
  assert.equal(r.lines.length, 2);
  assert.throws(() => recipeInput({ name: "R", outputItemId: "35", outputQty: 1000, lines: [] }), /at least one/);
  assert.throws(() => recipeInput({ name: "R", outputItemId: "35", outputQty: 1, lines: [{ itemId: "33", qty: 1 }, { itemId: "33", qty: 2 }] }), /only once/);
  assert.throws(() => recipeInput({ name: "R", outputItemId: "35", outputQty: 1, lines: [{ itemId: "35", qty: 1 }] }), /cannot also be an input/);
  assert.throws(() => recipeInput({ name: "R", outputItemId: "Methanol", outputQty: 1, lines: [{ itemId: "33", qty: 1 }] }), /id is invalid/);
});

test("runs need a UUID request id and a safe lot number", () => {
  const ok = runInput({ recipeId: "abc123", outputQty: 500, lotNumber: "L-2026/10.1", requestId: "123e4567-e89b-42d3-a456-426614174000" });
  assert.equal(ok.lotNumber, "L-2026/10.1");
  assert.throws(() => runInput({ recipeId: "abc", outputQty: 1, requestId: "x" }), /Request id/);
  assert.throws(() => runInput({ recipeId: "abc", outputQty: 1, lotNumber: "<script>", requestId: "123e4567-e89b-42d3-a456-426614174000" }), /Lot number/);
  assert.throws(() => runInput({ recipeId: "a/b", outputQty: 1, requestId: "123e4567-e89b-42d3-a456-426614174000" }), /Recipe/);
});

test("catalog merges setup strictly by QuickBooks id and flags items needing setup", () => {
  const rows = mergeCatalog(
    [toItem({ Id: 33, Name: "Methanol", Type: "Inventory", TrackQtyOnHand: true, QtyOnHand: 410, PurchaseCost: 1.25, SyncToken: 2 }), toItem({ Id: 31, Name: "Ether", Type: "Inventory", Active: false, SyncToken: 0 })],
    { 33: setup, Methanol: { ...setup, baseUnit: "kg" } },
  );
  assert.equal(rows[0].id, "33");
  assert.equal(rows[0].status, "ready");
  assert.equal(rows[0].setup.baseUnit, "L");
  assert.equal(rows[0].syncToken, "2");
  assert.equal(rows[1].status, "needs-setup");
  assert.equal(rows[1].active, false);
});

test("duplicate check finds exact, SKU and similar names including inactive items", () => {
  const items = [
    item("28", "UX Methanol (deleted)", { active: false }),
    item("29", "Surfactant Blend Base", { sku: "SURF-1" }),
    item("30", "Corrosion Inhibitor CI-100"),
    item("21", "Name Badges"),
  ];
  const m = findDuplicates({ name: "methanol", sku: "" }, items);
  assert.equal(m[0].id, "28");
  assert.equal(m[0].active, false);
  assert.equal(findDuplicates({ name: "Corrosion Inhibitor CI-100", sku: "" }, items)[0].reason, "exact");
  assert.equal(findDuplicates({ name: "CI-100 Corrosion Inhibitor", sku: "" }, items)[0].reason, "similar");
  assert.equal(findDuplicates({ name: "Totally New", sku: "surf-1" }, items)[0].reason, "sku");
  assert.deepEqual(findDuplicates({ name: "Glycol", sku: "" }, items), []);
  assert.deepEqual(findDuplicates({ name: "Name Badges", sku: "" }, items, { excludeId: "21" }), []);
  assert.ok(similarity("Methanol", "Methanoll") > 0.85);
});

test("recipe scaling and run plan use live QuickBooks quantities and costs", () => {
  const recipe = { outputItemId: "35", outputQty: 1000, lines: [{ itemId: "33", qty: 800 }, { itemId: "34", qty: 20 }] };
  assert.deepEqual(scaleRecipe(recipe, 500), [{ itemId: "33", qty: 400 }, { itemId: "34", qty: 10 }]);
  const byId = {
    33: item("33", "Methanol", { qtyOnHand: 1025, purchaseCost: 1.25 }),
    34: item("34", "Surfactant Base", { qtyOnHand: 100, purchaseCost: 8.5 }),
    35: item("35", "CI-100", { qtyOnHand: 0 }),
  };
  const plan = planRun(recipe, 1000, byId);
  assert.equal(plan.ok, true);
  assert.equal(plan.estTotal, 1170);
  assert.equal(plan.estUnitCost, 1.17);
  assert.equal(plan.lines[0].after, 225);
  assert.equal(plan.finishedAfter, 1000);
  const short = planRun(recipe, 2000, byId);
  assert.equal(short.ok, false);
  assert.match(short.problems[0], /Not enough Methanol: needs 1600, 1025 on hand/);
  const inactive = planRun(recipe, 10, { ...byId, 35: { ...byId[35], active: false } });
  assert.match(inactive.problems[0], /finished product/);
});

test("settlement reads actual cost from WIP and computes the rounding residual", () => {
  const s = settleRun({ wipBefore: 0, wipAfterConsume: 1170, wipAfterBill: 0, outputQty: 1000 });
  assert.deepEqual(s, { actualCost: 1170, unitCost: 1.17, residual: 0 });
  const odd = settleRun({ wipBefore: 10, wipAfterConsume: 110, wipAfterBill: 10.03, outputQty: 3 });
  assert.equal(odd.unitCost, 33.3333);
  assert.equal(odd.residual, 0.03);
  assert.deepEqual(settleRun({ wipBefore: 0, wipAfterConsume: 538.5, outputQty: 500 }), { actualCost: 538.5, unitCost: 1.077 });
  assert.equal(unitCost(1 / 3), 0.3333);
  assert.equal(money(1.005), 1.01);
});

test("residual journal entry always nets WIP back to zero", () => {
  assert.deepEqual(residualJournalLines(0.004, "W", "I", "m"), []);
  const pos = residualJournalLines(0.03, "W", "I", "m");
  assert.deepEqual(pos.map((l) => [l.JournalEntryLineDetail.PostingType, l.JournalEntryLineDetail.AccountRef.value, l.Amount]), [["Credit", "W", 0.03], ["Debit", "I", 0.03]]);
  const neg = residualJournalLines(-0.02, "W", "I", "m");
  assert.deepEqual(neg.map((l) => l.JournalEntryLineDetail.PostingType), ["Debit", "Credit"]);
});

function fakeDb(conn) {
  const doc = { data: conn };
  const ref = { get: async () => ({ data: () => doc.data }), update: async (v) => (doc.data = { ...doc.data, ...v }) };
  return {
    doc: () => ref,
    runTransaction: async (fn) => fn({ get: ref.get, update: (_r, v) => (doc.data = { ...doc.data, ...v }) }),
    state: doc,
  };
}

test("QuickBooks client rotates the refresh token into Firestore and maps errors", async () => {
  const db = fakeDb({ realmId: "9341458521176413", env: "sandbox", refreshToken: "r1", accessToken: "old", expiresAt: 0 });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "a2", refresh_token: "r2", expires_in: 3600 }));
    assert.equal(init.headers.Authorization, "Bearer a2");
    if (url.includes("item/9")) return new Response(JSON.stringify({ Fault: { Error: [{ code: "5010", Detail: "Stale Object Error" }] } }), { status: 400 });
    return new Response(JSON.stringify({ Item: { Id: "1" } }));
  };
  const q = createQbo({ db, clientId: "id", clientSecret: "s", fetchImpl });
  assert.equal((await q.getItem("1")).Id, "1");
  assert.equal(db.state.data.refreshToken, "r2");
  assert.equal(db.state.data.accessToken, "a2");
  assert.ok(calls[1].startsWith("https://sandbox-quickbooks.api.intuit.com/v3/company/9341458521176413/item/1?minorversion=75"));
  await q.getItem("1");
  assert.equal(calls.filter((u) => u.includes("oauth2")).length, 1);
  const err = await q.getItem("9").catch((e) => e);
  assert.ok(err instanceof QboError && isStale(err) && !isDuplicateName(err));
  await assert.rejects(createQbo({ db: fakeDb({}), clientId: "i", clientSecret: "s", fetchImpl }).getItem("1"), /qbo-not-connected/);
});

test("public connection never exposes tokens and the action list is fixed", () => {
  const p = publicConnection({ realmId: "1", refreshToken: "secret", accessToken: "secret", env: "sandbox", companyName: "Co" });
  assert.equal(JSON.stringify(p).includes("secret"), false);
  assert.equal(p.connected, true);
  assert.ok(ACTIONS.includes("postRun") && !ACTIONS.includes("__proto__"));
});

test("similarity flags names whose words are all contained in another name", () => {
  assert.ok(similarity("Surfactant Base", "UX Surfactant Blend Base (deleted)") >= 0.75);
  assert.ok(similarity("Caustic Soda", "Citric Acid") < 0.75);
});

test("production bill is $0: finished item at exact batch cost, equal negative WIP line", () => {
  const lines = productionBillLines({ itemId: "35", outputQty: 3, actualCost: 100, wipAccountId: "W", taxCodeId: "6", description: "run" });
  assert.equal(lines.length, 2);
  const [item, wip] = lines;
  assert.equal(item.DetailType, "ItemBasedExpenseLineDetail");
  assert.equal(item.Amount, 100);
  assert.equal(item.ItemBasedExpenseLineDetail.Qty, 3);
  assert.equal(item.ItemBasedExpenseLineDetail.UnitPrice, 33.333333);
  assert.deepEqual(item.ItemBasedExpenseLineDetail.TaxCodeRef, { value: "6" });
  assert.equal(wip.DetailType, "AccountBasedExpenseLineDetail");
  assert.equal(wip.Amount, -100);
  assert.deepEqual(wip.AccountBasedExpenseLineDetail.AccountRef, { value: "W" });
  assert.equal(money(item.Amount + wip.Amount), 0);
  const noTax = productionBillLines({ itemId: "35", outputQty: 1, actualCost: 1.234, wipAccountId: "W", taxCodeId: "", description: "r" });
  assert.equal(noTax[0].Amount, 1.23);
  assert.equal("TaxCodeRef" in noTax[0].ItemBasedExpenseLineDetail, false);
  assert.throws(() => productionBillLines({ itemId: "35", outputQty: 1, actualCost: -1, wipAccountId: "W", description: "r" }), /negative/);
});

test("production bill DocNumber uses the lot when it fits QuickBooks' 21 characters", () => {
  assert.equal(productionDocNumber("CI100-261019-01", "abcdef1234567890"), "PR-CI100-261019-01");
  assert.equal(productionDocNumber("LOT A", "abcdef1234567890"), "PR-LOT-A");
  assert.equal(productionDocNumber("", "abcdef1234567890"), "PR-ABCDEF123456");
  assert.equal(productionDocNumber("X".repeat(30), "abcdef1234567890"), "PR-ABCDEF123456");
});

test("production date is optional, not in the future, at most a year back", () => {
  const base = { recipeId: "r1", outputQty: 10, requestId: "11111111-2222-4333-8444-555555555555" };
  assert.equal(runInput(base, { today: "2026-10-19" }).runDate, null);
  assert.equal(runInput({ ...base, runDate: "2026-10-01" }, { today: "2026-10-19" }).runDate, "2026-10-01");
  assert.throws(() => runInput({ ...base, runDate: "2026-10-20" }, { today: "2026-10-19" }), /future/);
  assert.throws(() => runInput({ ...base, runDate: "2025-01-01" }, { today: "2026-10-19" }), /one year/);
  assert.throws(() => runInput({ ...base, runDate: "19/10/2026" }, { today: "2026-10-19" }), /YYYY-MM-DD/);
});
