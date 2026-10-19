import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { ArrowLeft, ArrowUpRight, LogOut, LockKeyhole } from "lucide-react";
import { auth, verifyBrowser } from "./firebaseClient";
import { api, errorMessage, type Profile } from "./api";
import { Link, Logo, Mark, navigate } from "./App";
import { MINI_APPS, visibleMiniApps, canOpenApp } from "./portal/miniApps";
import "./portal/portal.css";
const Account = lazy(() => import("./mini-apps/account/AccountApp"));
const Admin = lazy(() => import("./mini-apps/user-access/UserAccessApp"));
const ContactTeam = lazy(
  () => import("./mini-apps/contact-team/ContactTeamApp"),
);
const Trading = lazy(() => import("./mini-apps/trading/TradingApp"));
const QbChem = lazy(() => import("./mini-apps/qb-chem/index"));
function AuthPage({ path }: { path: string }) {
  const action = path === "/accept-invite" || path === "/auth/action";
  const reset = path === "/forgot-password";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState("");
  const code = new URLSearchParams(location.search).get("oobCode") || "";
  useEffect(() => {
    if (action) {
      verifyBrowser()
        .then(() => verifyPasswordResetCode(auth, code))
        .then((email) => {
          setEmail(email);
          setValid(true);
        })
        .catch((e) => setError(errorMessage(e)));
    }
  }, [action, code]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await verifyBrowser();
      if (reset) {
        await api.reset(String(data.get("email")));
        setMessage(
          "If this email has an invited account, password instructions are on their way.",
        );
      } else if (action) {
        const password = String(data.get("password"));
        if (password !== data.get("confirm")) {
          setError("The passwords do not match.");
          return;
        }
        await confirmPasswordReset(auth, code, password);
        await signInWithEmailAndPassword(auth, email, password);
        await api.profile();
        navigate("/portal");
      } else {
        await signInWithEmailAndPassword(
          auth,
          String(data.get("email")),
          String(data.get("password")),
        );
        await api.profile();
        navigate("/portal");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Link to="/" className="auth-home">
        <ArrowLeft size={16} /> Back to iRobotX
      </Link>
      <div className="auth-decoration">
        <Mark className="auth-brand-mark" />
        <span>
          CONNECTED THINKING.
          <br />
          SHARED POSSIBILITIES.
        </span>
      </div>
      <form className="auth-card panel" onSubmit={submit}>
        <Logo />
        <span className="eyebrow">Your iRobotX workspace</span>
        <h1>
          {action
            ? "Make it yours."
            : reset
              ? "A fresh start."
              : "Welcome back."}
        </h1>
        <p>
          {action
            ? "Set a password to access your invited account."
            : reset
              ? "Enter your email and we’ll help you reset your password."
              : "Sign in to your account to access your assigned applications."}
        </p>
        {action && valid && <p className="badge">{email}</p>}
        {!action && (
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
        )}
        {!reset && (!action || valid) && (
          <label>
            {action ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              required
              minLength={action ? 6 : undefined}
              autoComplete={action ? "new-password" : "current-password"}
              placeholder={action ? "At least 6 characters" : "Your password"}
            />
          </label>
        )}
        {action && valid && (
          <label>
            Confirm password
            <input
              name="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="alert success" role="status">
            {message}
          </div>
        )}
        {(!action || valid) && (
          <button className="button" disabled={busy}>
            {busy
              ? "Please wait…"
              : action
                ? "Set password & continue"
                : reset
                  ? "Send reset instructions"
                  : "Sign in"}
            <ArrowUpRight size={18} />
          </button>
        )}
        <div className="auth-links">
          {!reset ? (
            <Link to="/forgot-password">
              {action ? "Request a new link" : "Forgot password?"}
            </Link>
          ) : (
            <Link to="/signin">Return to sign in</Link>
          )}
        </div>
        <div className="auth-note">
          <LockKeyhole size={16} />
          <p>
            Access is by invitation.
            <br />
            Need an account? <Link to="/contact">Contact our team.</Link>
          </p>
        </div>
      </form>
    </main>
  );
}
export default function Portal({ path }: { path: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isPortal = path.startsWith("/portal");
  useEffect(() => {
    if (!isPortal) return;
    let active = true;
    const load = async () => {
      if (!auth.currentUser) {
        if (active) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      try {
        const p = await api.profile();
        if (active) {
          setProfile(p);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(errorMessage(e));
          setProfile(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, () => {
      void load();
    });
    const interval = setInterval(() => {
      void load();
    }, 30000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, [isPortal]);
  if (!isPortal) return <AuthPage path={path} />;
  if (loading)
    return <main className="route-loading">Opening your workspace…</main>;
  if (!profile)
    return (
      <main className="auth-page">
        <div className="auth-card panel">
          <Logo />
          <h1>Workspace access</h1>
          <p>{error || "Sign in to access your iRobotX workspace."}</p>
          <Link to="/signin" className="button">
            Go to sign in
          </Link>
          <Link to="/contact" className="text-link">
            Contact the team
          </Link>
        </div>
      </main>
    );
  const launcher = path === "/portal";
  const app = MINI_APPS.find((item) => item.path === path);
  const permitted = app && canOpenApp(profile, app.id);
  return (
    <div
      className={`ix-portal ${launcher ? "ix-launcher-shell" : "ix-app-shell"}`}
    >
      <header className="ix-portal-header">
        <div className="ix-portal-start">
          {!launcher && (
            <Link to="/portal" className="ix-back">
              <ArrowLeft size={17} />
              <span>Back to mini apps</span>
            </Link>
          )}
          <Link
            to="/portal"
            aria-label="iRobotX mini apps"
            className="ix-portal-logo"
          >
            <Logo />
          </Link>
        </div>
        <div className="ix-portal-user">
          <span>
            {profile.name || profile.email}
            <small>{profile.email}</small>
          </span>
          <button
            className="ix-signout"
            onClick={async () => {
              await signOut(auth);
              navigate("/signin");
            }}
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      {launcher ? (
        <main className="ix-launcher">
          <div className="ix-launcher-heading">
            <Mark className="ix-launcher-mark" />
            <span className="eyebrow">YOUR IROBOTX WORKSPACE</span>
            <h1>
              Your tools.
              <br />
              <em>Connected.</em>
            </h1>
            <p>
              Welcome back, {profile.name.split(" ")[0] || "there"}. Choose an
              app to get started.
            </p>
          </div>
          <section className="ix-app-grid" aria-label="Your mini apps">
            {visibleMiniApps(profile).map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`ix-app-tile ix-app-${item.id}`}
              >
                <span className="ix-app-symbol">
                  <item.icon size={38} strokeWidth={1.5} />
                </span>
                <div>
                  <h2>{item.label}</h2>
                  <p>{item.description}</p>
                </div>
                <ArrowUpRight className="ix-tile-arrow" size={19} />
                {item.id === "trading" && (
                  <span className="ix-app-tag">MAINNET</span>
                )}
              </Link>
            ))}
          </section>
          <p className="ix-launcher-footer">
            One workspace. Room for what’s next.
          </p>
        </main>
      ) : (
        <main className={`ix-mini-app ix-mini-app-${app?.id ?? "none"}`}>
          <header className="ix-mini-app-heading">
            <span className="eyebrow">IROBOTX / MINI APPS</span>
            <h1>{app?.label || "App not found"}</h1>
            <p>
              {app?.description ||
                "Return to your mini apps to choose an available tool."}
            </p>
          </header>
          {!permitted ? (
            <div className="panel">
              <h2>
                {app
                  ? "This app is not available to your account."
                  : "This address does not match a mini app."}
              </h2>
              <Link to="/portal" className="small-button">
                Back to mini apps
              </Link>
            </div>
          ) : (
            <Suspense
              fallback={
                <p className="ix-app-loading" role="status">
                  Opening {app.label}…
                </p>
              }
            >
              {app.id === "account" ? (
                <Account profile={profile} onUpdate={setProfile} />
              ) : app.id === "user-access" ? (
                <Admin />
              ) : app.id === "contact-team" ? (
                <ContactTeam profile={profile} />
              ) : app.id === "qb-chem" ? (
                <QbChem />
              ) : (
                <Trading />
              )}
            </Suspense>
          )}
        </main>
      )}
    </div>
  );
}
