// QuickBooks is the master for items. These helpers shape live QBO items and
// merge in the QB Chem-only "setup" extras, keyed strictly by QBO Item Id.
export function toItem(i) {
  return {
    id: String(i.Id),
    name: i.Name,
    sku: i.Sku || "",
    type: i.Type,
    active: i.Active !== false,
    trackQty: i.TrackQtyOnHand === true,
    qtyOnHand: Number(i.QtyOnHand ?? 0),
    purchaseCost: Number(i.PurchaseCost ?? 0),
    unitPrice: Number(i.UnitPrice ?? 0),
    syncToken: String(i.SyncToken),
    updatedAt: i.MetaData?.LastUpdatedTime || null,
  };
}

export function mergeCatalog(items, setupById) {
  return items
    .map((item) => {
      const setup = setupById[item.id] || null;
      return { ...item, setup, status: setup ? "ready" : "needs-setup" };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\(deleted\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** 0..1 similarity combining edit distance, word overlap and containment. */
export function similarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const lev = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const ta = new Set(x.split(" "));
  const tb = new Set(y.split(" "));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = shared / new Set([...ta, ...tb]).size;
  const shorter = x.length < y.length ? x : y;
  const longer = shorter === x ? y : x;
  const contains =
    shorter.length >= 4 && ` ${longer} `.includes(` ${shorter} `) ? 0.85 : 0;
  // Every word of a multi-word name appears in the other ("Surfactant Base" vs "UX Surfactant Blend Base").
  const small = ta.size <= tb.size ? ta : tb;
  const allWords = small.size >= 2 && shared === small.size ? 0.8 : 0;
  return Math.max(lev, jaccard, contains, allWords);
}

/** Existing items (active or inactive) that look like the proposed name/SKU. */
export function findDuplicates({ name, sku }, items, { excludeId = null, threshold = 0.75 } = {}) {
  const wantSku = String(sku || "").trim().toLowerCase();
  return items
    .filter((i) => i.id !== excludeId)
    .map((i) => {
      const score = similarity(name, i.name);
      const exact = normalizeName(i.name) === normalizeName(name);
      const skuMatch = Boolean(wantSku) && String(i.sku || "").trim().toLowerCase() === wantSku;
      const reason = exact ? "exact" : skuMatch ? "sku" : score >= threshold ? "similar" : null;
      return { id: i.id, name: i.name, sku: i.sku, active: i.active, type: i.type, reason, score: Math.round(score * 100) / 100 };
    })
    .filter((m) => m.reason)
    .sort((a, b) => (a.reason === "exact" ? -1 : b.reason === "exact" ? 1 : b.score - a.score))
    .slice(0, 5);
}
