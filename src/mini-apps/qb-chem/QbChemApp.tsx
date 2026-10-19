import { useCallback, useEffect, useState } from "react";
import { Beaker, BookOpen, Factory, RefreshCw, Settings2 } from "lucide-react";
import type { QbChemClient, Snapshot } from "./types";
import { ago, friendlyError } from "./format";
import { Notice, Skeleton } from "./ui";
import ProductsView from "./ProductsView";
import RecipesView from "./RecipesView";
import ProductionView from "./ProductionView";
import SettingsView from "./SettingsView";
import "./qbchem.css";

export type Section = "products" | "recipes" | "production" | "settings";
const SECTIONS: { id: Section; label: string; short: string; icon: typeof Beaker }[] = [
  { id: "products", label: "Products & Chemicals", short: "Products", icon: Beaker },
  { id: "recipes", label: "Recipes", short: "Recipes", icon: BookOpen },
  { id: "production", label: "Production", short: "Production", icon: Factory },
  { id: "settings", label: "Settings & connection", short: "Settings", icon: Settings2 },
];

export interface ViewProps {
  client: QbChemClient;
  data: Snapshot;
  refresh: () => Promise<void>;
  patch: (fn: (d: Snapshot) => Snapshot) => void;
  go: (section: Section, recipeId?: string) => void;
}

export default function QbChemApp({ client, initialSection = "products" }: { client: QbChemClient; initialSection?: Section }) {
  const [section, setSection] = useState<Section>(initialSection);
  const [focusRecipe, setFocusRecipe] = useState<string | undefined>();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await client.load();
      setData(snapshot);
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    client
      .load()
      .then((s) => active && (setData(s), setError("")))
      .catch((e) => active && setError(friendlyError(e)))
      .finally(() => active && (setLoading(false), setNow(Date.now())));
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      active = false;
      clearInterval(tick);
    };
  }, [client]);

  const patch = useCallback((fn: (d: Snapshot) => Snapshot) => setData((d) => (d ? fn(d) : d)), []);
  const go = useCallback((s: Section, recipeId?: string) => {
    setSection(s);
    setFocusRecipe(recipeId);
  }, []);
  const needsSetup = data?.items.filter((i) => i.active && i.status === "needs-setup" && i.type === "Inventory").length ?? 0;

  return (
    <div className="qc">
      <div className="qc-topbar">
        <nav className="qc-nav" aria-label="QB Chem sections">
          {SECTIONS.map(({ id, label, short, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={section === id ? "is-active" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="qc-nav-long">{label}</span>
              <span className="qc-nav-short">{short}</span>
              {id === "products" && needsSetup > 0 && <span className="qc-nav-count" aria-label={`${needsSetup} need setup`}>{needsSetup}</span>}
            </button>
          ))}
        </nav>
        <div className="qc-sync" aria-live="polite">
          {data?.connection.env === "sandbox" && <span className="qc-env">Sandbox</span>}
          <span className={`qc-dot ${error ? "is-bad" : loading ? "is-busy" : data?.connection.connected ? "is-ok" : "is-bad"}`} aria-hidden="true" />
          <span className="qc-sync-text">
            {loading
              ? "Syncing with QuickBooks…"
              : error
                ? "QuickBooks sync failed"
                : data?.connection.connected
                  ? `Synced with QuickBooks ${ago(data.syncedAt, now)}`
                  : "QuickBooks not connected"}
          </span>
          <button type="button" className="qc-icon-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh from QuickBooks" title="Refresh from QuickBooks">
            <RefreshCw size={16} className={loading ? "qc-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <Notice tone="bad">
          {error}{" "}
          <button type="button" className="qc-link" onClick={() => void refresh()}>
            Try again
          </button>
        </Notice>
      )}

      {!data ? (
        loading ? (
          <div className="qc-card"><Skeleton rows={6} /></div>
        ) : null
      ) : section === "products" ? (
        <ProductsView client={client} data={data} refresh={refresh} patch={patch} go={go} />
      ) : section === "recipes" ? (
        <RecipesView client={client} data={data} refresh={refresh} patch={patch} go={go} />
      ) : section === "production" ? (
        <ProductionView key={focusRecipe ?? "run"} client={client} data={data} refresh={refresh} patch={patch} go={go} initialRecipeId={focusRecipe} />
      ) : (
        <SettingsView client={client} data={data} refresh={refresh} patch={patch} go={go} />
      )}
    </div>
  );
}
