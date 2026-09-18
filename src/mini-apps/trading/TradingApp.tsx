import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  tradingApi,
  tradingError,
  type Dashboard,
  type Settings,
  type Transaction,
  type Cursor,
} from "./api";
import SwapForm from "./SwapForm";
import "./trading.css";
const fmt = (v?: string | null) =>
  v == null
    ? "—"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 });
const time = (v?: number) => (v ? new Date(v).toLocaleString() : "Not yet");
const link = (kind: string, id: string) =>
  `https://livenet.xrpl.org/${kind}/${id}`;
function Address({ value }: { value: string }) {
  return (
    <a
      className="xt-address"
      href={link("accounts", value)}
      target="_blank"
      rel="noreferrer"
    >
      {value}
      <ExternalLink size={13} />
    </a>
  );
}
const fields: [keyof Omit<Settings, "pair">, string, string][] = [
  ["analysisMinutes", "AI / entry check (minutes)", "1"],
  ["newsMinutes", "News refresh (minutes)", "1"],
  ["purchase", "Purchase amount (RLUSD)", "0.01"],
  ["positionCap", "Position cap (RLUSD)", "0.01"],
  ["dailyPurchases", "Daily purchases (RLUSD)", "0.01"],
  ["dailyLoss", "Daily loss stop (RLUSD)", "0.01"],
  ["stopLoss", "Position loss exit (%)", "0.1"],
  ["takeProfit", "Profit target (%)", "0.1"],
  ["spread", "Maximum spread (%)", "0.01"],
  ["movement", "Maximum price movement (%)", "0.01"],
  ["aiBudget", "Daily OpenAI budget (USD)", "0.01"],
];
function SettingsForm({
  value,
  pairs,
  busy,
  save,
}: {
  value: Settings;
  pairs: Dashboard["pairs"];
  busy: boolean;
  save: (v: Settings) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
    >
      <label className="xt-field">
        Approved pair
        <select
          value={draft.pair}
          onChange={(e) => setDraft({ ...draft, pair: e.target.value })}
        >
          {pairs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="xt-form-grid">
        {fields.map(([k, label, step]) => (
          <label className="xt-field" key={k}>
            {label}
            <input
              type="number"
              step={step}
              min={
                k === "analysisMinutes" ? 5 : k === "newsMinutes" ? 15 : step
              }
              max={
                k.endsWith("Minutes")
                  ? 1440
                  : ["spread", "movement"].includes(k)
                    ? 1
                    : ["stopLoss", "takeProfit"].includes(k)
                      ? 100
                      : undefined
              }
              required
              value={draft[k]}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [k]: k.endsWith("Minutes")
                    ? Number(e.target.value)
                    : e.target.value,
                })
              }
            />
          </label>
        ))}
      </div>
      <button className="xt-primary" disabled={busy}>
        Save settings & pause
      </button>
      <p className="xt-muted">
        Saving pauses execution and invalidates unsubmitted decisions. Daily
        budgets reset at midnight UTC.
      </p>
    </form>
  );
}
export default function TradingApp() {
  const [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Wallet"),
    [history, setHistory] = useState<Transaction[]>([]),
    [cursor, setCursor] = useState<Cursor | null>(null);
  const [address, setAddress] = useState(""),
    [tag, setTag] = useState(""),
    [password, setPassword] = useState(""),
    [currency, setCurrency] = useState("RLUSD"),
    [amount, setAmount] = useState("");
  const inFlight = useRef(false),
    request = useRef<{ key: string; id: string } | null>(null);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await tradingApi.dashboard());
    } catch (e) {
      setError(tradingError(e));
    } finally {
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0),
      poll = setInterval(() => {
        if (!document.hidden) void refresh();
      }, 15000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  async function perform(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(message);
      await refresh();
    } catch (e) {
      setError(tradingError(e));
    } finally {
      setBusy(false);
    }
  }
  function act(action: "trust" | "withdraw") {
    const extra = action === "withdraw" ? { amount, currency } : undefined,
      key = JSON.stringify({ action, extra });
    if (
      action === "withdraw" &&
      !window.confirm(
        `Withdraw ${amount} ${currency} to ${data?.returnAddress?.address}${data?.returnAddress?.tag != null ? ` with tag ${data.returnAddress.tag}` : ""}?`,
      )
    )
      return;
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    void perform(async () => {
      await tradingApi.request(action, request.current!.id, extra);
      request.current = null;
    }, "Request queued. Wait for ledger validation.");
  }
  function control(mode: Dashboard["mode"]) {
    if (
      mode === "running" &&
      !window.confirm(
        `Start Mainnet trading with real funds? Purchases up to ${data?.settings.purchase} RLUSD; daily purchase budget ${data?.settings.dailyPurchases} RLUSD.`,
      )
    )
      return;
    if (
      mode === "closing" &&
      !window.confirm(
        "Attempt to sell the tracked XRP position into RLUSD, then stop? Execution is price-limited and may leave a residual holding.",
      )
    )
      return;
    void perform(
      () => tradingApi.automation(mode),
      mode === "paused"
        ? "Paused. Submitted transactions still reconcile."
        : mode === "closing"
          ? "Closing requested; awaiting actual execution."
          : "Automation started. Checks continue when this browser is closed.",
    );
  }
  async function loadHistory(reset = false) {
    await perform(async () => {
      const h = await tradingApi.history(reset ? null : cursor);
      setHistory((old) =>
        reset ? h.transactions : [...old, ...h.transactions],
      );
      setCursor(h.cursor);
    }, "History refreshed.");
  }
  function saveAddress(e: FormEvent) {
    e.preventDefault();
    void perform(async () => {
      if (password) await tradingApi.reauthenticate(password);
      setPassword("");
      await tradingApi.returnAddress(address, tag === "" ? null : Number(tag));
    }, "Return address saved.");
  }
  const locked = busy || !!data?.pending || !!data?.enabled;
  const transactions = data
    ? [
        ...data.transactions,
        ...history.filter((x) => !data.transactions.some((t) => t.id === x.id)),
      ]
    : [];
  return (
    <div className="xt-app">
      <div className="xt-banner">
        <ShieldCheck size={18} />
        <strong>XRPL Mainnet — real funds</strong>
        <span>Owner-only · Rules + AI review · Server-side signing</span>
      </div>
      <header className="xt-heading">
        <div>
          <span className="xt-eyebrow">IROBOTX / AUTOMATED TRADING</span>
          <h1>XRP Trading</h1>
          <p>Watch the market. Understand each decision. Stay in control.</p>
        </div>
        <button
          className="xt-secondary"
          disabled={busy}
          onClick={() => void refresh()}
          aria-label="Refresh trading dashboard"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>
      <nav className="xt-tabs" aria-label="Trading sections">
        {["Wallet", "Automation", "Analysis", "Activity"].map((x) => (
          <button
            key={x}
            aria-current={tab === x ? "page" : undefined}
            onClick={() => {
              setTab(x);
              if (x === "Activity") void loadHistory(true);
            }}
          >
            {x}
          </button>
        ))}
      </nav>
      {error && (
        <div className="xt-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="xt-notice" role="status">
          {notice}
        </div>
      )}
      {!data ? (
        <p role="status">Loading Mainnet workspace…</p>
      ) : (
        <>
          <div className="xt-status">
            <span className={`xt-dot ${data.enabled ? "active" : ""}`} />
            <strong>
              {data.mode === "running"
                ? "Automation running"
                : data.mode === "closing"
                  ? "Closing position, then stopping"
                  : "Automation stopped"}
            </strong>
            <span className="xt-muted">
              Worker heartbeat: {time(data.health.heartbeat)}
            </span>
          </div>
          <div className="xt-actions xt-controls">
            <button
              className="xt-primary"
              disabled={
                busy ||
                data.enabled ||
                !!data.pending ||
                !data.wallet.funded ||
                !data.wallet.trustReady ||
                !!data.discrepancy
              }
              onClick={() => control("running")}
            >
              <Play size={16} />
              Start
            </button>
            <button
              className="xt-secondary"
              disabled={busy}
              onClick={() => control("paused")}
            >
              <Pause size={16} />
              Pause
            </button>
            <button
              className="xt-secondary"
              disabled={
                busy || !!data.pending || Number(data.position.quantity) <= 0
              }
              onClick={() => control("closing")}
            >
              Close position & stop
            </button>
          </div>
          <p className="xt-muted">
            Pause leaves holdings and stops automatic exits. Already submitted
            transactions cannot be reversed.
          </p>
          {data.pending && (
            <div className="xt-notice" role="status">
              {transactions.find((t) => t.id === data.pending)?.action ||
                "Transaction"}{" "}
              ·{" "}
              {transactions.find((t) => t.id === data.pending)?.status ||
                "queued"}{" "}
              · Waiting for a validated ledger result.
            </div>
          )}
          {data.health.error && (
            <div className="xt-error" role="alert">
              {data.health.error}
            </div>
          )}
          {!!data.discrepancy && (
            <div className="xt-notice">
              <p>
                Ledger balances changed outside the trading engine. Review
                deposits or external activity before restarting. Funding is
                excluded from trading P/L.
              </p>
              <button
                className="xt-secondary"
                disabled={locked || Number(data.position.quantity) > 0}
                onClick={() =>
                  void perform(
                    tradingApi.acknowledgeBalances,
                    "Balances reviewed. You can now start when ready.",
                  )
                }
              >
                Acknowledge current balances
              </button>
              {Number(data.position.quantity) > 0 && (
                <p>
                  A holding remains; resolve it before acknowledging external
                  balance changes.
                </p>
              )}
            </div>
          )}
          <div className="xt-metrics">
            {[
              ["Wallet XRP", `${fmt(data.wallet.balance)} XRP`],
              ["Available RLUSD", `${fmt(data.wallet.rlusd)} RLUSD`],
              ["Trading position", `${fmt(data.position.quantity)} XRP`],
              ["Realized P/L", `${fmt(data.position.realized)} RLUSD`],
            ].map(([label, v]) => (
              <div className="xt-card" key={label}>
                <span className="xt-muted">{label}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          {tab === "Wallet" && (
            <div className="xt-grid">
              <section className="xt-card">
                <h2>Dedicated trading wallet</h2>
                <Address value={data.trader} />
                <p>
                  {data.wallet.error ||
                    data.wallet.reason ||
                    (data.wallet.funded
                      ? "Funded on Mainnet."
                      : "Awaiting your XRP funding.")}
                </p>
                <ol>
                  <li>
                    Fund this address with at least {data.wallet.fundingMinimum}{" "}
                    XRP for reserves, the 5 XRP operating buffer, and setup
                    fees.
                  </li>
                  <li>Create the 1,000-RLUSD trust line.</li>
                  <li>
                    Deposit RLUSD or use Swap assets below, then review your
                    settings and press Start.
                  </li>
                </ol>
                <button
                  className="xt-secondary"
                  disabled={
                    locked || !data.wallet.funded || data.wallet.trustReady
                  }
                  onClick={() => act("trust")}
                >
                  {data.wallet.trustReady
                    ? "RLUSD trust line ready"
                    : "Create RLUSD trust line"}
                </button>
                <dl>
                  <dt>Ledger reserve</dt>
                  <dd>{fmt(data.wallet.reserve)} XRP</dd>
                  <dt>Available after reserve</dt>
                  <dd>{fmt(data.wallet.available)} XRP</dd>
                  <dt>Trading network fees</dt>
                  <dd>{fmt(data.position.tradingFees)} XRP</dd>
                  <dt>Setup / transfer fees</dt>
                  <dd>{fmt(data.position.setupFees)} XRP</dd>
                  <dt>Position cost basis</dt>
                  <dd>{fmt(data.position.cost)} RLUSD</dd>
                  <dt>Unrealized P/L estimate</dt>
                  <dd>{fmt(data.unrealized)} RLUSD</dd>
                </dl>
                <p className="xt-muted">
                  The seed stays in Google Secret Manager. Operating XRP is
                  separate from XRP acquired by the strategy. RLUSD is
                  issuer-controlled and can be frozen or clawed back.
                </p>
              </section>
              <section className="xt-card">
                <SwapForm data={data} busy={busy} perform={perform} />
                <hr />
                <h2>Saved return address</h2>
                {data.returnAddress && (
                  <>
                    <Address value={data.returnAddress.address} />
                    <p>Destination tag: {data.returnAddress.tag ?? "None"}</p>
                  </>
                )}
                <form onSubmit={saveAddress}>
                  <label className="xt-field">
                    Return XRPL address
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      placeholder="r…"
                      autoComplete="off"
                    />
                  </label>
                  <label className="xt-field">
                    Destination tag (if required)
                    <input
                      type="number"
                      min="0"
                      max="4294967295"
                      step="1"
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                    />
                  </label>
                  <label className="xt-field">
                    Account password to verify recent sign-in
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button className="xt-secondary" disabled={locked}>
                    Verify & save address
                  </button>
                </form>
                <p className="xt-muted">
                  A sign-in within five minutes is required to save an address.
                  Never enter a wallet seed here.
                </p>
                <h2>Withdraw funds</h2>
                <label className="xt-field">
                  Withdrawal asset
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option>RLUSD</option>
                    <option>XRP</option>
                  </select>
                </label>
                <label className="xt-field">
                  Withdrawal amount
                  <input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <button
                  className="xt-secondary"
                  disabled={locked || !data.returnAddress || !amount}
                  onClick={() => act("withdraw")}
                >
                  Review withdrawal
                </button>
                <p className="xt-muted">
                  Only the saved destination is allowed. XRP withdrawals
                  preserve the ledger reserve and tracked position; replenish
                  the operating buffer before restarting.
                </p>
              </section>
            </div>
          )}
          {tab === "Automation" && (
            <div className="xt-grid">
              <section className="xt-card">
                <h2>Execution settings</h2>
                <SettingsForm
                  key={JSON.stringify(data.settings)}
                  value={data.settings}
                  pairs={data.pairs}
                  busy={busy}
                  save={(v) =>
                    void perform(
                      () => tradingApi.settings(v),
                      "Settings saved. Automation is paused.",
                    )
                  }
                />
              </section>
              <section className="xt-card">
                <h2>How this strategy works</h2>
                <ol>
                  <li>Collect 60 consecutive one-minute market samples.</li>
                  <li>
                    Look for a 20-minute average at least 0.15% above the
                    60-minute average, with the latest price above the shorter
                    average.
                  </li>
                  <li>
                    Ask AI to assess news and risk. Buy only with a fresh
                    approval and passing execution checks.
                  </li>
                  <li>
                    Hold one position. Check trend reversal, loss, and profit
                    exits every minute.
                  </li>
                  <li>Wait 20 minutes after closing before buying again.</li>
                </ol>
                <p>
                  Exit orders are price-limited. Five attempts or ten minutes
                  without a full exit stops the run and leaves the residual
                  holding visible. A loss threshold cannot guarantee a maximum
                  loss.
                </p>
                <dl>
                  <dt>Current signal</dt>
                  <dd>{data.signal.action}</dd>
                  <dt>Reason</dt>
                  <dd>{data.signal.reason}</dd>
                  <dt>Daily purchases reserved</dt>
                  <dd>
                    {data.budget.day === new Date().toISOString().slice(0, 10)
                      ? fmt(data.budget.spent)
                      : "0"}{" "}
                    RLUSD
                  </dd>
                  <dt>Next AI check</dt>
                  <dd>
                    {data.enabled ? time(data.nextAnalysisAt) : "On next Start"}
                  </dd>
                  <dt>Next news refresh</dt>
                  <dd>
                    {data.enabled ? time(data.nextNewsAt) : "On next Start"}
                  </dd>
                </dl>
                <p className="xt-muted">
                  Checks are opportunities to evaluate, not promises to trade.
                  This experimental strategy has no established profitability
                  record.
                </p>
              </section>
            </div>
          )}
          {tab === "Analysis" && (
            <>
              <div className="xt-grid">
                <section className="xt-card">
                  <h2>XRP / RLUSD market</h2>
                  <p>{data.market?.reason || "Waiting for a fresh quote."}</p>
                  <dl>
                    <dt>Best bid / ask</dt>
                    <dd>
                      {fmt(data.market?.bid)} / {fmt(data.market?.ask)} RLUSD
                    </dd>
                    <dt>Spread</dt>
                    <dd>{fmt(data.market?.spread)}%</dd>
                    <dt>Funded asks within limit</dt>
                    <dd>{fmt(data.market?.buyDepth)} RLUSD</dd>
                    <dt>Funded bids within limit</dt>
                    <dd>{fmt(data.market?.sellDepth)} XRP</dd>
                    <dt>Ledger / time</dt>
                    <dd>
                      {data.market?.ledger || "—"} · {time(data.market?.at)}
                    </dd>
                  </dl>
                  {data.market?.asset && (
                    <>
                      <p>Verified RLUSD issuer</p>
                      <Address value={data.market.asset.issuer} />
                    </>
                  )}
                  <p className="xt-muted">
                    Quote source:{" "}
                    {data.market?.source || "Validated XRPL ledger"}
                  </p>
                </section>
                <section className="xt-card">
                  <h2>AI entry review</h2>
                  <strong className="xt-verdict">
                    {data.analysis?.verdict.replaceAll("_", " ") || "Waiting"}
                  </strong>
                  <p>
                    {data.analysis?.reason ||
                      "AI analysis runs after you enable automation. It can block a purchase but cannot change limits or sign transactions."}
                  </p>
                  {data.health.analysisError && (
                    <p role="alert">{data.health.analysisError}</p>
                  )}
                  <dl>
                    <dt>Last analysis</dt>
                    <dd>{time(data.analysis?.at)}</dd>
                    <dt>Approval expiry</dt>
                    <dd>{time(data.analysis?.expiresAt)}</dd>
                    <dt>OpenAI usage today</dt>
                    <dd>
                      US$
                      {fmt(
                        data.aiUsage.day ===
                          new Date().toISOString().slice(0, 10)
                          ? data.aiUsage.spent
                          : "0",
                      )}{" "}
                      / {fmt(data.settings.aiBudget)}
                    </dd>
                  </dl>
                  <p className="xt-muted">
                    Usage includes reserved costs for unfinished requests.
                    Firebase costs are separate.
                  </p>
                </section>
              </div>
              <section className="xt-card xt-news">
                <h2>News considered</h2>
                <p className="xt-muted">Last research: {time(data.news?.at)}</p>
                {data.news?.articles.length ? (
                  data.news.articles.map((a) => (
                    <article key={a.url}>
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.title}
                      </a>
                      <p className="xt-muted">{a.publishedAt}</p>
                      <p>{a.summary}</p>
                    </article>
                  ))
                ) : (
                  <p>
                    {data.news
                      ? "Research completed; no qualifying recent articles."
                      : "News research has not completed."}
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "Activity" && (
            <section className="xt-card">
              <div className="xt-row">
                <h2>Ledger activity</h2>
                <button
                  className="xt-secondary"
                  disabled={busy}
                  onClick={() => void loadHistory(true)}
                >
                  Refresh history
                </button>
              </div>
              <div className="xt-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action / time</th>
                      <th>Status / reason</th>
                      <th>Validated changes</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td>
                          {t.action}
                          <br />
                          {time(t.createdAt)}
                        </td>
                        <td>
                          <span className={`xt-state ${t.status}`}>
                            {t.status}
                          </span>
                          <p>{t.error || t.reason}</p>
                        </td>
                        <td>
                          {t.result ? (
                            <>
                              {t.result.result}
                              <br />
                              XRP excluding fee: {fmt(t.result.tradeXrp)}
                              <br />
                              RLUSD: {fmt(t.result.tokenChange)}
                              <br />
                              Fee: {fmt(t.result.fee)} XRP
                            </>
                          ) : (
                            "Awaiting validated result"
                          )}
                        </td>
                        <td>
                          {t.hash ? (
                            <a
                              href={link("transactions", t.hash)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.hash.slice(0, 12)}…
                            </a>
                          ) : (
                            "Not submitted"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!transactions.length && <p>No Mainnet transactions yet.</p>}
              {cursor && (
                <button
                  className="xt-secondary"
                  disabled={busy}
                  onClick={() => void loadHistory()}
                >
                  Load older transactions
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
