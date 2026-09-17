import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChartCandlestick,
  CirclePause,
  FlaskConical,
  History as HistoryIcon,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  tradingApi,
  tradingError,
  type Change,
  type Config,
  type Cursor,
  type Dashboard,
  type History,
  type Market,
  type Pair,
  type Rules,
} from "./api";
import PriceChart from "./PriceChart";
import "./trading.css";
const fmt = (n: string | number | null | undefined, d = 4) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const date = (n: number | undefined) =>
  n ? new Date(n).toLocaleString() : "Not yet";
const tabs = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "markets", label: "Markets", icon: ChartCandlestick },
  { id: "strategy", label: "Strategy", icon: Settings2 },
  { id: "history", label: "History", icon: HistoryIcon },
] as const;
type Tab = (typeof tabs)[number]["id"];
function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function Stat({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="xt-stat">
      <span>{label}</span>
      <strong>
        {value} <small>{unit}</small>
      </strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}
function Issuer({ pair }: { pair: Pair }) {
  return (
    <div className="xt-issuers">
      {[pair.base, pair.quote]
        .filter((a) => a.issuer)
        .map((a) => (
          <span key={`${a.currency}-${a.issuer}`}>
            <b>{a.symbol} issuer</b>
            <code>{a.issuer}</code>
            <small>Currency: {a.currency}</small>
          </span>
        ))}
    </div>
  );
}
function MarketCard({
  pair,
  market,
  active,
  busy,
  change,
}: {
  pair: Pair;
  market?: Market;
  active: boolean;
  busy: boolean;
  change: (c: Change) => Promise<void>;
}) {
  const now = useClock();
  const fresh = !!market?.at && now - market.at <= 90000 && !market.error;
  const spread =
    fresh && Number(market?.bid) > 0
      ? ((Number(market?.ask) - Number(market?.bid)) /
          ((Number(market?.ask) + Number(market?.bid)) / 2)) *
        100
      : null;
  return (
    <section className="xt-panel">
      <div className="xt-panel-head">
        <div>
          <span className="xt-kicker">
            {active ? "ACTIVE STRATEGY PAIR" : "WATCHLIST"}
          </span>
          <h2>{pair.name}</h2>
        </div>
        <div className="xt-actions">
          {!active && (
            <button
              className="xt-secondary"
              disabled={busy}
              onClick={() =>
                void change({ action: "selectPair", pairId: pair.id })
              }
            >
              Use for strategy
            </button>
          )}
          {!active && (
            <button
              className="xt-icon-button"
              aria-label={`Remove ${pair.name}`}
              disabled={busy}
              onClick={() =>
                void change({ action: "removePair", pairId: pair.id })
              }
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      {!fresh && (
        <p className="xt-warning">
          {market?.error || "Waiting for a fresh scheduled sample."}
        </p>
      )}
      <div className="xt-quote-grid">
        <Stat
          label="Best bid"
          value={fresh ? fmt(market?.bid, 6) : "—"}
          unit={pair.quote.symbol}
        />
        <Stat
          label="Best ask"
          value={fresh ? fmt(market?.ask, 6) : "—"}
          unit={pair.quote.symbol}
        />
        <Stat label="Spread" value={fmt(spread, 3)} unit="%" />
      </div>
      <PriceChart samples={market?.history || []} unit={pair.quote.symbol} />
      <details className="xt-book">
        <summary>Funded order-book depth and token identity</summary>
        <Issuer pair={pair} />
        <div className="xt-book-columns">
          {(["bids", "asks"] as const).map((side) => (
            <div key={side}>
              <h3>{side === "bids" ? "Bids" : "Asks"}</h3>
              <div className="xt-depth-label">
                <span>Price ({pair.quote.symbol})</span>
                <span>Size ({pair.base.symbol})</span>
              </div>
              {fresh &&
                market?.[side]?.slice(0, 8).map((l, i) => (
                  <div className="xt-depth-row" key={i}>
                    <span>{fmt(l.price, 6)}</span>
                    <span>{fmt(l.quantity, 3)}</span>
                  </div>
                ))}
              {(!fresh || !market?.[side]?.length) && (
                <p>No current depth available.</p>
              )}
            </div>
          ))}
        </div>
        <p className="xt-fine">
          Up to 50 direct-book offers are sampled per side. Display shows the
          first eight. Ledger {market?.ledger || "—"} · {date(market?.at)}
        </p>
      </details>
    </section>
  );
}
function Strategy({
  config,
  busy,
  change,
}: {
  config: Config;
  busy: boolean;
  change: (c: Change) => Promise<void>;
}) {
  const fields: {
    key: keyof Rules;
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
  }[] = [
    {
      key: "threshold",
      label: "Momentum threshold",
      min: 0.01,
      max: 5,
      step: 0.01,
      unit: "%",
    },
    {
      key: "orderSize",
      label: "Maximum order value",
      min: 1,
      max: 1000,
      step: 1,
      unit: "quote units",
    },
    {
      key: "maxPosition",
      label: "Maximum position value",
      min: 1,
      max: 10000,
      step: 1,
      unit: "quote units",
    },
    {
      key: "maxSpread",
      label: "Maximum spread",
      min: 0.01,
      max: 5,
      step: 0.01,
      unit: "%",
    },
    {
      key: "cooldown",
      label: "Trade cooldown",
      min: 60,
      max: 3600,
      step: 1,
      unit: "seconds",
    },
  ];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const rules = Object.fromEntries(
      fields.map((f) => [f.key, Number(data.get(f.key))]),
    ) as unknown as Rules;
    await change({ action: "rules", rules });
  }
  return (
    <div className="xt-strategy-grid">
      <form className="xt-panel" onSubmit={submit} key={config.revision}>
        <span className="xt-kicker">STRATEGY 01</span>
        <h2>Simple momentum</h2>
        <p>
          Compare the latest midpoint with the previous five one-minute samples.
        </p>
        <div className="xt-field-grid">
          {fields.map((f) => (
            <label key={f.key}>
              {f.label}
              <span className="xt-input-unit">
                <input
                  name={f.key}
                  type="number"
                  required
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  defaultValue={config.rules[f.key]}
                />
                <small>{f.unit}</small>
              </span>
            </label>
          ))}
        </div>
        <button className="xt-primary" disabled={busy}>
          Save settings & pause
        </button>
        <p className="xt-fine">
          Saving pauses automation. Restart from the top of the app when ready.
        </p>
      </form>
      <aside className="xt-panel">
        <span className="xt-kicker">HOW IT WORKS</span>
        <h2>A reason for every decision.</h2>
        <ol className="xt-steps">
          <li>
            <strong>Observe</strong>
            <p>
              Collect six consecutive fresh samples. A gap restarts warm-up.
            </p>
          </li>
          <li>
            <strong>Compare</strong>
            <p>
              BUY above your threshold, SELL below its negative equivalent,
              otherwise WAIT.
            </p>
          </li>
          <li>
            <strong>Check limits</strong>
            <p>
              Apply spread, cash, position, liquidity, and cooldown limits. Only
              existing holdings can be sold.
            </p>
          </li>
          <li>
            <strong>Simulate</strong>
            <p>
              Walk funded book offers within 0.5% of the best quote. Include a
              0.1% simulated fee.
            </p>
          </li>
        </ol>
        <p className="xt-fine">
          Experimental rules for learning. No AI or news inputs are used yet.
        </p>
      </aside>
    </div>
  );
}
function TradeHistory() {
  const [data, setData] = useState<History | null>(null),
    [error, setError] = useState(""),
    [cursors, setCursors] = useState<(Cursor | null)[]>([null]),
    [busy, setBusy] = useState(false);
  const cursor = cursors.at(-1) || null;
  useEffect(() => {
    let active = true;
    tradingApi
      .history(cursor)
      .then((r) => {
        if (active) {
          setData(r);
          setError("");
          setBusy(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(tradingError(e));
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [cursor]);
  const move = (next: (Cursor | null)[]) => {
    setBusy(true);
    setData(null);
    setCursors(next);
  };
  return (
    <section className="xt-panel">
      <div className="xt-panel-head">
        <div>
          <span className="xt-kicker">PAPER EXECUTIONS</span>
          <h2>Every trade, explained.</h2>
        </div>
        <span className="xt-muted">Page {cursors.length}</span>
      </div>
      {error && (
        <p role="alert" className="xt-warning">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading trade history…</p>}
      {data?.trades.length === 0 && (
        <div className="xt-empty">
          <HistoryIcon size={32} />
          <h3>No simulated trades yet.</h3>
          <p>
            Start paper trading and let the strategy collect six samples. Trades
            appear when a signal passes your limits.
          </p>
        </div>
      )}
      {!!data?.trades.length && (
        <div className="xt-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time / pair</th>
                <th>Side</th>
                <th>Quantity</th>
                <th>Price / fee</th>
                <th>Realized P/L</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((t) => (
                <tr key={t.id}>
                  <td>
                    {date(t.at)}
                    <small>
                      {t.pairName} · Ledger {t.ledger}
                    </small>
                  </td>
                  <td>
                    <span className={`xt-signal ${t.side.toLowerCase()}`}>
                      {t.side}
                    </span>
                  </td>
                  <td>{fmt(t.quantity, 6)}</td>
                  <td>
                    {fmt(t.price, 6)} {t.quote}
                    <small>
                      Fee {fmt(t.fee, 6)} {t.quote}
                    </small>
                  </td>
                  <td>
                    {t.side === "SELL" ? `${fmt(t.pnl)} ${t.quote}` : "—"}
                  </td>
                  <td>{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="xt-pagination">
        <button
          className="xt-secondary"
          disabled={busy || cursors.length === 1}
          onClick={() => move(cursors.slice(0, -1))}
        >
          Previous
        </button>
        <button
          className="xt-secondary"
          disabled={busy || !data?.cursor}
          onClick={() => move([...cursors, data!.cursor])}
        >
          Next
        </button>
      </div>
    </section>
  );
}
export default function TradingApp() {
  const now = useClock();
  const [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("overview");
  const request = useRef(0),
    mounted = useRef(false),
    mutation = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const r = await tradingApi.dashboard();
      if (mounted.current && id === request.current) {
        setData(r);
        setError("");
      }
    } catch (e) {
      if (mounted.current && id === request.current) setError(tradingError(e));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => {
      if (!document.hidden && !mutation.current) void refresh();
    }, 15000);
    const focus = () => {
      if (!document.hidden && !mutation.current) void refresh();
    };
    document.addEventListener("visibilitychange", focus);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  async function perform(action: () => Promise<Config>, message: string) {
    mutation.current = true;
    request.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const config = await action();
      if (mounted.current) {
        setData((old) => (old ? { ...old, config } : old));
        setNotice(message);
      }
      await refresh();
    } catch (e) {
      if (mounted.current) setError(tradingError(e));
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const change = (input: Change) =>
    perform(
      () => tradingApi.configure(input),
      "Settings saved. Paper automation is paused.",
    );
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await change({
      action: "addPair",
      base: {
        currency: String(f.get("currency")).trim(),
        issuer: String(f.get("issuer")).trim(),
      },
      quote: String(f.get("quote")) as "XRP" | "RLUSD",
    });
  }
  if (!data)
    return (
      <section className="xt-app">
        <div className="xt-panel" role={error ? "alert" : "status"}>
          {error || "Opening your private trading workspace…"}
          {error && (
            <button className="xt-secondary" onClick={() => void refresh()}>
              Try again
            </button>
          )}
        </div>
      </section>
    );
  const { config } = data,
    pair = config.pairs.find((p) => p.id === config.activePair)!;
  const market = data.markets.find((m) => m.pairId === pair.id),
    portfolio = data.portfolios.find((p) => p.pairId === pair.id);
  const stale =
    !data.health?.lastEvaluation ||
    now - data.health.lastEvaluation > 90000 ||
    data.health.configRevision !== config.revision;
  const decision = stale
    ? {
        side: "WAIT",
        reason: "Waiting for the background worker to evaluate the market.",
        execution: "",
      }
    : data.health?.decision;
  return (
    <div className="xt-app">
      <div className="xt-toolbar">
        <nav aria-label="Trading sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => {
                setTab(t.id);
                setNotice("");
              }}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="xt-actions">
          <span className="xt-paper-badge">
            <FlaskConical size={13} /> PAPER ONLY
          </span>
          <button
            className={config.enabled ? "xt-secondary" : "xt-primary"}
            disabled={busy}
            onClick={() =>
              void perform(
                () => tradingApi.automation(!config.enabled),
                config.enabled
                  ? "Paper automation paused."
                  : "Paper automation started. It continues when you close the app.",
              )
            }
          >
            {config.enabled ? <CirclePause size={16} /> : <Play size={16} />}{" "}
            {config.enabled ? "Pause trading" : "Start paper trading"}
          </button>
        </div>
      </div>
      <div className="xt-context">
        <span>
          <i className={config.enabled ? "xt-dot running" : "xt-dot"} />
          {config.enabled ? "Automation on" : "Automation paused"} · {pair.name}
        </span>
        <span>
          Background evaluation every minute{" "}
          <button
            className="xt-icon-button"
            aria-label="Refresh trading data"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={13} />
          </button>
        </span>
      </div>
      {error && (
        <p role="alert" className="xt-warning">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="xt-notice">
          {notice}
        </p>
      )}
      {data.health?.error && (
        <p className="xt-warning">
          Market evaluation: {data.health.error} No trades are placed on invalid
          data.
        </p>
      )}
      {tab === "overview" && (
        <>
          <div className="xt-stats">
            <Stat
              label="Estimated portfolio value"
              value={fmt(portfolio?.equity, 2)}
              unit={pair.quote.symbol}
              detail="Includes holdings valued at bid, less simulated exit fee"
            />
            <Stat
              label="Realized P/L"
              value={fmt(portfolio?.realized, 2)}
              unit={pair.quote.symbol}
            />
            <Stat
              label="Estimated unrealized P/L"
              value={fmt(portfolio?.unrealized, 2)}
              unit={pair.quote.symbol}
            />
            <Stat
              label="Available balance"
              value={fmt(portfolio?.cash, 2)}
              unit={pair.quote.symbol}
              detail="Simulated funds"
            />
          </div>
          <div className="xt-overview-grid">
            <MarketCard
              pair={pair}
              market={market}
              active
              busy={busy}
              change={change}
            />
            <div className="xt-side-stack">
              <section className="xt-panel xt-decision">
                <span className="xt-kicker">LATEST STRATEGY SIGNAL</span>
                <div
                  className={`xt-signal-large ${decision?.side.toLowerCase() || "wait"}`}
                >
                  {decision?.side === "BUY" ? (
                    <ArrowUpRight />
                  ) : decision?.side === "SELL" ? (
                    <ArrowDownLeft />
                  ) : (
                    <Activity />
                  )}
                  {decision?.side || "WAIT"}
                </div>
                <p>
                  {decision?.reason || "Collecting the first market samples."}
                </p>
                <div className="xt-execution">
                  {decision?.execution ||
                    "The strategy evaluates once per minute."}
                </div>
                <dl className="xt-facts">
                  <div>
                    <dt>Holding</dt>
                    <dd>
                      {fmt(portfolio?.quantity)} {pair.base.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Simulated fees paid</dt>
                    <dd>
                      {fmt(portfolio?.fees)} {pair.quote.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Last evaluation</dt>
                    <dd>{date(data.health?.lastEvaluation)}</dd>
                  </div>
                  <div>
                    <dt>Last successful sample</dt>
                    <dd>{date(data.health?.lastSuccess)}</dd>
                  </div>
                  <div>
                    <dt>Last attempt</dt>
                    <dd>{date(data.health?.lastAttempt)}</dd>
                  </div>
                </dl>
              </section>
              <section className="xt-panel xt-lab-note">
                <FlaskConical size={22} />
                <h3>Build confidence in the process.</h3>
                <p>
                  Your strategy runs on Firebase while this app is closed.
                  Returning to mini apps or signing out keeps it running. Use
                  Pause to stop it.
                </p>
                <button
                  className="xt-text-button"
                  onClick={() => setTab("strategy")}
                >
                  Review strategy <ArrowUpRight size={14} />
                </button>
              </section>
            </div>
          </div>
        </>
      )}
      {tab === "markets" && (
        <>
          <div className="xt-market-list">
            {config.pairs.map((p) => (
              <MarketCard
                key={p.id}
                pair={p}
                market={data.markets.find((m) => m.pairId === p.id)}
                active={p.id === config.activePair}
                busy={busy}
                change={change}
              />
            ))}
          </div>
          <form className="xt-panel xt-add-market" onSubmit={add}>
            <div>
              <span className="xt-kicker">{config.pairs.length} / 5 PAIRS</span>
              <h2>Watch a custom token</h2>
              <p>
                Token identity includes its issuer. Matching symbols alone do
                not mean matching assets.
              </p>
            </div>
            <div className="xt-field-grid">
              <label>
                Currency code
                <input
                  name="currency"
                  required
                  maxLength={40}
                  placeholder="USD or a 40-character hex code"
                />
              </label>
              <label>
                Issuer address
                <input
                  name="issuer"
                  required
                  maxLength={35}
                  placeholder="r…"
                  autoComplete="off"
                />
              </label>
              <label>
                Quote asset
                <select name="quote" defaultValue="XRP">
                  <option value="XRP">XRP</option>
                  <option value="RLUSD">RLUSD · Ripple issuer</option>
                </select>
              </label>
            </div>
            <button
              className="xt-primary"
              disabled={busy || config.pairs.length >= 5}
            >
              <Plus size={16} /> Add to watchlist
            </button>
            <p className="xt-fine">
              Adding or removing pairs pauses automation. Portfolios and trades
              remain saved when a pair is removed.
            </p>
          </form>
        </>
      )}
      {tab === "strategy" && (
        <Strategy config={config} busy={busy} change={change} />
      )}
      {tab === "history" && <TradeHistory />}
      <footer className="xt-footer">
        <FlaskConical size={15} />
        <p>
          Real XRPL order books. Simulated trades and balances. No wallet is
          connected. This experimental model excludes AMM routing, issuer
          transfer fees, and actual ledger transaction costs. News and AI
          analysis are planned for a later version.
        </p>
      </footer>
    </div>
  );
}
