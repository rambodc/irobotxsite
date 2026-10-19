import { useState, type FormEvent } from "react";
import { Link2 } from "lucide-react";
import type { ContainerType, Duplicate, Item, QbChemClient, Role, BaseUnit, SaveResult, Setup } from "./types";
import { fmtMoney, friendlyError, stockLine } from "./format";
import { Field, Modal, Notice, Segmented, numberValue } from "./ui";

const CONTAINER_DEFAULTS: Record<ContainerType, number> = { drum: 205, tote: 1000, pail: 20, other: 1 };
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(new Date());

interface Form {
  name: string;
  sku: string;
  purchaseCost: string;
  unitPrice: string;
  startQty: string;
  startDate: string;
  role: Role;
  baseUnit: BaseUnit;
  containerType: ContainerType;
  containerCapacity: string;
  notes: string;
}
function formFor(item: Item | null): Form {
  return {
    name: item?.name ?? "",
    sku: item?.sku ?? "",
    purchaseCost: item ? String(item.purchaseCost) : "",
    unitPrice: item ? String(item.unitPrice) : "",
    startQty: "",
    startDate: todayLocal(),
    role: item?.setup?.role ?? "raw",
    baseUnit: item?.setup?.baseUnit ?? "L",
    containerType: item?.setup?.containerType ?? "drum",
    containerCapacity: String(item?.setup?.containerCapacity ?? 205),
    notes: item?.setup?.notes ?? "",
  };
}

export default function ProductDialog({
  client,
  item: initial,
  onClose,
  onSaved,
}: {
  client: QbChemClient;
  item: Item | null;
  onClose: () => void;
  onSaved: (item: Item) => void;
}) {
  const [item, setItem] = useState(initial);
  const [form, setForm] = useState<Form>(() => formFor(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [duplicates, setDuplicates] = useState<{ list: Duplicate[]; blocked?: boolean } | null>(null);
  const [early, setEarly] = useState<Duplicate[]>([]);
  const creating = !item;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const capacity = numberValue(form.containerCapacity);
  const startQty = form.startQty ? numberValue(form.startQty) : 0;
  const cost = form.purchaseCost ? numberValue(form.purchaseCost) : 0;
  const setup = (): Setup => ({ role: form.role, baseUnit: form.baseUnit, containerType: form.containerType, containerCapacity: capacity, notes: form.notes.trim() });
  const problems: string[] = [];
  if (!form.name.trim()) problems.push("Name is required.");
  if (form.name.includes(":")) problems.push("Name cannot contain “:”.");
  if (!(capacity > 0)) problems.push("Container size must be greater than 0.");
  if (Number.isNaN(cost) || cost < 0) problems.push("Purchase cost must be 0 or more.");
  if (form.unitPrice && !(numberValue(form.unitPrice) >= 0)) problems.push("Sales price must be 0 or more.");
  if (creating && (Number.isNaN(startQty) || startQty < 0)) problems.push("Starting quantity must be 0 or more.");

  function handle(result: SaveResult) {
    if (result.status === "duplicates") {
      setDuplicates({ list: result.duplicates, blocked: result.blocked });
      return;
    }
    if (result.status === "conflict") {
      setItem(result.item);
      setForm((f) => ({ ...formFor(result.item), notes: f.notes, role: f.role, baseUnit: f.baseUnit, containerType: f.containerType, containerCapacity: f.containerCapacity }));
      setNotice("This item was changed in QuickBooks while you were editing. The latest QuickBooks values are shown — review and save again.");
      return;
    }
    onSaved(result.item);
  }

  async function submit(e: FormEvent | null, force = false) {
    e?.preventDefault();
    if (problems.length) return setError(problems[0]);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (creating) {
        handle(
          await client.createItem({
            name: form.name.trim(),
            sku: form.sku.trim(),
            purchaseCost: cost,
            unitPrice: form.unitPrice ? numberValue(form.unitPrice) : 0,
            startQty,
            startDate: form.startDate || null,
            setup: setup(),
            force,
          }),
        );
      } else {
        const fields: Record<string, string | number> = {};
        if (form.name.trim() !== item.name) fields.name = form.name.trim();
        if (form.sku.trim() !== item.sku) fields.sku = form.sku.trim();
        if (cost !== item.purchaseCost) fields.purchaseCost = cost;
        const price = form.unitPrice ? numberValue(form.unitPrice) : 0;
        if (price !== item.unitPrice) fields.unitPrice = price;
        handle(await client.updateItem({ itemId: item.id, syncToken: item.syncToken, fields, setup: setup(), force }));
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function link(match: Duplicate) {
    setBusy(true);
    setError("");
    try {
      handle(await client.saveSetup(match.id, setup(), !match.active));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function checkEarly() {
    if (!creating || form.name.trim().length < 3) return setEarly([]);
    try {
      setEarly((await client.checkName(form.name.trim(), form.sku.trim())).duplicates);
    } catch {
      setEarly([]);
    }
  }

  const unit = form.baseUnit;
  const title = creating ? "New product" : item.status === "needs-setup" ? `Set up ${item.name}` : item.name;
  return (
    <Modal
      title={title}
      subtitle={creating ? "Creates the item in QuickBooks first, then saves the container details in QB Chem." : <>QuickBooks item #{item.id}{item.sku ? ` · SKU ${item.sku}` : ""}{item.type === "Inventory" ? ` · ${stockLine(item.qtyOnHand, item.setup ?? setup())}` : ""}</>}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="qc-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="qc-product-form" className="qc-btn qc-btn-primary" disabled={busy}>
            {busy ? "Saving to QuickBooks…" : creating ? "Create in QuickBooks" : "Save changes"}
          </button>
        </>
      }
    >
      <form id="qc-product-form" onSubmit={(e) => void submit(e)} noValidate>
        {notice && <Notice tone="warn">{notice}</Notice>}
        {item && !item.active && <Notice tone="warn">This item is inactive in QuickBooks. It can’t be used in recipes until it is reactivated in QuickBooks.</Notice>}
        {duplicates && (
          <div className="qc-dupes" role="alert">
            <strong>{duplicates.blocked ? "QuickBooks already has an item with this exact name." : "Similar items already exist in QuickBooks"}</strong>
            <p>Link an existing item instead of creating a duplicate{duplicates.blocked ? ", or choose a different name" : ""}.</p>
            <ul>
              {duplicates.list.map((m) => (
                <li key={m.id}>
                  <span>
                    <strong>{m.name}</strong>
                    <small>#{m.id}{m.sku ? ` · SKU ${m.sku}` : ""} · {m.reason === "exact" ? "same name" : m.reason === "sku" ? "same SKU" : `${Math.round(m.score * 100)}% similar`}{m.active ? "" : " · inactive"}</small>
                  </span>
                  {creating && (
                    <button type="button" className="qc-btn qc-btn-sm" disabled={busy} onClick={() => void link(m)}>
                      <Link2 size={14} /> {m.active ? "Use this item" : "Reactivate & use"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!duplicates.blocked && (
              <button type="button" className="qc-link" disabled={busy} onClick={() => void submit(null, true)}>
                {creating ? "None of these — create a new item anyway" : "Save the new name anyway"}
              </button>
            )}
          </div>
        )}

        <fieldset className="qc-fieldset">
          <legend>QuickBooks details</legend>
          <div className="qc-grid-2">
            <Field label="Name" hint={early.length && !duplicates ? <span className="qc-warn-text">Looks similar to {early.map((m) => m.name).join(", ")}</span> : undefined}>
              {(id) => <input id={id} value={form.name} maxLength={100} required onChange={(e) => set("name", e.target.value)} onBlur={() => void checkEarly()} placeholder="e.g. Methanol" />}
            </Field>
            <Field label="SKU" optional>
              {(id) => <input id={id} value={form.sku} maxLength={100} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. RM-MEOH" />}
            </Field>
            <Field label="Purchase cost" suffix={`$/${unit}`}>
              {(id) => <input id={id} inputMode="decimal" type="number" min={0} step="any" value={form.purchaseCost} onChange={(e) => set("purchaseCost", e.target.value)} placeholder="0.00" />}
            </Field>
            <Field label="Sales price" suffix={`$/${unit}`} optional>
              {(id) => <input id={id} inputMode="decimal" type="number" min={0} step="any" value={form.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} placeholder="0.00" />}
            </Field>
            {creating && (
              <>
                <Field label="Starting stock" suffix={unit} optional hint={startQty > 0 && capacity > 0 ? `${stockLine(startQty, setup())} · valued at ${fmtMoney(startQty * (cost || 0))}` : "Leave empty to start at zero."}>
                  {(id) => <input id={id} inputMode="decimal" type="number" min={0} step="any" value={form.startQty} onChange={(e) => set("startQty", e.target.value)} placeholder="0" />}
                </Field>
                <Field label="Stock as of">
                  {(id) => <input id={id} type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />}
                </Field>
              </>
            )}
          </div>
        </fieldset>

        <fieldset className="qc-fieldset">
          <legend>QB Chem setup</legend>
          <div className="qc-grid-2">
            <Segmented label="Role" value={form.role} onChange={(v) => set("role", v)} options={[{ value: "raw", label: "Raw chemical" }, { value: "finished", label: "Finished product" }]} />
            <Segmented label="Unit" value={form.baseUnit} onChange={(v) => set("baseUnit", v)} options={[{ value: "L", label: "Litres (L)" }, { value: "kg", label: "Kilograms (kg)" }]} />
            <Field label="Container">
              {(id) => (
                <select
                  id={id}
                  value={form.containerType}
                  onChange={(e) => {
                    const type = e.target.value as ContainerType;
                    setForm((f) => ({ ...f, containerType: type, containerCapacity: String(CONTAINER_DEFAULTS[type]) }));
                  }}
                >
                  <option value="drum">Drum</option>
                  <option value="tote">Tote</option>
                  <option value="pail">Pail</option>
                  <option value="other">Other</option>
                </select>
              )}
            </Field>
            <Field label="Each container holds" suffix={unit}>
              {(id) => <input id={id} inputMode="decimal" type="number" min={0} step="any" value={form.containerCapacity} onChange={(e) => set("containerCapacity", e.target.value)} />}
            </Field>
          </div>
          <Field label="Notes" optional>
            {(id) => <textarea id={id} rows={2} maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Handling, SDS reference, supplier…" />}
          </Field>
        </fieldset>
        {creating && <p className="qc-fine">Starting stock is posted by QuickBooks against Opening Balance Equity at the purchase cost.</p>}
        {error && <Notice tone="bad">{error}</Notice>}
      </form>
    </Modal>
  );
}
