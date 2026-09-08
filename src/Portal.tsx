import { useEffect, useState, type FormEvent } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import {
  ArrowLeft,
  ArrowUpRight,
  LayoutGrid,
  UserRound,
  UsersRound,
  Mail,
  LogOut,
  LockKeyhole,
  Search,
  RefreshCw,
} from "lucide-react";
import { auth, verifyBrowser } from "./firebaseClient";
import { api, errorMessage, type Profile, type AppId } from "./api";
import { ContactForm, Link, Logo, navigate } from "./App";
import { demos } from "./content";
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
      verifyBrowser().then(() => verifyPasswordResetCode(auth, code))
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
        <div className="orbital" />
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
function Account({
  profile,
  onUpdate,
}: {
  profile: Profile;
  onUpdate: (p: Profile) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      onUpdate(
        await api.updateProfile({
          name: String(data.get("name")),
          company: String(data.get("company")),
        }),
      );
      setMessage("Your account has been updated.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-grid">
      <form className="panel" onSubmit={save}>
        <h2>Account details</h2>
        <p>The details associated with your workspace.</p>
        <label>
          Full name
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={profile.name}
          />
        </label>
        <label>
          Company
          <input
            name="company"
            maxLength={120}
            defaultValue={profile.company}
          />
        </label>
        <label>
          Email address
          <input value={profile.email} readOnly />
        </label>
        <p className="form-note">
          Contact the team if your email address needs to change.
        </p>
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {message && (
          <div role="status" className="alert">
            {message}
          </div>
        )}
      </form>
      <div className="panel">
        <LockKeyhole className="blue-icon" />
        <h2>Account security</h2>
        <p>We’ll email a secure link to change your password.</p>
        <Link to="/forgot-password" className="small-button">
          Reset password <ArrowUpRight size={15} />
        </Link>
        <hr />
        <span className="eyebrow">Your access</span>
        <p>
          {profile.role === "admin" ? "Administrator" : "Member"} · Active
          account
        </p>
        <p className="form-note">
          Application access is managed by an iRobotX administrator.
        </p>
      </div>
    </div>
  );
}
function Admin() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  async function refresh() {
    try {
      setUsers(await api.listUsers());
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  useEffect(() => {
    void api
      .listUsers()
      .then(setUsers)
      .catch((e) => setMessage(errorMessage(e)));
  }, []);
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const result = await api.invite({
        email: String(data.get("email")),
        name: String(data.get("name")),
        apps: data.getAll("apps") as AppId[],
      });
      setMessage(
        result.delivery === "sent"
          ? "Invitation sent."
          : "Account created; invitation email is not yet delivered. Use Resend after checking email setup.",
      );
      form.reset();
      await refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      await api.updateUser({
        uid: selected.uid,
        status: data.get("status") as "active" | "disabled",
        apps: data.getAll("apps") as AppId[],
      });
      setSelected(null);
      setMessage("Access updated.");
      await refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-heading">
        <p>Invite people and manage access to the iRobotX workspace.</p>
        <button className="small-button" onClick={refresh}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {message && (
        <div role="status" className="alert">
          {message}
        </div>
      )}
      <div className="admin-grid">
        <div className="panel">
          <label className="search-label">
            <Search size={17} />
            <input
              aria-label="Search users"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="user-list">
            {users
              .filter((u) =>
                `${u.email} ${u.name}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((u) => (
                <article className="user-row" key={u.uid}>
                  <div className="avatar">
                    {(u.name || u.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="user-info">
                    <strong>{u.name || "Invited user"}</strong>
                    <span>{u.email}</span>
                    <small>
                      {u.role} · {u.status}
                      {u.invitationDelivery
                        ? ` · email ${u.invitationDelivery}`
                        : ""}
                    </small>
                  </div>
                  <div className="user-actions">
                    <button
                      className="small-button"
                      onClick={() => setSelected(u)}
                    >
                      Manage
                    </button>
                    {u.status === "invited" && (
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const r = await api.resend(u.uid);
                            setMessage(
                              r.delivery === "sent"
                                ? "Invitation sent."
                                : "Email delivery failed. Please check sender configuration.",
                            );
                            await refresh();
                          } catch (e) {
                            setMessage(errorMessage(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Resend
                      </button>
                    )}
                  </div>
                </article>
              ))}
            {users.length === 0 && <p>No users to display.</p>}
          </div>
        </div>
        <form
          className="panel"
          onSubmit={selected ? save : invite}
          key={selected?.uid || "invite"}
        >
          <h2>{selected ? "Manage access" : "Invite a teammate"}</h2>
          {selected ? (
            <>
              <p>{selected.email}</p>
              <label>
                Account status
                <select
                  name="status"
                  defaultValue={
                    selected.status === "disabled" ? "disabled" : "active"
                  }
                >
                  <option value="active">
                    {selected.status === "invited"
                      ? "Keep invitation active"
                      : "Active"}
                  </option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Full name
                <input name="name" required maxLength={100} />
              </label>
              <label>
                Email address
                <input name="email" type="email" required maxLength={254} />
              </label>
            </>
          )}
          <fieldset>
            <legend>Application assignments</legend>
            <p className="form-note">
              These applications are coming soon. Assignments reserve future
              access.
            </p>
            {demos.map((d) => (
              <label className="checkbox" key={d.id}>
                <input
                  type="checkbox"
                  name="apps"
                  value={d.id}
                  defaultChecked={selected?.apps.includes(d.id)}
                />
                {d.name}
              </label>
            ))}
          </fieldset>
          <button className="button" disabled={busy}>
            {busy ? "Working…" : selected ? "Save access" : "Send invitation"}
            <ArrowUpRight size={16} />
          </button>
          {selected && (
            <button
              type="button"
              className="text-button"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          )}
        </form>
      </div>
    </>
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
  const page =
    path === "/portal/account"
      ? "account"
      : path === "/portal/contact"
        ? "contact"
        : path === "/portal/admin"
          ? "admin"
          : "apps";
  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <Link to="/" aria-label="iRobotX home">
          <Logo />
        </Link>
        <span className="eyebrow">Client workspace</span>
        <nav aria-label="Workspace navigation">
          <Link to="/portal" className={page === "apps" ? "active" : ""}>
            <LayoutGrid size={18} /> Your apps
          </Link>
          <Link
            to="/portal/account"
            className={page === "account" ? "active" : ""}
          >
            <UserRound size={18} /> Account
          </Link>
          <Link
            to="/portal/contact"
            className={page === "contact" ? "active" : ""}
          >
            <Mail size={18} /> Contact team
          </Link>
          {profile.role === "admin" && (
            <Link
              to="/portal/admin"
              className={page === "admin" ? "active" : ""}
            >
              <UsersRound size={18} /> User access
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span>{profile.email}</span>
          <button
            onClick={async () => {
              await signOut(auth);
              navigate("/signin");
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="portal-main">
        <div className="portal-topline">
          <span>
            <i className="signal" /> iRobotX / WORKSPACE
          </span>
          <span className="badge">
            {profile.role === "admin" ? "Administrator" : "Member"}
          </span>
        </div>
        <header className="portal-title">
          <span className="eyebrow">
            {page === "apps"
              ? "Your connected workspace"
              : "Workspace / " + page}
          </span>
          <h1>
            {page === "apps"
              ? `Welcome, ${profile.name.split(" ")[0] || "there"}.`
              : page === "account"
                ? "Your account."
                : page === "contact"
                  ? "Let’s talk."
                  : "User access."}
          </h1>
          {page === "apps" && (
            <p>Your applications, account, and team—all in one place.</p>
          )}
        </header>
        {page === "account" ? (
          <Account profile={profile} onUpdate={setProfile} />
        ) : page === "contact" ? (
          <ContactForm prefill={profile} />
        ) : page === "admin" ? (
          profile.role === "admin" ? (
            <Admin />
          ) : (
            <div className="alert error">Administrator access is required.</div>
          )
        ) : (
          <>
            <div className="portal-apps">
              {[
                {
                  name: "Account",
                  text: "Keep your personal and company details up to date.",
                  to: "/portal/account",
                  icon: <UserRound />,
                },
                {
                  name: "Contact team",
                  text: "Have a question or an idea? Get in touch with us.",
                  to: "/portal/contact",
                  icon: <Mail />,
                },
                ...(profile.role === "admin"
                  ? [
                      {
                        name: "User access",
                        text: "Invite teammates and manage application assignments.",
                        to: "/portal/admin",
                        icon: <UsersRound />,
                      },
                    ]
                  : []),
              ].map((app) => (
                <Link to={app.to} className="panel app-card" key={app.name}>
                  <div className="app-icon">{app.icon}</div>
                  <span className="badge">Available</span>
                  <h2>{app.name}</h2>
                  <p>{app.text}</p>
                  <span className="text-link">
                    Open application <ArrowUpRight size={17} />
                  </span>
                </Link>
              ))}
            </div>
            <div className="section-heading portal-section-heading">
              <h2>On the horizon.</h2>
              <span>More tools. New possibilities.</span>
            </div>
            <div className="portal-apps">
              {demos.map((d) => (
                <article className="panel app-card coming-soon" key={d.id}>
                  <span className="eyebrow">{d.category}</span>
                  <h2>{d.name}</h2>
                  <p>{d.text}</p>
                  <span className="badge muted">
                    Coming soon
                    {profile.apps.includes(d.id) ? " · Access assigned" : ""}
                  </span>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
