import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Factory, Sparkles } from "lucide-react";
import type { Plan, Run } from "./types";
import type { ViewProps } from "./QbChemApp";
import { containerNoun, fmtDate, fmtMoney, fmtNum, fmtUnitCost, friendlyError, stockLine, unitOf } from "./format";
import { Badge, Empty, Field, Notice, Skeleton, numberValue } from "./ui";

const uuid = () => crypto.randomUUID();
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(new Date());
function suggestLot(base: string, runs: Run[]) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "");
  const code = (base.replace(/[^A-Za-z0-9]+/g, "").slice(0, 6) || "LOT").toUpperCase();
  const prefix = `${code}-${d}-`;
  const n = runs.filter((r) => r.lotNumber.startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

export default function ProductionView({ client, data, refresh, patch, go, initialRecipeId }: ViewProps & { initialRecipeId?: string }) {
  const byId = Object.fromEntries(data.items.map((i) => [i.id, i]));
  const firstRecipe = data.recipes.find((r) => r.id === initialRecipeId) ?? data.recipes[0];
  const [recipeId, setRecipeId] = useState(firstRecipe?.id ?? "");
  const [qty, setQty] = useState(firstRecipe ? String(firstRecipe.outputQty) : "");
  const [lot, setLot] = useState("");
  const [note, setNote] = useState("");
  const [runDate, setRunDate] = useState(todayLocal);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<Run | null>(null);
  const [requestId, setRequestId] = useState(uuid);

  const recipe = data.recipes.find((r) => r.id === recipeId);
  const out = recipe ? byId[recipe.outputItemId] : undefined;
  const amount = numberValue(qty);

  useEffect(() => {
    if (!recipeId || !(amount > 0)) return;
    let active = true;
    const timer = setTimeout(() => {
      setPreviewing(true);
      client
        .previewRun(recipeId, amount)
        .then((r) => active && (setPlan(r.plan), setPreviewError("")))
        .catch((e) => active && (setPlan(null), setPreviewError(friendlyError(e))))
        .finally(() => active && setPreviewing(false));
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, recipeId, amount, data.syncedAt]);

  const changed = () => {
    setConfirming(false);
    setPosted(null);
    setError("");
    setRequestId(uuid());
  };

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!recipe || !plan?.ok) return;
    if (!confirming) return setConfirming(true);
    setPosting(true);
    setError("");
    try {
      const today = todayLocal();
      const { run } = await client.postRun({ recipeId, outputQty: amount, lotNumber: lot.trim(), note: note.trim(), runDate: runDate && runDate !== today ? runDate : null, requestId });
      patch((d) => ({ ...d, runs: [run, ...d.runs.filter((r) => r.id !== run.id)] }));
      setPosted(run);
      setConfirming(false);
      setRequestId(uuid());
      setLot("");
      setNote("");
      setRunDate(todayLocal());
      await refresh();
    } catch (err) {
      setError(friendlyError(err));
      setConfirming(false);
    } finally {
      setPosting(false);
    }
  }

  if (!data.recipes.length)
    return (
      <section className="qc-section">
        <div className="qc-section-head"><div><h2>Production</h2><p>Post blending runs to QuickBooks.</p></div></div>
        <div className="qc-card">
          <Empty title="Create a recipe first" action={<button type="button" className="qc-btn qc-btn-primary" onClick={() => go("recipes")}>Go to recipes</button>}>
            Production runs use a recipe to consume raw chemicals and add the finished product at its true cost.
          </Empty>
        </div>
        <RunHistory runs={data.runs} />
      </section>
    );

  const cap = out?.setup?.containerCapacity;
  const sizes = cap ? [1, 2, 4].map((n) => ({ label: `${n} ${containerNoun(out!.setup!.containerType, n)}`, value: n * cap })) : [];
  return (
    <section className="qc-section" aria-labelledby="qc-prod-title">
      <div className="qc-section-head">
        <div>
          <h2 id="qc-prod-title">Production</h2>
          <p>Blend a batch: inputs leave stock, the finished product arrives at the actual QuickBooks cost of what was used.</p>
        </div>
      </div>

      <div className="qc-prod">
        <form className="qc-card qc-prod-form" onSubmit={(e) => void post(e)} noValidate>
          <h3>New production run</h3>
          <Field label="Recipe">
            {(id) => (
              <select
                id={id}
                value={recipeId}
                onChange={(e) => {
                  const r = data.recipes.find((x) => x.id === e.target.value);
                  setRecipeId(e.target.value);
                  setQty(r ? String(r.outputQty) : "");
                  setPlan(null);
                  changed();
                }}
              >
                {data.recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label={`Quantity to produce${out ? ` · ${out.name}` : ""}`} suffix={unitOf(out)} hint={out?.setup && amount > 0 ? `Fills ${stockLine(amount, out.setup)}` : undefined}>
            {(id) => (
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  changed();
                }}
              />
            )}
          </Field>
          {sizes.length > 0 && (
            <div className="qc-chips qc-chips-sizes" role="group" aria-label="Quick sizes">
              {sizes.map((s) => (
                <button key={s.label} type="button" aria-pressed={amount === s.value} className={amount === s.value ? "is-on" : ""} onClick={() => (setQty(String(s.value)), changed())}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <Field label="Lot number" optional>
            {(id) => (
              <div className="qc-inline">
                <input id={id} value={lot} maxLength={40} onChange={(e) => setLot(e.target.value)} placeholder="e.g. CI100-261019-01" />
                <button type="button" className="qc-btn qc-btn-sm" onClick={() => setLot(suggestLot(out?.sku || out?.name || "", data.runs))}>
                  <Sparkles size={14} /> Suggest
                </button>
              </div>
            )}
          </Field>
          <div className="qc-grid-2">
            <Field label="Production date" hint={runDate && runDate < todayLocal() ? "Backdated: posts on this date in QuickBooks." : undefined}>
              {(id) => <input id={id} type="date" value={runDate} max={todayLocal()} onChange={(e) => (setRunDate(e.target.value), changed())} />}
            </Field>
            <Field label="Note" optional>
              {(id) => <input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Operator, tank, QC result…" />}
            </Field>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          {confirming && plan && (
            <Notice tone="warn">
              This posts to QuickBooks{data.connection.env === "sandbox" ? " (sandbox)" : ""}: an inventory adjustment using {plan.lines.length} input{plan.lines.length === 1 ? "" : "s"}, and a $0 internal production bill adding {fmtNum(plan.outputQty)} {unitOf(out)} of {plan.outputName} at the exact batch cost. Confirm to continue.
            </Notice>
          )}
          <div className="qc-form-actions">
            {confirming && <button type="button" className="qc-btn" onClick={() => setConfirming(false)}>Back</button>}
            <button type="submit" className="qc-btn qc-btn-primary" disabled={!plan?.ok || posting || previewing}>
              <Factory size={16} /> {posting ? "Posting to QuickBooks…" : confirming ? "Confirm & post" : "Post to QuickBooks"}
            </button>
          </div>
        </form>

        <div className="qc-card qc-preview" aria-live="polite">
          <h3>Preview</h3>
          {posted ? (
            <PostedSummary run={posted} unit={unitOf(out)} />
          ) : previewError ? (
            <Notice tone="bad">{previewError}</Notice>
          ) : !plan || previewing ? (
            amount > 0 ? <Skeleton rows={5} /> : <p className="qc-muted">Enter a quantity to see the cost and stock impact.</p>
          ) : (
            <>
              <div className="qc-impact">
                {plan.lines.map((l) => {
                  const i = byId[l.itemId];
                  return (
                    <div key={l.itemId} className={`qc-impact-row${l.short ? " is-short" : ""}`}>
                      <div>
                        <strong>{l.name}</strong>
                        <small>uses {fmtNum(l.qty)} {unitOf(i)} · est. {fmtMoney(l.estCost)}</small>
                      </div>
                      <div className="qc-flow">
                        <span>{stockLine(l.available, i?.setup ?? null)}</span>
                        <ArrowRight size={14} aria-hidden="true" />
                        <strong className={l.after < 0 ? "is-bad" : ""}>{stockLine(l.after, i?.setup ?? null)}</strong>
                      </div>
                    </div>
                  );
                })}
                <div className="qc-impact-row is-out">
                  <div>
                    <strong>{plan.outputName}</strong>
                    <small>produces {fmtNum(plan.outputQty)} {unitOf(out)}</small>
                  </div>
                  <div className="qc-flow">
                    <span>{stockLine(plan.finishedBefore, out?.setup ?? null)}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                    <strong>{stockLine(plan.finishedAfter, out?.setup ?? null)}</strong>
                  </div>
                </div>
              </div>
              <div className="qc-summary">
                <span>Estimated cost</span>
                <strong>{fmtMoney(plan.estTotal)}</strong>
                <small>{fmtUnitCost(plan.estUnitCost)}/{unitOf(out)}</small>
              </div>
              <p className="qc-fine">The posted cost is what QuickBooks actually removes from inventory (FIFO). It moves through Production WIP and arrives in {plan.outputName} on a $0 internal production bill, so it is never re-priced later.</p>
              {plan.problems.length > 0 && (
                <Notice tone="bad">
                  <strong>Can’t post yet.</strong> {plan.problems.join(" ")}
                </Notice>
              )}
            </>
          )}
        </div>
      </div>

      <RunHistory runs={data.runs} />
    </section>
  );
}

function PostedSummary({ run, unit }: { run: Run; unit: string }) {
  return (
    <div className="qc-posted">
      <p className="qc-posted-title">
        <CheckCircle2 size={18} aria-hidden="true" /> Posted to QuickBooks
      </p>
      {run.result && (
        <dl className="qc-dl">
          <div><dt>Actual cost</dt><dd>{fmtMoney(run.result.actualCost)}</dd></div>
          <div><dt>Cost per {unit}</dt><dd>{fmtUnitCost(run.result.unitCost)}</dd></div>
          <div><dt>Added to {run.outputName}</dt><dd>{fmtMoney(run.result.billAmount)}</dd></div>
          <div><dt>Production WIP after</dt><dd>{fmtMoney(run.result.wipAfter)}</dd></div>
        </dl>
      )}
      <QboIds run={run} />
    </div>
  );
}

function QboIds({ run }: { run: Run }) {
  const ids = [
    run.qbo.consumeAdjustmentId && `Adj #${run.qbo.consumeAdjustmentId} consume`,
    run.qbo.billId && `Bill #${run.qbo.billId}${run.qbo.billDocNumber ? ` ${run.qbo.billDocNumber}` : ""}`,
    run.qbo.journalEntryId && `JE #${run.qbo.journalEntryId} rounding`,
  ].filter(Boolean) as string[];
  if (!ids.length) return null;
  return (
    <span className="qc-ids">
      {ids.map((id) => (
        <code key={id}>{id}</code>
      ))}
    </span>
  );
}

function RunHistory({ runs }: { runs: Run[] }) {
  return (
    <div className="qc-card">
      <h3 className="qc-card-title">Run history</h3>
      {runs.length === 0 ? (
        <Empty title="No production runs yet">Posted runs appear here with their QuickBooks transaction numbers.</Empty>
      ) : (
        <div className="qc-table qc-table-runs" role="table" aria-label="Production runs">
          <div className="qc-tr qc-th" role="row">
            <span role="columnheader">Run</span>
            <span role="columnheader">Produced</span>
            <span role="columnheader" className="qc-num">Cost</span>
            <span role="columnheader">QuickBooks</span>
            <span role="columnheader">Status</span>
          </div>
          {runs.map((r) => (
            <div key={r.id} className="qc-tr" role="row">
              <span role="cell" className="qc-cell-name">
                <strong>{r.outputName}</strong>
                <small>{r.result?.runDate && r.result.runDate !== (r.postedAt || "").slice(0, 10) ? `${r.result.runDate} (backdated)` : fmtDate(r.postedAt || r.createdAt)}{r.lotNumber ? ` · lot ${r.lotNumber}` : ""}</small>
              </span>
              <span role="cell" data-label="Produced">{fmtNum(r.outputQty)}<small> · {r.recipeName}</small></span>
              <span role="cell" className="qc-num" data-label="Cost">
                {r.result ? <>{fmtMoney(r.result.actualCost)}<small> · {fmtUnitCost(r.result.unitCost)}/unit</small></> : <small>—</small>}
              </span>
              <span role="cell" data-label="QuickBooks"><QboIds run={r} /></span>
              <span role="cell" data-label="Status">
                {r.status === "posted" ? <Badge tone="ok">Posted</Badge> : r.status === "failed" ? <Badge tone="bad">Needs review</Badge> : <Badge tone="info">Posting</Badge>}
                {r.error && <small className="qc-error-text">{r.error}</small>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
