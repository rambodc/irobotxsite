import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Wrench } from "lucide-react";
import type { Item } from "./types";
import type { ViewProps } from "./QbChemApp";
import { containerStock, fmtMoney, fmtUnitCost, unitOf } from "./format";
import { Badge, Empty } from "./ui";
import ProductDialog from "./ProductDialog";

type Filter = "all" | "raw" | "finished" | "setup";

export default function ProductsView({ client, data, patch }: ViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Item | "new" | null>(null);

  const active = data.items.filter((i) => i.active);
  const needsSetup = active.filter((i) => i.status === "needs-setup" && i.type === "Inventory");
  const stats = {
    raw: active.filter((i) => i.setup?.role === "raw").length,
    finished: active.filter((i) => i.setup?.role === "finished").length,
    value: active.filter((i) => i.type === "Inventory").reduce((s, i) => s + Math.max(0, i.qtyOnHand) * i.purchaseCost, 0),
  };
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.items.filter(
      (i) =>
        (showInactive || i.active) &&
        (filter === "all" ||
          (filter === "setup" ? i.status === "needs-setup" : i.setup?.role === filter)) &&
        (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)),
    );
  }, [data.items, query, filter, showInactive]);

  function saved(item: Item) {
    patch((d) => ({
      ...d,
      items: d.items.some((i) => i.id === item.id)
        ? d.items.map((i) => (i.id === item.id ? item : i))
        : [item, ...d.items],
    }));
    setEditing(null);
  }

  return (
    <section className="qc-section" aria-labelledby="qc-products-title">
      <div className="qc-section-head">
        <div>
          <h2 id="qc-products-title">Products & Chemicals</h2>
          <p>Live from QuickBooks. Names, SKUs, stock and prices always come from QuickBooks.</p>
        </div>
        <button type="button" className="qc-btn qc-btn-primary" onClick={() => setEditing("new")}>
          <Plus size={16} /> New product
        </button>
      </div>

      <div className="qc-stats">
        <div className="qc-stat"><span>Raw chemicals</span><strong>{stats.raw}</strong></div>
        <div className="qc-stat"><span>Finished products</span><strong>{stats.finished}</strong></div>
        <div className="qc-stat"><span>Needs setup</span><strong className={needsSetup.length ? "is-warn" : ""}>{needsSetup.length}</strong></div>
        <div className="qc-stat"><span>Stock value · current cost</span><strong>{fmtMoney(stats.value)}</strong></div>
      </div>

      {needsSetup.length > 0 && (
        <div className="qc-callout">
          <Wrench size={18} aria-hidden="true" />
          <div>
            <strong>{needsSetup.length} QuickBooks {needsSetup.length === 1 ? "item needs" : "items need"} setup</strong>
            <p>Add the role, unit and container so {needsSetup.length === 1 ? "it" : "they"} can be used in recipes.</p>
          </div>
          <button type="button" className="qc-btn" onClick={() => setEditing(needsSetup[0])}>
            Set up {needsSetup[0].name}
          </button>
        </div>
      )}

      <div className="qc-card">
        <div className="qc-toolbar">
          <label className="qc-search">
            <Search size={16} aria-hidden="true" />
            <span className="qc-sr">Search products</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or SKU" />
          </label>
          <div className="qc-chips" role="group" aria-label="Filter">
            {(
              [
                ["all", "All"],
                ["raw", "Raw"],
                ["finished", "Finished"],
                ["setup", "Needs setup"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? "is-on" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <label className="qc-toggle">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>

        {rows.length === 0 ? (
          <Empty
            title={data.items.length ? "No matching products" : "No products in QuickBooks yet"}
            action={
              !data.items.length && (
                <button type="button" className="qc-btn qc-btn-primary" onClick={() => setEditing("new")}>
                  <Plus size={16} /> Create the first product
                </button>
              )
            }
          >
            {data.items.length ? "Try a different search or filter." : "Products you create here are added to QuickBooks first."}
          </Empty>
        ) : (
          <div className="qc-table" role="table" aria-label="Products and chemicals">
            <div className="qc-tr qc-th" role="row">
              <span role="columnheader">Product</span>
              <span role="columnheader">In stock</span>
              <span role="columnheader" className="qc-num">Cost</span>
              <span role="columnheader" className="qc-num">Price</span>
              <span role="columnheader">Status</span>
              <span role="columnheader"><span className="qc-sr">Open</span></span>
            </div>
            {rows.map((i) => {
              const stock = containerStock(i.qtyOnHand, i.setup);
              return (
                <button key={i.id} type="button" role="row" className={`qc-tr${i.active ? "" : " is-inactive"}`} onClick={() => setEditing(i)}>
                  <span role="cell" className="qc-cell-name">
                    <strong>{i.name}</strong>
                    <small>
                      {i.setup ? <Badge tone={i.setup.role}>{i.setup.role === "raw" ? "Raw" : "Finished"}</Badge> : null}
                      {i.sku ? <span>SKU {i.sku}</span> : null}
                      {i.type !== "Inventory" && <span>Non-inventory</span>}
                    </small>
                  </span>
                  <span role="cell" className="qc-cell-stock" data-label="In stock">
                    {i.type === "Inventory" ? (
                      <>
                        <strong className={i.qtyOnHand < 0 ? "is-bad" : ""}>{stock.primary}</strong>
                        <small>{stock.secondary}</small>
                      </>
                    ) : (
                      <small>Not tracked</small>
                    )}
                  </span>
                  <span role="cell" className="qc-num" data-label="Cost">
                    {fmtUnitCost(i.purchaseCost)}<small>/{unitOf(i)}</small>
                  </span>
                  <span role="cell" className="qc-num" data-label="Price">
                    {i.unitPrice ? <>{fmtUnitCost(i.unitPrice)}<small>/{unitOf(i)}</small></> : <small>—</small>}
                  </span>
                  <span role="cell" data-label="Status">
                    {!i.active ? <Badge>Inactive</Badge> : i.status === "ready" ? <Badge tone="ok">Ready</Badge> : <Badge tone="warn">Needs setup</Badge>}
                  </span>
                  <span role="cell" className="qc-cell-go" aria-hidden="true"><ChevronRight size={16} /></span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <ProductDialog
          client={client}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </section>
  );
}
