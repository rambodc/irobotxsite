import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Item, QbChemClient, Recipe } from "./types";
import { fmtMoney, fmtUnitCost, friendlyError, stockLine, unitOf } from "./format";
import { Field, Modal, Notice, numberValue } from "./ui";

interface Line {
  key: number;
  itemId: string;
  qty: string;
}
let nextKey = 1;

export default function RecipeDialog({
  client,
  recipe,
  items,
  onClose,
  onSaved,
  onDeleted,
}: {
  client: QbChemClient;
  recipe: Recipe | null;
  items: Item[];
  onClose: () => void;
  onSaved: (r: Recipe) => void;
  onDeleted: (id: string) => void;
}) {
  const usable = items.filter((i) => i.active && i.type === "Inventory" && i.trackQty);
  const finished = [...usable].sort((a, b) => Number(b.setup?.role === "finished") - Number(a.setup?.role === "finished") || a.name.localeCompare(b.name));
  const raws = [...usable].sort((a, b) => Number(b.setup?.role === "raw") - Number(a.setup?.role === "raw") || a.name.localeCompare(b.name));
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const [name, setName] = useState(recipe?.name ?? "");
  const [outputItemId, setOutput] = useState(recipe?.outputItemId ?? "");
  const [outputQty, setOutputQty] = useState(recipe ? String(recipe.outputQty) : "");
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    recipe ? recipe.lines.map((l) => ({ key: nextKey++, itemId: l.itemId, qty: String(l.qty) })) : [{ key: nextKey++, itemId: "", qty: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const out = byId[outputItemId];
  const qty = numberValue(outputQty);
  const total = lines.reduce((s, l) => s + (numberValue(l.qty) || 0) * (byId[l.itemId]?.purchaseCost ?? 0), 0);
  const chosen = new Set(lines.map((l) => l.itemId));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function validate() {
    if (!name.trim()) return "Give the recipe a name.";
    if (!outputItemId) return "Choose the finished product.";
    if (!(qty > 0)) return "Batch size must be greater than 0.";
    const filled = lines.filter((l) => l.itemId || l.qty);
    if (!filled.length) return "Add at least one input chemical.";
    for (const l of filled) {
      if (!l.itemId) return "Choose a chemical for every input row.";
      if (!(numberValue(l.qty) > 0)) return `Enter a quantity for ${byId[l.itemId]?.name ?? "each input"}.`;
      if (l.itemId === outputItemId) return "The finished product cannot also be an input.";
    }
    if (new Set(filled.map((l) => l.itemId)).size !== filled.length) return "Each chemical can be used only once.";
    return "";
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      const { recipe: saved } = await client.saveRecipe({
        ...(recipe ? { id: recipe.id } : {}),
        name: name.trim(),
        outputItemId,
        outputQty: qty,
        notes: notes.trim(),
        lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, qty: numberValue(l.qty) })),
      });
      onSaved(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!recipe) return;
    setBusy(true);
    try {
      await client.deleteRecipe(recipe.id);
      onDeleted(recipe.id);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={recipe ? `Edit ${recipe.name}` : "New recipe"}
      subtitle="Quantities are per batch. Production scales them to whatever you make."
      onClose={onClose}
      footer={
        <>
          {recipe &&
            (confirmDelete ? (
              <button type="button" className="qc-btn qc-btn-danger" onClick={() => void remove()} disabled={busy}>Confirm delete</button>
            ) : (
              <button type="button" className="qc-btn qc-btn-ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete
              </button>
            ))}
          <span className="qc-spacer" />
          <button type="button" className="qc-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="qc-recipe-form" className="qc-btn qc-btn-primary" disabled={busy}>{busy ? "Saving…" : "Save recipe"}</button>
        </>
      }
    >
      <form id="qc-recipe-form" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Recipe name">
          {(id) => <input id={id} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. CI-100 standard blend" />}
        </Field>
        <div className="qc-grid-2">
          <Field label="Finished product">
            {(id) => (
              <select id={id} value={outputItemId} onChange={(e) => setOutput(e.target.value)}>
                <option value="">Choose…</option>
                {finished.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}{i.setup ? "" : " (needs setup)"}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Batch size" suffix={unitOf(out)} hint={out?.setup && qty > 0 ? stockLine(qty, out.setup) : undefined}>
            {(id) => <input id={id} type="number" inputMode="decimal" min={0} step="any" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} placeholder={out?.setup ? String(out.setup.containerCapacity) : "1000"} />}
          </Field>
        </div>

        <fieldset className="qc-fieldset">
          <legend>Inputs per batch</legend>
          <div className="qc-lines">
            {lines.map((l, n) => {
              const i = byId[l.itemId];
              return (
                <div key={l.key} className="qc-line">
                  <Field label={`Input ${n + 1}`}>
                    {(id) => (
                      <select id={id} value={l.itemId} onChange={(e) => update(l.key, { itemId: e.target.value })}>
                        <option value="">Choose chemical…</option>
                        {raws
                          .filter((r) => r.id !== outputItemId && (r.id === l.itemId || !chosen.has(r.id)))
                          .map((r) => (
                            <option key={r.id} value={r.id}>{r.name}{r.setup ? "" : " (needs setup)"}</option>
                          ))}
                      </select>
                    )}
                  </Field>
                  <Field label="Quantity" suffix={unitOf(i)}>
                    {(id) => <input id={id} type="number" inputMode="decimal" min={0} step="any" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />}
                  </Field>
                  <button type="button" className="qc-icon-button" aria-label={`Remove input ${n + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1}>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="qc-btn qc-btn-sm" onClick={() => setLines((ls) => [...ls, { key: nextKey++, itemId: "", qty: "" }])}>
            <Plus size={14} /> Add input
          </button>
        </fieldset>
        <div className="qc-summary">
          <span>Estimated batch cost (current QuickBooks costs)</span>
          <strong>{fmtMoney(total)}</strong>
          {qty > 0 && <small>{fmtUnitCost(total / qty)}/{unitOf(out)}</small>}
        </div>
        <Field label="Notes" optional>
          {(id) => <textarea id={id} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mixing order, temperature, QC checks…" />}
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
      </form>
    </Modal>
  );
}
