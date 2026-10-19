// LOCAL DEV ONLY: in-memory stand-in for the qbChemApi callable.
import type { Item, Plan, QbChemClient, Recipe, Run, Setup, Snapshot } from "../../src/mini-apps/qb-chem/types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const setup = (role: Setup["role"], baseUnit: Setup["baseUnit"], containerType: Setup["containerType"], containerCapacity: number): Setup => ({ role, baseUnit, containerType, containerCapacity, notes: "" });
const item = (id: string, name: string, sku: string, qtyOnHand: number, purchaseCost: number, unitPrice: number, s: Setup | null, active = true): Item => ({
  id, name, sku, type: "Inventory", active, trackQty: true, qtyOnHand, purchaseCost, unitPrice, syncToken: "0", updatedAt: minutesAgo(90), setup: s, status: s ? "ready" : "needs-setup",
});

export function fixtureSnapshot(empty = false): Snapshot {
  const items = empty
    ? []
    : [
        item("41", "Methanol", "RM-MEOH", 1435, 1.05, 0, setup("raw", "L", "drum", 205)),
        item("42", "Surfactant Base", "RM-SURF", 170, 4.4, 0, setup("raw", "kg", "pail", 20)),
        item("43", "CI-100 Corrosion Inhibitor", "FG-CI100", 3000, 1.29, 2.85, setup("finished", "L", "tote", 1000)),
        item("31", "Ether", "skuETHH222", 900, 2.5, 3.5, null),
        item("32", "Uniq RM", "", 40, 12.75, 0, null),
        item("28", "UX Methanol (deleted)", "", 0, 1.1, 0, null, false),
      ];
  const recipes: Recipe[] = empty
    ? []
    : [{ id: "ci100-standard", name: "CI-100 standard blend", outputItemId: "43", outputQty: 1000, lines: [{ itemId: "41", qty: 800 }, { itemId: "42", qty: 20 }], notes: "", updatedAt: minutesAgo(60) }];
  const runs: Run[] = empty
    ? []
    : [
        {
          id: "a1b2c3d4e5f6a1b2c3d4e5f6", status: "posted", recipeId: "ci100-standard", recipeName: "CI-100 standard blend", outputItemId: "43", outputName: "CI-100 Corrosion Inhibitor",
          outputQty: 1000, lotNumber: "FGCI10-261019-01", note: "", plan: null,
          result: { actualCost: 928, unitCost: 0.928, valueIn: 928, residual: 0, wipBefore: 0, wipAfter: 0, qtyAfter: {} },
          qbo: { consumeAdjustmentId: "201", produceAdjustmentId: "202" }, error: null, createdAt: minutesAgo(45), postedAt: minutesAgo(45),
        },
      ];
  return {
    syncedAt: minutesAgo(2),
    connection: { connected: true, env: "sandbox", realmId: "9341458521176413", companyName: "Uniquem (sandbox)" },
    settings: { wip: { id: "1150040000", name: "Production WIP" }, inventoryAsset: { id: "85", name: "Inventory Asset" }, income: { id: "67", name: "Sales of Product Income" }, cogs: { id: "84", name: "Cost of Goods Sold" }, residual: { id: "85", name: "Inventory Asset" } },
    oauthRedirectUri: "https://us-central1-irobotxsite.cloudfunctions.net/qbChemOAuthCallback",
    items, recipes, runs,
  };
}

const wait = <T,>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export function createFixtureClient({ empty = false } = {}): QbChemClient {
  const state = fixtureSnapshot(empty);
  const find = (id: string) => state.items.find((i) => i.id === id);
  const plan = (recipeId: string, outputQty: number): Plan => {
    const r = state.recipes.find((x) => x.id === recipeId)!;
    const out = find(r.outputItemId)!;
    const k = outputQty / r.outputQty;
    const lines = r.lines.map((l) => {
      const i = find(l.itemId)!;
      const qty = +(l.qty * k).toFixed(6);
      return { itemId: i.id, name: i.name, qty, available: i.qtyOnHand, after: +(i.qtyOnHand - qty).toFixed(6), unitCost: i.purchaseCost, estCost: +(qty * i.purchaseCost).toFixed(2), missing: false, short: i.qtyOnHand < qty };
    });
    const estTotal = +lines.reduce((s, l) => s + l.estCost, 0).toFixed(2);
    const problems = lines.filter((l) => l.short).map((l) => `Not enough ${l.name}: need ${l.qty}, have ${l.available}.`);
    return { outputItemId: out.id, outputName: out.name, outputQty, finishedBefore: out.qtyOnHand, finishedAfter: out.qtyOnHand + outputQty, lines, estTotal, estUnitCost: +(estTotal / outputQty).toFixed(4), problems, ok: !problems.length };
  };
  return {
    load: () => wait({ ...structuredClone(state), syncedAt: new Date().toISOString() }, 400),
    checkName: (name) => wait({ duplicates: /meth/i.test(name) ? [{ id: "28", name: "UX Methanol (deleted)", sku: "", active: false, type: "Inventory", reason: "similar" as const, score: 0.86 }] : [] }),
    createItem: async (input) => {
      const it = item(String(50 + state.items.length), input.name, input.sku, input.startQty, input.purchaseCost, input.unitPrice, input.setup);
      state.items.push(it);
      return wait({ status: "created" as const, item: it });
    },
    saveSetup: async (itemId, s) => {
      const it = find(itemId)!;
      Object.assign(it, { setup: s, status: "ready", active: true });
      return wait({ status: "saved" as const, item: { ...it } });
    },
    updateItem: async ({ itemId, fields, setup: s }) => {
      const it = find(itemId)!;
      Object.assign(it, fields, s ? { setup: s, status: "ready" } : {});
      return wait({ status: "saved" as const, item: { ...it } });
    },
    saveRecipe: async (r) => {
      const recipe = { ...r, id: r.id ?? r.name.toLowerCase().replace(/\W+/g, "-"), updatedAt: new Date().toISOString() };
      state.recipes = [...state.recipes.filter((x) => x.id !== recipe.id), recipe];
      return wait({ recipe });
    },
    deleteRecipe: async (id) => ((state.recipes = state.recipes.filter((r) => r.id !== id)), wait({ deleted: id })),
    previewRun: (recipeId, outputQty) => wait({ plan: plan(recipeId, outputQty) }),
    postRun: async ({ recipeId, outputQty, lotNumber, note, requestId }) => {
      const p = plan(recipeId, outputQty);
      const r = state.recipes.find((x) => x.id === recipeId)!;
      for (const l of p.lines) find(l.itemId)!.qtyOnHand = l.after;
      find(p.outputItemId)!.qtyOnHand += outputQty;
      const run: Run = {
        id: requestId.replace(/-/g, "").slice(0, 24), status: "posted", recipeId, recipeName: r.name, outputItemId: p.outputItemId, outputName: p.outputName, outputQty, lotNumber, note, plan: p,
        result: { actualCost: p.estTotal, unitCost: p.estUnitCost, valueIn: p.estTotal, residual: 0, wipBefore: 0, wipAfter: 0, qtyAfter: {} },
        qbo: { consumeAdjustmentId: "203", produceAdjustmentId: "204" }, error: null, createdAt: new Date().toISOString(), postedAt: new Date().toISOString(),
      };
      state.runs.unshift(run);
      return wait({ run }, 700);
    },
    ensureSetup: () => wait({ settings: state.settings }),
    connectStart: () => wait({ url: "about:blank", redirectUri: state.oauthRedirectUri }),
  };
}
