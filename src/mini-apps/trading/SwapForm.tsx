import { useEffect, useState } from "react";
import { tradingApi, type Dashboard, type SwapQuote } from "./api";

export default function SwapForm({
  data,
  busy,
  perform,
}: {
  data: Dashboard;
  busy: boolean;
  perform: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [currency, setCurrency] = useState<"XRP" | "RLUSD">("XRP");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!quote) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote]);
  const reason =
    data.enabled || data.mode !== "paused"
      ? "Pause automation before swapping."
      : Number(data.position.quantity) > 0
        ? "Close the trading position before swapping."
        : data.pending
          ? "Wait for the pending transaction."
          : !data.wallet.funded || !data.wallet.trustReady
            ? "Fund the wallet and create the RLUSD trust line first."
            : data.discrepancy
              ? "Acknowledge current balances above before swapping."
              : null;
  const expired = !!quote && now >= quote.validUntil;
  return (
    <div>
      <h2>Swap assets</h2>
      <p>Convert XRP and RLUSD in this trading wallet.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuote(null);
          void perform(async () => {
            const next = await tradingApi.swapQuote(currency, amount);
            setNow(Date.now());
            setQuote(next);
          }, "Quote ready. Review the amounts before confirming.");
        }}
      >
        <label className="xt-field">
          Swap direction
          <select
            value={currency}
            disabled={busy}
            onChange={(e) => {
              setCurrency(e.target.value as "XRP" | "RLUSD");
              setQuote(null);
            }}
          >
            <option value="XRP">XRP → RLUSD</option>
            <option value="RLUSD">RLUSD → XRP</option>
          </select>
        </label>
        <label className="xt-field">
          Amount to swap ({currency})
          <input
            type="number"
            min="0.000001"
            step="0.000001"
            required
            value={amount}
            disabled={busy}
            placeholder="10"
            onChange={(e) => {
              setAmount(e.target.value);
              setQuote(null);
            }}
          />
        </label>
        <button className="xt-secondary" disabled={busy || !!reason || !amount}>
          {quote ? "Refresh swap quote" : "Get swap quote"}
        </button>
      </form>
      {reason && <p className="xt-muted">{reason}</p>}
      {quote && (
        <div aria-live="polite">
          <dl>
            <dt>You spend</dt>
            <dd>
              {quote.amount} {quote.currency}
            </dd>
            <dt>Estimated receipt</dt>
            <dd>
              {quote.estimate} {quote.receiveCurrency}
            </dd>
            <dt>Minimum receipt if filled</dt>
            <dd>
              {quote.minimum} {quote.receiveCurrency}
            </dd>
            <dt>Maximum network fee</dt>
            <dd>{quote.maxFee} XRP</dd>
          </dl>
          <p className="xt-muted">
            {expired
              ? "Quote expired. Refresh it to continue."
              : `Quote expires in ${Math.max(0, Math.ceil((quote.validUntil - now) / 1000))} seconds.`}{" "}
            The swap fills in full or cancels. A submitted transaction can incur
            a network fee even if it does not fill.
          </p>
          <button
            className="xt-primary"
            disabled={busy || !!reason || expired}
            onClick={() => {
              if (Date.now() >= quote.validUntil) {
                setNow(Date.now());
                return;
              }
              if (
                !window.confirm(
                  `Swap ${quote.amount} ${quote.currency} for at least ${quote.minimum} ${quote.receiveCurrency}? Maximum network fee: ${quote.maxFee} XRP. This uses real funds.`,
                )
              )
                return;
              void perform(async () => {
                await tradingApi.swap(quote.id);
                setQuote(null);
                setAmount("");
              }, "Swap queued. Check Activity for the validated result.");
            }}
          >
            Confirm swap
          </button>
        </div>
      )}
      <p className="xt-muted">
        Swaps preserve the ledger reserve and 5 XRP operating buffer. Manual
        conversions are excluded from the bot’s position and trading P/L. The
        spread and price movement limits in Automation also apply here.
      </p>
    </div>
  );
}
