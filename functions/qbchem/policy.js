const CONTAINER_TYPES = ["drum", "tote", "pail", "other"];
const BASE_UNITS = ["L", "kg"];
const KINDS = ["raw", "finished"];

export function text(value, max, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error("invalid-argument");
  return value.trim();
}

export function num(value, { min = 0, max = 1e12, integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("invalid-argument");
  if (value < min || value > max) throw new Error("invalid-argument");
  if (integer && !Number.isInteger(value)) throw new Error("invalid-argument");
  return value;
}

export function chemicalInput(data) {
  const kind = text(data.kind, 20);
  const baseUnit = text(data.baseUnit, 8);
  const containerType = text(data.containerType, 20);
  if (!KINDS.includes(kind)) throw new Error("invalid-argument");
  if (!BASE_UNITS.includes(baseUnit)) throw new Error("invalid-argument");
  if (!CONTAINER_TYPES.includes(containerType))
    throw new Error("invalid-argument");
  return {
    name: text(data.name, 100),
    kind,
    baseUnit,
    containerType,
    containerCapacity: num(Number(data.containerCapacity), { min: 0.0001 }),
    sku: text(data.sku || "", 64, false),
    notes: text(data.notes || "", 2000, false),
    purchaseCost: num(Number(data.purchaseCost ?? 0), { min: 0 }),
    unitPrice: num(Number(data.unitPrice ?? 0), { min: 0 }),
    active: data.active === false ? false : true,
  };
}

export function recipeInput(data) {
  const lines = data.lines;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 40)
    throw new Error("invalid-argument");
  return {
    name: text(data.name, 100),
    finishedChemicalId: text(data.finishedChemicalId, 128),
    outputQtyBase: num(Number(data.outputQtyBase), { min: 0.0001 }),
    active: data.active === false ? false : true,
    lines: lines.map((line) => ({
      chemicalId: text(line.chemicalId, 128),
      qtyBase: num(Number(line.qtyBase), { min: 0.0001 }),
    })),
  };
}

export function batchInput(data) {
  return {
    recipeId: text(data.recipeId, 128),
    outputQtyBase: num(Number(data.outputQtyBase), { min: 0.0001 }),
    lotNumber: text(data.lotNumber || "", 64, false),
    note: text(data.note || "", 2000, false),
  };
}

export { CONTAINER_TYPES, BASE_UNITS, KINDS };
