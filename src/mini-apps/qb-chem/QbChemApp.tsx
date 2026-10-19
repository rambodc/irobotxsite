import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, ArrowUpRight, Link2 } from "lucide-react";
import {
  api,
  errorMessage,
  type QbChemStatus,
  type QbChemical,
  type QbRecipe,
} from "../../api";

type Tab = "stock" | "recipes" | "batches" | "connect";

export default function QbChemApp() {
  const [tab, setTab] = useState<Tab>("stock");
  const [data, setData] = useState<QbChemStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setError("");
      setData(await api.qbChemStatus());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    void api
      .qbChemStatus()
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function ensureSetup() {
    setBusy(true);
    try {
      await api.qbChemEnsureSetup();
      setMessage("QuickBooks accounts ready (Production WIP + inventory links).");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const { url, redirectUri } = await api.qbChemConnectStart();
      setMessage(
        `Redirect URI to register in Intuit (if not already): ${redirectUri}`,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveChemical(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api.qbChemUpsertChemical({
        name: String(fd.get("name")),
        kind: String(fd.get("kind")),
        baseUnit: String(fd.get("baseUnit")),
        containerType: String(fd.get("containerType")),
        containerCapacity: Number(fd.get("containerCapacity")),
        purchaseCost: Number(fd.get("purchaseCost") || 0),
        unitPrice: Number(fd.get("unitPrice") || 0),
        sku: String(fd.get("sku") || ""),
        notes: String(fd.get("notes") || ""),
        initialQtyBase: Number(fd.get("initialQtyBase") || 0),
      });
      setMessage("Chemical saved and linked to QuickBooks sandbox.");
      form.reset();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveRecipe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const rawId = String(fd.get("rawChemicalId"));
    const rawQty = Number(fd.get("rawQtyBase"));
    const raw2Id = String(fd.get("raw2ChemicalId") || "");
    const raw2Qty = Number(fd.get("raw2QtyBase") || 0);
    const lines = [{ chemicalId: rawId, qtyBase: rawQty }];
    if (raw2Id && raw2Qty > 0) lines.push({ chemicalId: raw2Id, qtyBase: raw2Qty });
    setBusy(true);
    setError("");
    try {
      await api.qbChemUpsertRecipe({
        name: String(fd.get("name")),
        finishedChemicalId: String(fd.get("finishedChemicalId")),
        outputQtyBase: Number(fd.get("outputQtyBase")),
        lines,
      });
      setMessage("Recipe saved.");
      form.reset();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function postBatch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result = await api.qbChemPostBatch({
        recipeId: String(fd.get("recipeId")),
        outputQtyBase: Number(fd.get("outputQtyBase")),
        lotNumber: String(fd.get("lotNumber") || ""),
        note: String(fd.get("note") || ""),
      });
      setMessage(
        `Batch posted. Cost $${result.costTotal.toFixed(2)} ($${result.costPerBase.toFixed(4)} / unit). QBO adjustments: ${(result.qbo.adjustmentIds as string[] | undefined)?.join(", ") || "n/a"}.`,
      );
      form.reset();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const raws = data?.chemicals.filter((c) => c.kind === "raw") || [];
  const finished = data?.chemicals.filter((c) => c.kind === "finished") || [];

  return (
    <div className="qb-chem">
      <div className="admin-heading">
        <p>
          Container-first inventory for Uniquem. Stock and production sync to
          QuickBooks Online sandbox.
        </p>
        <button className="small-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {data && (
        <p className="qb-chem-status">
          QBO:{" "}
          {data.connection.connected
            ? `connected (${data.connection.env}) · ${data.connection.companyName || data.connection.realmId}`
            : "not connected"}
          {" · "}
          Setup: {data.settings?.ready ? "ready" : "needs ensure setup"}
        </p>
      )}

      {message && (
        <div role="status" className="alert success">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}

      <nav className="qb-chem-tabs" aria-label="QB Chem sections">
        {(
          [
            ["stock", "Stock"],
            ["recipes", "Recipes"],
            ["batches", "Batches"],
            ["connect", "Connect"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "small-button" : "text-link"}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "stock" && (
        <>
          <section className="panel">
            <h3>On hand</h3>
            {!data?.chemicals.length ? (
              <p>No chemicals yet.</p>
            ) : (
              <ul className="qb-chem-list">
                {data.chemicals.map((c) => (
                  <ChemRow key={c.id} c={c} />
                ))}
              </ul>
            )}
          </section>
          <form className="panel" onSubmit={saveChemical}>
            <h3>Add chemical</h3>
            <div className="form-row">
              <label>
                Name
                <input name="name" required maxLength={100} placeholder="Methanol" />
              </label>
              <label>
                Kind
                <select name="kind" defaultValue="raw">
                  <option value="raw">Raw</option>
                  <option value="finished">Finished</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Base unit
                <select name="baseUnit" defaultValue="L">
                  <option value="L">L</option>
                  <option value="kg">kg</option>
                </select>
              </label>
              <label>
                Container
                <select name="containerType" defaultValue="drum">
                  <option value="drum">Drum</option>
                  <option value="tote">Tote</option>
                  <option value="pail">Pail</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Capacity
                <input
                  name="containerCapacity"
                  type="number"
                  step="any"
                  required
                  min={0.0001}
                  defaultValue={205}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Purchase cost / unit
                <input name="purchaseCost" type="number" step="any" min={0} defaultValue={0} />
              </label>
              <label>
                Sell price / unit
                <input name="unitPrice" type="number" step="any" min={0} defaultValue={0} />
              </label>
              <label>
                Starting qty (base)
                <input name="initialQtyBase" type="number" step="any" min={0} defaultValue={0} />
              </label>
            </div>
            <div className="form-row">
              <label>
                SKU
                <input name="sku" maxLength={64} />
              </label>
              <label>
                Notes
                <input name="notes" maxLength={2000} />
              </label>
            </div>
            <button className="button" disabled={busy}>
              Save to QB Chem + sandbox <ArrowUpRight size={18} />
            </button>
          </form>
        </>
      )}

      {tab === "recipes" && (
        <>
          <section className="panel">
            <h3>Recipes</h3>
            {!data?.recipes.length ? (
              <p>No recipes yet.</p>
            ) : (
              <ul className="qb-chem-list">
                {data.recipes.map((r) => (
                  <RecipeRow key={r.id} r={r} chemicals={data.chemicals} />
                ))}
              </ul>
            )}
          </section>
          <form className="panel" onSubmit={saveRecipe}>
            <h3>Add recipe</h3>
            <label>
              Name
              <input name="name" required maxLength={100} placeholder="CI-100 standard blend" />
            </label>
            <label>
              Finished product
              <select name="finishedChemicalId" required>
                <option value="">Select…</option>
                {finished.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Output qty (base units)
              <input name="outputQtyBase" type="number" step="any" required min={0.0001} defaultValue={1000} />
            </label>
            <div className="form-row">
              <label>
                Raw #1
                <select name="rawChemicalId" required>
                  <option value="">Select…</option>
                  {raws.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qty
                <input name="rawQtyBase" type="number" step="any" required min={0.0001} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Raw #2 (optional)
                <select name="raw2ChemicalId">
                  <option value="">None</option>
                  {raws.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qty
                <input name="raw2QtyBase" type="number" step="any" min={0} defaultValue={0} />
              </label>
            </div>
            <button className="button" disabled={busy || !finished.length || !raws.length}>
              Save recipe <ArrowUpRight size={18} />
            </button>
          </form>
        </>
      )}

      {tab === "batches" && (
        <>
          <section className="panel">
            <h3>Recent batches</h3>
            {!data?.batches.length ? (
              <p>No batches yet.</p>
            ) : (
              <ul className="qb-chem-list">
                {data.batches.map((b) => (
                  <li key={b.id}>
                    <strong>{b.status}</strong> · {b.outputQtyBase} units · $
                    {Number(b.costTotal || 0).toFixed(2)}
                    {b.lotNumber ? ` · lot ${b.lotNumber}` : ""}
                    {b.qbo?.adjustmentIds ? (
                      <small>
                        {" "}
                        QBO IA: {(b.qbo.adjustmentIds as string[]).join(", ")}
                      </small>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <form className="panel" onSubmit={postBatch}>
            <h3>Post production batch</h3>
            <p>
              Consumes raw chemicals, produces finished goods, carries cost into
              QuickBooks via inventory adjustments (sandbox).
            </p>
            <label>
              Recipe
              <select name="recipeId" required>
                <option value="">Select…</option>
                {(data?.recipes || [])
                  .filter((r) => r.active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (out {r.outputQtyBase})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Output qty (base)
              <input name="outputQtyBase" type="number" step="any" required min={0.0001} />
            </label>
            <label>
              Lot number <span className="optional">(optional)</span>
              <input name="lotNumber" maxLength={64} />
            </label>
            <label>
              Note
              <input name="note" maxLength={2000} />
            </label>
            <button className="button" disabled={busy || !data?.recipes?.length}>
              Post batch to sandbox <ArrowUpRight size={18} />
            </button>
          </form>
        </>
      )}

      {tab === "connect" && (
        <section className="panel">
          <h3>QuickBooks connection</h3>
          <p>
            Tokens are stored server-side. Sandbox only until you approve
            production.
          </p>
          <p>
            <strong>OAuth redirect URI</strong> (add in Intuit Developer app):
            <br />
            <code>{data?.oauthRedirectUri || "…"}</code>
          </p>
          <div className="qb-chem-actions">
            <button className="button" type="button" disabled={busy} onClick={() => void ensureSetup()}>
              Ensure WIP + account setup
            </button>
            <button className="small-button" type="button" disabled={busy} onClick={() => void connect()}>
              <Link2 size={16} /> Connect QuickBooks
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function ChemRow({ c }: { c: QbChemical }) {
  return (
    <li>
      <strong>{c.name}</strong> · {c.kind} · {c.containersOnHand} {c.containerType}
      {c.containersOnHand === 1 ? "" : "s"} ({c.containerCapacity} {c.baseUnit} each) ·{" "}
      {c.qtyBaseOnHand} {c.baseUnit} · ${c.purchaseCost}/{c.baseUnit}
      {c.qboItemId ? <small> · QBO #{c.qboItemId}</small> : null}
    </li>
  );
}

function RecipeRow({
  r,
  chemicals,
}: {
  r: QbRecipe;
  chemicals: QbChemical[];
}) {
  const nameOf = (id: string) => chemicals.find((c) => c.id === id)?.name || id;
  return (
    <li>
      <strong>{r.name}</strong> → {nameOf(r.finishedChemicalId)} ({r.outputQtyBase})
      <ul>
        {r.lines.map((l) => (
          <li key={l.chemicalId}>
            {nameOf(l.chemicalId)}: {l.qtyBase}
          </li>
        ))}
      </ul>
    </li>
  );
}
