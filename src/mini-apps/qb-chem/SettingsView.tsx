import { useState } from "react";
import { Check, Copy, Link2, ShieldCheck } from "lucide-react";
import type { ViewProps } from "./QbChemApp";
import { fmtMoney, friendlyError } from "./format";
import { Badge, Notice } from "./ui";

export default function SettingsView({ client, data, patch }: ViewProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const c = data.connection;
  const s = data.settings;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const rows: [string, string, "wip" | "inventoryAsset" | "income" | "cogs" | "residual" | "vendor" | "taxCode"][] = [
    ["Production WIP", "Clearing account each run passes through; nets to $0.", "wip"],
    ["Inventory asset", "Where raw and finished stock value sits.", "inventoryAsset"],
    ["Product income", "Used for new items’ sales.", "income"],
    ["Cost of goods sold", "Used for new items’ cost of sales.", "cogs"],
    ["Production vendor", "Internal vendor on the $0 production bills. Never paid.", "vendor"],
    ["Production tax code", "Keeps the internal bills out of GST/HST.", "taxCode"],
    ["Rounding", "Receives any cents left in WIP after a run (normally none).", "residual"],
  ];

  return (
    <section className="qc-section" aria-labelledby="qc-settings-title">
      <div className="qc-section-head">
        <div>
          <h2 id="qc-settings-title">Settings & connection</h2>
          <p>QuickBooks is the master record. QB Chem keeps only container details, recipes and run history.</p>
        </div>
      </div>
      {message && <Notice tone="ok">{message}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="qc-settings">
        <div className="qc-card">
          <h3 className="qc-card-title">QuickBooks connection</h3>
          <div className="qc-conn">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <strong>{c.connected ? c.companyName || `Company ${c.realmId}` : "Not connected"}</strong>
              <small>{c.connected ? <>Company id {c.realmId} · {c.env === "sandbox" ? "Sandbox (test company)" : "Live company"}</> : "Connect to start syncing."}</small>
            </div>
            {c.connected ? <Badge tone="ok">Connected</Badge> : <Badge tone="bad">Offline</Badge>}
          </div>
          <p className="qc-fine">Access tokens are stored only on the server and renew automatically. Reconnect if QuickBooks asks you to sign in again.</p>
          <button
            type="button"
            className="qc-btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { url } = await client.connectStart();
                window.open(url, "_blank", "noopener,noreferrer");
                setMessage("QuickBooks opened in a new tab. Approve access, then come back and press Refresh.");
              })
            }
          >
            <Link2 size={16} /> {c.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
          </button>
          <div className="qc-field qc-copy">
            <span className="qc-label">Redirect URI (registered in the Intuit app)</span>
            <div className="qc-inline">
              <code>{data.oauthRedirectUri}</code>
              <button
                type="button"
                className="qc-icon-button"
                aria-label="Copy redirect URI"
                onClick={() => void navigator.clipboard?.writeText(data.oauthRedirectUri).then(() => setCopied(true))}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="qc-card">
          <h3 className="qc-card-title">Accounts used for production</h3>
          {!s ? (
            <p className="qc-muted">Not set up yet.</p>
          ) : (
            <dl className="qc-accounts">
              <div>
                <dt>
                  Production WIP balance
                  <small>Should be $0.00 between runs.</small>
                </dt>
                <dd>{s.wipBalance === null ? "—" : Math.abs(s.wipBalance) < 0.005 ? <Badge tone="ok">{fmtMoney(0)}</Badge> : <Badge tone="warn">{fmtMoney(s.wipBalance)}</Badge>}</dd>
              </div>
              {rows.map(([label, help, key]) => (
                <div key={key}>
                  <dt>
                    {label}
                    <small>{help}</small>
                  </dt>
                  <dd>{s[key]?.name ?? <Badge tone="warn">Missing</Badge>}</dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            className="qc-btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { settings } = await client.ensureSetup();
                patch((d) => ({ ...d, settings }));
                setMessage("Accounts checked in QuickBooks.");
              })
            }
          >
            Check accounts in QuickBooks
          </button>
        </div>
        <div className="qc-card qc-wide">
          <h3 className="qc-card-title">How a production run is posted</h3>
          <ol className="qc-steps">
            <li><strong>Consume.</strong> One inventory adjustment takes the recipe inputs out of stock. QuickBooks values them at its own FIFO cost and moves that value into Production WIP.</li>
            <li><strong>Cost.</strong> QB Chem reads the WIP increase: that is the true cost of the batch.</li>
            <li><strong>Produce.</strong> A $0 bill from the internal production vendor adds the finished product at exactly that cost, with an equal negative line that empties WIP. Nothing is owed and no tax applies.</li>
            <li><strong>Clear.</strong> If any cents remain in WIP, a small journal entry clears them, so WIP always ends at $0.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
