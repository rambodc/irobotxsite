import { useState } from "react";
import { Factory, Pencil, Plus } from "lucide-react";
import type { Item, Recipe } from "./types";
import type { ViewProps } from "./QbChemApp";
import { fmtMoney, fmtNum, fmtUnitCost, stockLine, unitOf } from "./format";
import { Badge, Empty } from "./ui";
import RecipeDialog from "./RecipeDialog";

export function recipeEstimate(recipe: Recipe, byId: Record<string, Item>) {
  const total = recipe.lines.reduce((s, l) => s + l.qty * (byId[l.itemId]?.purchaseCost ?? 0), 0);
  return { total, perUnit: recipe.outputQty ? total / recipe.outputQty : 0 };
}

export default function RecipesView({ client, data, patch, go }: ViewProps) {
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const byId = Object.fromEntries(data.items.map((i) => [i.id, i]));
  const usable = data.items.filter((i) => i.active && i.type === "Inventory" && i.trackQty);

  return (
    <section className="qc-section" aria-labelledby="qc-recipes-title">
      <div className="qc-section-head">
        <div>
          <h2 id="qc-recipes-title">Recipes</h2>
          <p>How much of each raw chemical goes into a batch. Linked to QuickBooks items by id, so renames are safe.</p>
        </div>
        <button type="button" className="qc-btn qc-btn-primary" onClick={() => setEditing("new")} disabled={usable.length < 2}>
          <Plus size={16} /> New recipe
        </button>
      </div>

      {data.recipes.length === 0 ? (
        <div className="qc-card">
          <Empty
            title="No recipes yet"
            action={
              usable.length >= 2 ? (
                <button type="button" className="qc-btn qc-btn-primary" onClick={() => setEditing("new")}>
                  <Plus size={16} /> Create a recipe
                </button>
              ) : (
                <button type="button" className="qc-btn" onClick={() => go("products")}>Add products first</button>
              )
            }
          >
            A recipe turns raw chemicals into a finished product, e.g. 800 L Methanol + 20 kg Surfactant → 1,000 L CI-100.
          </Empty>
        </div>
      ) : (
        <div className="qc-recipe-grid">
          {data.recipes.map((r) => {
            const out = byId[r.outputItemId];
            const est = recipeEstimate(r, byId);
            const broken = !out || !out.active || r.lines.some((l) => !byId[l.itemId]?.active);
            return (
              <article key={r.id} className="qc-card qc-recipe">
                <header>
                  <div>
                    <h3>{r.name}</h3>
                    <p>
                      Makes <strong>{fmtNum(r.outputQty)} {unitOf(out)}</strong> of {out?.name ?? <em>missing item #{r.outputItemId}</em>}
                      {out?.setup && <> · {stockLine(r.outputQty, out.setup).split(" · ")[0]}</>}
                    </p>
                  </div>
                  {broken && <Badge tone="bad">Check items</Badge>}
                </header>
                <ul className="qc-inputs">
                  {r.lines.map((l) => {
                    const i = byId[l.itemId];
                    return (
                      <li key={l.itemId}>
                        <span>{i?.name ?? `Missing item #${l.itemId}`}{i && !i.active && " (inactive)"}</span>
                        <span className="qc-num">{fmtNum(l.qty)} {unitOf(i)}</span>
                      </li>
                    );
                  })}
                </ul>
                <footer>
                  <div className="qc-est">
                    <span>Est. cost</span>
                    <strong>{fmtMoney(est.total)}</strong>
                    <small>{fmtUnitCost(est.perUnit)}/{unitOf(out)}</small>
                  </div>
                  <div className="qc-actions">
                    <button type="button" className="qc-btn qc-btn-sm" onClick={() => setEditing(r)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button type="button" className="qc-btn qc-btn-sm qc-btn-primary" onClick={() => go("production", r.id)} disabled={broken}>
                      <Factory size={14} /> Produce
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <RecipeDialog
          client={client}
          recipe={editing === "new" ? null : editing}
          items={data.items}
          onClose={() => setEditing(null)}
          onSaved={(recipe) => {
            patch((d) => ({ ...d, recipes: [...d.recipes.filter((x) => x.id !== recipe.id), recipe].sort((a, b) => a.name.localeCompare(b.name)) }));
            setEditing(null);
          }}
          onDeleted={(id) => {
            patch((d) => ({ ...d, recipes: d.recipes.filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
