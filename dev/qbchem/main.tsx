// LOCAL DEV ONLY. Not imported by src/ and not a Vite build input, so it never ships.
import React from "react";
import ReactDOM from "react-dom/client";
import { ArrowLeft, LogOut } from "lucide-react";
import QbChemApp, { type Section } from "../../src/mini-apps/qb-chem/QbChemApp";
import { createFixtureClient } from "./fixtures";
import "../../src/styles.css";
import "../../src/portal/portal.css";

if (!import.meta.env.DEV) throw new Error("QB Chem fixture preview is dev-only.");
const params = new URLSearchParams(location.search);
const section = (params.get("section") as Section) || "products";
const client = createFixtureClient({ empty: params.has("empty") });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="ix-portal">
      <header className="ix-portal-header">
        <div className="ix-portal-start">
          <a href="#" className="ix-back"><ArrowLeft size={17} /><span>Back to mini apps</span></a>
          <strong style={{ letterSpacing: 2, fontSize: 15 }}>IROBOTX</strong>
        </div>
        <div className="ix-portal-user">
          <span>Rambod Rad<small>fixture preview · no sign-in</small></span>
          <button className="ix-signout" type="button"><LogOut size={16} /><span>Sign out</span></button>
        </div>
      </header>
      <main className="ix-mini-app ix-mini-app-qb-chem">
        <header className="ix-mini-app-heading">
          <span className="eyebrow">IROBOTX / MINI APPS</span>
          <h1>QB Chem</h1>
          <p>Chemical products, recipes and production runs, synced live with QuickBooks.</p>
        </header>
        <QbChemApp client={client} initialSection={section} />
      </main>
    </div>
  </React.StrictMode>,
);
