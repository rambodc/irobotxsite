// Input validation for QB Chem. Pure functions; every error is a user-facing message.
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.code = "invalid-argument";
  }
}
const bad = (m) => {
  throw new InputError(m);
};
export const ROLES = ["raw", "finished"];
export const UNITS = ["L", "kg"];
export const CONTAINERS = ["drum", "tote", "pail", "other"];
const QBO_ID = /^[0-9]{1,20}$/;
const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function str(v, label, max, { required = true } = {}) {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") bad(`${label} must be text.`);
  const s = v.trim();
  if (required && !s) bad(`${label} is required.`);
  if (s.length > max) bad(`${label} must be ${max} characters or fewer.`);
  if (/[\u0000-\u001f\u007f]/.test(s)) bad(`${label} contains invalid characters.`);
  return s;
}
export function amount(v, label, { min = 0, max = 1e9, gt = false } = {}) {
  if (typeof v !== "number" || !Number.isFinite(v)) bad(`${label} must be a number.`);
  if (gt ? v <= min : v < min) bad(`${label} must be ${gt ? "greater than" : "at least"} ${min}.`);
  if (v > max) bad(`${label} is too large.`);
  return v;
}
export function qboId(v, label = "QuickBooks item") {
  if (typeof v !== "string" || !QBO_ID.test(v)) bad(`${label} id is invalid.`);
  return v;
}
export function docId(v, label) {
  if (typeof v !== "string" || !DOC_ID.test(v)) bad(`${label} is invalid.`);
  return v;
}
function oneOf(v, list, label) {
  if (!list.includes(v)) bad(`${label} must be one of ${list.join(", ")}.`);
  return v;
}
export function itemName(v) {
  const s = str(v, "Name", 100);
  if (s.includes(":")) bad("Name cannot contain “:” (QuickBooks uses it for sub-items).");
  return s;
}
export function date(v, label) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
    bad(`${label} must be a date (YYYY-MM-DD).`);
  return v;
}

export function setupInput(d = {}) {
  return {
    role: oneOf(d.role, ROLES, "Role"),
    baseUnit: oneOf(d.baseUnit, UNITS, "Unit"),
    containerType: oneOf(d.containerType, CONTAINERS, "Container"),
    containerCapacity: amount(d.containerCapacity, "Container size", { min: 0, gt: true, max: 1e6 }),
    notes: str(d.notes, "Notes", 2000, { required: false }),
  };
}

export function itemFields(d = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || d.name !== undefined) out.name = itemName(d.name);
  if (!partial || d.sku !== undefined) out.sku = str(d.sku, "SKU", 100, { required: false });
  if (!partial || d.unitPrice !== undefined) out.unitPrice = amount(d.unitPrice ?? 0, "Sales price");
  if (!partial || d.purchaseCost !== undefined)
    out.purchaseCost = amount(d.purchaseCost ?? 0, "Purchase cost");
  return out;
}

export function createInput(d = {}) {
  return {
    ...itemFields(d),
    startQty: amount(d.startQty ?? 0, "Starting quantity"),
    startDate: date(d.startDate, "Start date"),
    setup: setupInput(d.setup),
    force: d.force === true,
  };
}

export function updateInput(d = {}) {
  return {
    itemId: qboId(d.itemId),
    syncToken: str(d.syncToken, "Sync token", 20),
    fields: itemFields(d.fields || {}, { partial: true }),
    setup: d.setup ? setupInput(d.setup) : null,
    force: d.force === true,
  };
}

export function recipeInput(d = {}) {
  const lines = d.lines;
  if (!Array.isArray(lines) || lines.length < 1) bad("Add at least one input chemical.");
  if (lines.length > 30) bad("A recipe can have at most 30 inputs.");
  const out = {
    id: d.id ? docId(d.id, "Recipe") : null,
    name: str(d.name, "Recipe name", 100),
    outputItemId: qboId(d.outputItemId, "Finished product"),
    outputQty: amount(d.outputQty, "Batch size", { min: 0, gt: true, max: 1e7 }),
    notes: str(d.notes, "Notes", 2000, { required: false }),
    lines: lines.map((l, i) => ({
      itemId: qboId(l?.itemId, `Input ${i + 1}`),
      qty: amount(l?.qty, `Input ${i + 1} quantity`, { min: 0, gt: true, max: 1e7 }),
    })),
  };
  const ids = out.lines.map((l) => l.itemId);
  if (new Set(ids).size !== ids.length) bad("Each input chemical can appear only once.");
  if (ids.includes(out.outputItemId)) bad("The finished product cannot also be an input.");
  return out;
}

export function runInput(d = {}, { today = null } = {}) {
  const runDate = date(d.runDate, "Production date");
  if (runDate && today) {
    if (runDate > today) bad("Production date can't be in the future.");
    const yearAgo = new Date(Date.parse(today) - 366 * 864e5).toISOString().slice(0, 10);
    if (runDate < yearAgo) bad("Production date can be at most one year back.");
  }
  if (typeof d.requestId !== "string" || !UUID.test(d.requestId)) bad("Request id is invalid.");
  const lot = str(d.lotNumber, "Lot number", 40, { required: false });
  if (lot && !/^[A-Za-z0-9 ._/-]+$/.test(lot))
    bad("Lot number can use letters, numbers, spaces and . _ / -");
  return {
    recipeId: docId(d.recipeId, "Recipe"),
    outputQty: amount(d.outputQty, "Quantity to produce", { min: 0, gt: true, max: 1e7 }),
    lotNumber: lot,
    note: str(d.note, "Note", 500, { required: false }),
    runDate,
    requestId: d.requestId,
  };
}
