import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Pause,
  Play,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  tradingApi,
  tradingError,
  type Dashboard,
  type Cursor,
  type Transaction,
} from "./api";
import "./trading.css";
const fmt = (s?: string) =>
  s === undefined
    ? "—"
    : Number(s) !== 0 && Math.abs(Number(s)) < 0.00000001
      ? s
      : Number(s).toLocaleString(undefined, { maximumFractionDigits: 8 });
const time = (n?: number) => (n ? new Date(n).toLocaleString() : "Not yet");
const explorer = (type: "accounts" | "transactions", value: string) =>
  `https://testnet.xrpl.org/${type}/${value}`;
function Address({ value }: { value: string }) {
  return (
    <a
      className="xt-address"
      href={explorer("accounts", value)}
      target="_blank"
      rel="noreferrer"
    >
      {value}
      <ExternalLink size={13} />
    </a>
  );
}
export default function TradingApp() {
  const [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Wallet"),
    [history, setHistory] = useState<Transaction[]>([]),
    [cursor, setCursor] = useState<Cursor | null>(null),
    [loadedHistory, setLoadedHistory] = useState(false);
  const inFlight = useRef(false),
    request = useRef<{ action: Transaction["action"]; id: string } | null>(
      null,
    );
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await tradingApi.dashboard());
      setError("");
    } catch (e) {
      setError(tradingError(e));
    } finally {
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(initialLoad);
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
  async function act(action: Transaction["action"]) {
    if (request.current?.action !== action)
      request.current = { action, id: crypto.randomUUID() };
    await perform(async () => {
      await tradingApi.request(action, request.current!.id);
      request.current = null;
    }, "Request queued. Success will appear only after ledger validation.");
  }
  async function loadHistory(reset = false) {
    await perform(async () => {
      const h = await tradingApi.history(reset ? null : cursor);
      setHistory((old) =>
        reset ? h.transactions : [...old, ...h.transactions],
      );
      setCursor(h.cursor);
      setLoadedHistory(true);
    }, "Transaction history refreshed.");
  }
  const pending = data?.transactions.find((t) => t.id === data.pending),
    locked = busy || !!data?.pending || !!data?.enabled;
  return (
    <div className="xt-app">
      <div className="xt-banner">
        <FlaskConical size={18} />
        <strong>XRPL Testnet — test funds only</strong>
        <span>Real ledger transactions. No monetary value.</span>
      </div>
      <header className="xt-heading">
        <div>
          <span className="xt-eyebrow">TRANSACTION LAB</span>
          <h1>XRP Trading</h1>
          <p>A dedicated wallet. Bounded execution. Verifiable results.</p>
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
        {["Wallet", "Market", "Run Test", "Transactions"].map((x) => (
          <button
            key={x}
            aria-current={tab === x ? "page" : undefined}
            onClick={() => {
              setTab(x);
              if (x === "Transactions") void loadHistory(true);
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
        <p role="status">Loading Testnet workspace…</p>
      ) : (
        <>
          <div className="xt-status">
            <span className={data.enabled ? "xt-dot active" : "xt-dot"} />
            {data.enabled ? "Automatic test running" : "Automation stopped"}
            <span>{data.run?.completed || 0} / 3 cycles</span>
            <span className="xt-muted">
              Worker heartbeat: {time(data.health.heartbeat)}
            </span>
          </div>
          {data.health.error && (
            <div className="xt-error" role="alert">
              {data.health.error}
            </div>
          )}
          {pending && (
            <div className="xt-notice" role="status">
              {pending.action === "trust"
                ? "Creating trust line"
                : pending.action === "sell"
                  ? "Selling cycle holding"
                  : pending.action === "buy"
                    ? "Buying test asset"
                    : "Sending test XRP"}{" "}
              ·{" "}
              {["submitted", "pending"].includes(pending.status)
                ? "Waiting for validation"
                : pending.status}
              .{" "}
              {pending.hash && (
                <a
                  href={explorer("transactions", pending.hash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              )}
            </div>
          )}
          {tab === "Wallet" && (
            <>
              <div className="xt-metrics">
                {[
                  ["Ledger balance", `${fmt(data.wallet.balance)} XRP`],
                  [
                    "Available after reserve",
                    `${fmt(data.wallet.available)} XRP`,
                  ],
                  [
                    "Cycle holding",
                    `${fmt(data.position.quantity)} ${data.market?.symbol || "tokens"}`,
                  ],
                  [
                    "Realized trading P/L",
                    `${fmt(data.position.realized)} test XRP`,
                  ],
                ].map(([label, value]) => (
                  <div className="xt-card" key={label}>
                    <span className="xt-muted">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="xt-grid">
                <section className="xt-card">
                  <h2>
                    <Wallet size={20} />
                    Trading wallet
                  </h2>
                  <p className="xt-good">
                    {data.wallet.funded
                      ? "Funded on Testnet"
                      : data.wallet.error ||
                        data.wallet.reason ||
                        "Awaiting faucet funding"}
                  </p>
                  <Address value={data.trader} />
                  <dl>
                    <dt>Ledger reserve</dt>
                    <dd>{fmt(data.wallet.reserve)} XRP</dd>
                    <dt>Protected extra buffer</dt>
                    <dd>5 XRP</dd>
                    <dt>Validated ledger</dt>
                    <dd>{data.wallet.ledger || "—"}</dd>
                    <dt>Ledger timestamp</dt>
                    <dd>{time(data.wallet.at)}</dd>
                  </dl>
                  <p className="xt-muted">
                    The signing seed stays in Google Secret Manager. The browser
                    never receives it.
                  </p>
                </section>
                <section className="xt-card">
                  <h2>Payment-test recipient</h2>
                  <Address value={data.receiver} />
                  <p>
                    This separate account receives the 1 test-XRP verification
                    payment.
                  </p>
                  <dl>
                    <dt>Actual trading fees</dt>
                    <dd>{fmt(data.position.tradingFees)} XRP</dd>
                    <dt>Setup & transfer fees</dt>
                    <dd>{fmt(data.position.setupFees)} XRP</dd>
                    <dt>Remaining cost basis</dt>
                    <dd>{fmt(data.position.cost)} test XRP</dd>
                  </dl>
                  <p className="xt-muted">
                    Faucet funding and payment transfers are excluded from
                    trading P/L. Test-asset prices do not represent real
                    markets.
                  </p>
                </section>
              </div>
            </>
          )}
          {tab === "Market" && (
            <section className="xt-card">
              <div className="xt-row">
                <h2>
                  <ArrowDownUp size={20} />
                  {data.market?.symbol || "Select a market"} / XRP{" "}
                  <small>TEST ASSET</small>
                </h2>
                <button
                  className="xt-primary"
                  disabled={locked || Number(data.position.quantity) > 0}
                  onClick={() =>
                    void perform(
                      tradingApi.discover,
                      "Market discovery completed.",
                    )
                  }
                >
                  Discover eligible market
                </button>
              </div>
              <p>
                {data.market?.reason ||
                  "Scan existing Testnet offers and select a funded two-sided market."}
              </p>
              {data.market?.asset && (
                <>
                  <p>
                    Issuer identity — familiar symbols do not imply affiliation
                    with real issuers.
                  </p>
                  <Address value={data.market.asset.issuer} />
                  <p className="xt-address">
                    Currency: {data.market.asset.currency}
                  </p>
                </>
              )}
              <div className="xt-metrics">
                {[
                  ["Best bid", fmt(data.market?.bid)],
                  ["Best ask", fmt(data.market?.ask)],
                  ["Spread", `${fmt(data.market?.spread)}%`],
                  [
                    "Funded asks within limit",
                    `${fmt(data.market?.buyDepth)} XRP`,
                  ],
                  [
                    "Funded bids within limit",
                    `${fmt(data.market?.sellDepth)} tokens`,
                  ],
                ].map(([a, b]) => (
                  <div key={a}>
                    <p className="xt-muted">{a}</p>
                    <strong>{b}</strong>
                  </div>
                ))}
              </div>
              <p className="xt-muted">
                Prices in test XRP per token. Source:{" "}
                {data.market?.source || "XRPL Testnet validated ledger"}. Ledger{" "}
                {data.market?.ledger || "—"} · {time(data.market?.at)}
              </p>
              <p>
                Maximum spread 1% · Price movement limit 0.5% · No issuer
                transfer fees or restricted assets.
              </p>
            </section>
          )}
          {tab === "Run Test" && (
            <div className="xt-grid">
              <section className="xt-card">
                <h2>1. Verify the wallet</h2>
                <p>
                  Send 1 test XRP to the configured recipient. Then establish a
                  bounded trust line for the selected asset.
                </p>
                <div className="xt-actions">
                  <button
                    className="xt-secondary"
                    disabled={locked || !data.wallet.funded}
                    onClick={() => void act("payment")}
                  >
                    Send test payment
                  </button>
                  <button
                    className="xt-secondary"
                    disabled={locked || !data.market?.eligible}
                    onClick={() => void act("trust")}
                  >
                    Create trust line
                  </button>
                </div>
                <h2>2. Test a single trade</h2>
                <p>
                  Buy with at most 1 test XRP, then sell only the tokens
                  acquired by this cycle.
                </p>
                <div className="xt-actions">
                  <button
                    className="xt-secondary"
                    disabled={
                      locked ||
                      !data.market?.eligible ||
                      Number(data.position.quantity) > 0
                    }
                    onClick={() => void act("buy")}
                  >
                    Buy test token
                  </button>
                  <button
                    className="xt-secondary"
                    disabled={locked || Number(data.position.quantity) <= 0}
                    onClick={() => void act("sell")}
                  >
                    Sell cycle holding
                  </button>
                </div>
              </section>
              <section className="xt-card">
                <h2>3. Run three automatic cycles</h2>
                <p>
                  This is an execution test, not a profitability strategy. It
                  buys and then sells, up to three times, using existing Testnet
                  liquidity.
                </p>
                <dl>
                  <dt>Purchase limit</dt>
                  <dd>1 XRP per cycle · 10 XRP per UTC day</dd>
                  <dt>Network fee cap</dt>
                  <dd>0.01 XRP per transaction</dd>
                  <dt>Sell bounds</dt>
                  <dd>5 attempts · 10 minutes per cycle</dd>
                  <dt>Progress</dt>
                  <dd>{data.run?.status || "Ready to start"}</dd>
                </dl>
                <button
                  className="xt-primary"
                  disabled={
                    busy ||
                    (!data.enabled &&
                      !data.pending &&
                      (!data.market?.eligible ||
                        Number(data.position.quantity) > 0))
                  }
                  onClick={() =>
                    void perform(
                      () =>
                        tradingApi.automation(!(data.enabled || data.pending)),
                      data.enabled || data.pending
                        ? "Paused. Submitted transactions will still reconcile."
                        : "Bounded run enabled; it continues with the browser closed.",
                    )
                  }
                >
                  {data.enabled ? <Pause size={16} /> : <Play size={16} />}{" "}
                  {data.enabled
                    ? "Pause run"
                    : data.pending
                      ? "Pause submissions"
                      : "Start three-cycle test"}
                </button>
                <p className="xt-muted">
                  Pause prevents new submissions. Transactions already submitted
                  cannot be reversed. Returning to the launcher or signing out
                  does not stop an enabled run.
                </p>
              </section>
            </div>
          )}
          {tab === "Transactions" && (
            <section className="xt-card">
              <div className="xt-row">
                <h2>
                  <CheckCircle2 size={20} />
                  Ledger transaction history
                </h2>
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
                      <th>Status</th>
                      <th>Actual result</th>
                      <th>Transaction hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(loadedHistory
                      ? [
                          ...data.transactions,
                          ...history.filter(
                            (item) =>
                              !data.transactions.some(
                                (latest) => latest.id === item.id,
                              ),
                          ),
                        ]
                      : data.transactions
                    ).map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.action}</strong>
                          <br />
                          {time(t.createdAt)}
                        </td>
                        <td>
                          <span className={`xt-state ${t.status}`}>
                            {t.status}
                          </span>
                          {t.error && <p>{t.error}</p>}
                        </td>
                        <td>
                          {t.result ? (
                            <>
                              {t.result.result}
                              <br />
                              XRP change: {fmt(t.result.xrpChange)}
                              <br />
                              Token change: {fmt(t.result.tokenChange)}
                              {t.result.executionPrice && (
                                <>
                                  <br />
                                  Fill price: {fmt(
                                    t.result.executionPrice,
                                  )}{" "}
                                  test XRP
                                </>
                              )}
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
                              className="xt-address"
                              href={explorer("transactions", t.hash)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.hash.slice(0, 12)}…<ExternalLink size={13} />
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
              {!data.transactions.length && (
                <p>No transactions yet. Start with the test payment.</p>
              )}
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
