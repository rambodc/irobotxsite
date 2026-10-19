export type Role = "raw" | "finished";
export type BaseUnit = "L" | "kg";
export type ContainerType = "drum" | "tote" | "pail" | "other";
export interface Setup {
  role: Role;
  baseUnit: BaseUnit;
  containerType: ContainerType;
  containerCapacity: number;
  notes: string;
}
export interface Item {
  id: string;
  name: string;
  sku: string;
  type: "Inventory" | "NonInventory" | string;
  active: boolean;
  trackQty: boolean;
  qtyOnHand: number;
  purchaseCost: number;
  unitPrice: number;
  syncToken: string;
  updatedAt: string | null;
  setup: Setup | null;
  status: "ready" | "needs-setup";
}
export interface Duplicate {
  id: string;
  name: string;
  sku: string;
  active: boolean;
  type: string;
  reason: "exact" | "sku" | "similar";
  score: number;
}
export interface RecipeLine {
  itemId: string;
  qty: number;
}
export interface Recipe {
  id: string;
  name: string;
  outputItemId: string;
  outputQty: number;
  lines: RecipeLine[];
  notes: string;
  updatedAt: string | null;
}
export interface PlanLine {
  itemId: string;
  name: string;
  qty: number;
  available: number;
  after: number;
  unitCost: number;
  estCost: number;
  missing: boolean;
  short: boolean;
}
export interface Plan {
  outputItemId: string;
  outputName: string;
  outputQty: number;
  finishedBefore: number;
  finishedAfter: number;
  lines: PlanLine[];
  estTotal: number;
  estUnitCost: number;
  problems: string[];
  ok: boolean;
}
export interface Run {
  id: string;
  status: "posting" | "posted" | "failed";
  recipeId: string;
  recipeName: string;
  outputItemId: string;
  outputName: string;
  outputQty: number;
  lotNumber: string;
  note: string;
  plan: Plan | null;
  result: {
    actualCost: number;
    unitCost: number;
    valueIn: number;
    residual: number;
    wipBefore: number;
    wipAfter: number;
    qtyAfter: Record<string, number>;
  } | null;
  qbo: { consumeAdjustmentId?: string; produceAdjustmentId?: string; journalEntryId?: string };
  error: string | null;
  createdAt: string | null;
  postedAt: string | null;
}
export interface Account {
  id: string;
  name: string;
}
export interface Snapshot {
  syncedAt: string;
  connection: { connected: boolean; env: string | null; realmId: string | null; companyName: string | null };
  settings: { wip: Account | null; inventoryAsset: Account | null; income: Account | null; cogs: Account | null; residual: Account | null } | null;
  oauthRedirectUri: string;
  items: Item[];
  recipes: Recipe[];
  runs: Run[];
}
export interface ItemFields {
  name: string;
  sku: string;
  purchaseCost: number;
  unitPrice: number;
}
export type SaveResult =
  | { status: "created" | "saved"; item: Item }
  | { status: "duplicates"; duplicates: Duplicate[]; blocked?: boolean }
  | { status: "conflict"; item: Item };

export interface QbChemClient {
  load(): Promise<Snapshot>;
  checkName(name: string, sku: string, excludeId?: string): Promise<{ duplicates: Duplicate[] }>;
  createItem(input: ItemFields & { startQty: number; startDate: string | null; setup: Setup; force: boolean }): Promise<SaveResult>;
  saveSetup(itemId: string, setup: Setup, reactivate: boolean): Promise<SaveResult>;
  updateItem(input: { itemId: string; syncToken: string; fields: Partial<ItemFields>; setup: Setup | null; force: boolean }): Promise<SaveResult>;
  saveRecipe(recipe: Omit<Recipe, "id" | "updatedAt"> & { id?: string }): Promise<{ recipe: Recipe }>;
  deleteRecipe(id: string): Promise<{ deleted: string }>;
  previewRun(recipeId: string, outputQty: number): Promise<{ plan: Plan }>;
  postRun(input: { recipeId: string; outputQty: number; lotNumber: string; note: string; requestId: string }): Promise<{ run: Run; repeated?: boolean }>;
  ensureSetup(): Promise<{ settings: Snapshot["settings"] }>;
  connectStart(): Promise<{ url: string; redirectUri: string }>;
}
