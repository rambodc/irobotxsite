import { useEffect, useRef, useState, type FormEvent } from "react";
import { useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  Droplets,
  FileText,
  Gauge,
  Grid2X2,
  HardHat,
  LockKeyhole,
  MapPin,
  Plus,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Waves,
} from "lucide-react";
import {
  demoApps,
  demoCopy,
  initialUsers,
  sampleWells,
  sampleInvoices,
  sampleExpenses,
  sampleJobs,
  samplePeriods,
  sampleQuestions,
  fragmentApps,
  money,
  type DemoAppId,
  type DemoUser,
} from "./demoContent";
import "./demo.css";
const icons = {
  ai: Bot,
  wells: Droplets,
  drilling: HardHat,
  production: Gauge,
  invoices: FileText,
  accounting: Wallet,
  expenses: Receipt,
  tracking: MapPin,
  access: Users,
};
const canOpen = (user: DemoUser, id: DemoAppId) =>
  user.apps.includes(id) && (id !== "access" || user.role === "Manager");

function Hint({ text, seen }: { text: string; seen: boolean }) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(seen ? text.length : 0);
  useEffect(() => {
    if (reduce || count >= text.length) return;
    const timer = window.setInterval(
      () => setCount((n) => Math.min(n + 3, text.length)),
      22,
    );
    return () => clearInterval(timer);
  }, [reduce, count, text.length]);
  const done = reduce || count >= text.length;
  return (
    <aside className="demo-hint">
      <Sparkles size={18} aria-hidden="true" />
      <div>
        <span className="demo-small-label">Imagine your platform</span>
        <p className="demo-hint-text">
          <span className="demo-sr">{text}</span>
          <span aria-hidden="true">
            {done ? text : text.slice(0, count)}
            {!done && <span className="demo-cursor">▍</span>}
          </span>
        </p>
        <button type="button" onClick={() => setCount(done ? 0 : text.length)}>
          {done ? "Replay hint" : "Show all"}
        </button>
      </div>
    </aside>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="demo-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Tag({ children }: { children: string }) {
  return <span className="demo-tag">{children}</span>;
}

function Operations({ app }: { app: "wells" | "drilling" | "production" }) {
  const [wellId, setWellId] = useState("cedar");
  const [period, setPeriod] = useState("7");
  const well = sampleWells.find((w) => w.id === wellId)!;
  const volumes = period === "7" ? well.volumes : well.volumes.slice(-3);
  return (
    <>
      <div className="demo-filterbar">
        <label>
          Sample well
          <select value={wellId} onChange={(e) => setWellId(e.target.value)}>
            {sampleWells.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {app === "production" && (
          <label>
            Reporting period
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="7">Last 7 sample days</option>
              <option value="3">Last 3 sample days</option>
            </select>
          </label>
        )}
      </div>
      <div className="demo-section-title">
        <div>
          <span className="demo-small-label">{well.area}</span>
          <h3>{well.name}</h3>
        </div>
        <Tag>{well.status}</Tag>
      </div>
      {app === "wells" && (
        <div className="demo-two-col">
          <div>
            <div className="demo-stats">
              <Stat label="Recorded depth" value={well.depth} />
              <Stat label="Assigned contact" value={well.owner} />
            </div>
            <p>{well.summary}</p>
            <h4>Related field activity</h4>
            {sampleJobs
              .filter((j) => j.well === well.name)
              .map((j) => (
                <div className="demo-record" key={j.id}>
                  <strong>{j.title}</strong>
                  <span>{j.assignee}</span>
                  <Tag>{j.status}</Tag>
                </div>
              ))}
          </div>
          <figure className="demo-well-art">
            <img
              src="/images/well-640.webp"
              alt="Illustrative blue well and downhole cutaway"
              width="640"
              height="427"
              loading="lazy"
            />
            <figcaption>
              Illustrative cutaway · Not an engineering diagram
            </figcaption>
          </figure>
        </div>
      )}
      {app === "drilling" && (
        <div className="demo-two-col">
          <ol className="demo-timeline">
            {well.drilling.map((step, i) => (
              <li key={step}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{step}</strong>
                  <small>
                    {i === 3 && well.id === "aspen"
                      ? "Next milestone"
                      : "Sample project record"}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <div className="demo-detail">
            <span className="demo-small-label">Daily report · Sample</span>
            <h4>From field to office.</h4>
            <p>{well.report}</p>
            <Stat label="Recorded depth" value={well.depth} />
            <p className="demo-note">
              A tailored version could connect reports, contractor updates,
              documents, and approvals.
            </p>
          </div>
        </div>
      )}
      {app === "production" && (
        <>
          <div className="demo-stats">
            <Stat
              label="Sample oil volume"
              value={`${volumes.reduce((a, b) => a + b, 0)} m³`}
            />
            <Stat
              label="Daily average"
              value={`${(volumes.reduce((a, b) => a + b, 0) / volumes.length).toFixed(1)} m³`}
            />
            <Stat label="Period" value={`${volumes.length} sample days`} />
          </div>
          <div
            className="demo-chart"
            aria-label="Sample daily production in cubic metres"
          >
            {volumes.map((v, i) => (
              <div className="demo-bar-column" key={i}>
                <span>{v} m³</span>
                <div className="demo-bar-track">
                  <div style={{ height: `${(v / 130) * 100}%` }} />
                </div>
                <small>
                  Day {String((period === "7" ? 1 : 5) + i).padStart(2, "0")}
                </small>
              </div>
            ))}
          </div>
          <p className="demo-note">
            Fictional daily values. A real application would display updates
            from your connected data sources.
          </p>
        </>
      )}
    </>
  );
}
function AIExample() {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="demo-two-col">
      <div>
        <span className="demo-small-label">Try a sample question</span>
        <div className="demo-questions">
          {sampleQuestions.map((q, i) => (
            <button
              key={q.question}
              className={selected === i ? "selected" : ""}
              onClick={() => setSelected(i)}
            >
              {q.question}
              <ArrowUpRight size={18} />
            </button>
          ))}
        </div>
        <p className="demo-note">
          Your tools. Your data. Your workflows. The real platform can integrate
          the AI models your organization selects.
        </p>
      </div>
      <div className="demo-ai-answer" aria-live="polite">
        <div className="demo-ai-symbol">
          <Bot size={30} />
        </div>
        <span className="demo-small-label">
          Prewritten example · Not live AI
        </span>
        <h4>
          {selected === null
            ? "Answers with operational context."
            : sampleQuestions[selected].question}
        </h4>
        <p>
          {selected === null
            ? "Choose a question to see how an assistant could connect information across your organization."
            : sampleQuestions[selected].answer}
        </p>
        {selected !== null && (
          <div className="demo-source">
            <FileText size={16} />
            {sampleQuestions[selected].sources}
          </div>
        )}
      </div>
    </div>
  );
}
function Invoices() {
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = sampleInvoices.filter(
    (r) => filter === "All" || r.status === filter,
  );
  const invoice = rows.find((r) => r.id === selected);
  return (
    <>
      <div className="demo-filterbar">
        <label>
          Invoice status
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          >
            {["All", "Awaiting review", "Approved", "Paid"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="demo-note">All amounts in CAD</span>
      </div>
      <div className="demo-two-col">
        <div className="demo-records">
          {rows.map((row) => (
            <button
              className={`demo-record-button ${selected === row.id ? "selected" : ""}`}
              key={row.id}
              onClick={() => setSelected(row.id)}
            >
              <span>
                <small>{row.id}</small>
                <strong>{row.supplier}</strong>
                <span>{row.well}</span>
              </span>
              <span>
                <strong>{money(row.amount)}</strong>
                <Tag>{row.status}</Tag>
              </span>
            </button>
          ))}
        </div>
        <div className="demo-detail">
          <FileText size={25} />
          <h4>{invoice ? invoice.id : "The context behind the invoice."}</h4>
          <p>
            {invoice
              ? invoice.detail
              : "Open a sample invoice to see its supplier, related well, and review status."}
          </p>
          {invoice && (
            <>
              <Stat label="Supplier" value={invoice.supplier} />
              <Stat label="Related well" value={invoice.well} />
              <Stat label="Total · CAD" value={money(invoice.amount)} />
              <Tag>{invoice.status}</Tag>
            </>
          )}
        </div>
      </div>
    </>
  );
}
function Accounting() {
  const [index, setIndex] = useState(0);
  const period = samplePeriods[index];
  const total = period.costs.reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="demo-filterbar">
        <label>
          Reporting period
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {samplePeriods.map((p, i) => (
              <option value={i} key={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="demo-note">Fictional management summary · CAD</span>
      </div>
      <div className="demo-stats">
        <Stat label="Sample income" value={money(period.income)} />
        <Stat label="Sample costs" value={money(total)} />
        <Stat label="Income less costs" value={money(period.income - total)} />
      </div>
      <div className="demo-detail">
        <h4>Where the costs sit.</h4>
        {["Field services", "People & travel", "Equipment"].map((name, i) => (
          <div className="demo-cost" key={name}>
            <div>
              <span>{name}</span>
              <strong>{money(period.costs[i])}</strong>
            </div>
            <div className="demo-meter">
              <span style={{ width: `${(period.costs[i] / total) * 100}%` }} />
            </div>
          </div>
        ))}
        <p className="demo-note">
          Illustrative period totals, not a ledger or tax report. Invoice
          examples show only a subset of activity.
        </p>
      </div>
    </>
  );
}
function Expenses({
  manager,
  approved,
  approve,
}: {
  manager: boolean;
  approved: string[];
  approve: (id: string) => void;
}) {
  const [id, setId] = useState(sampleExpenses[0].id);
  const expense = sampleExpenses.find((e) => e.id === id)!;
  return (
    <div className="demo-two-col">
      <div className="demo-records">
        {sampleExpenses.map((e) => (
          <button
            className={`demo-record-button ${id === e.id ? "selected" : ""}`}
            key={e.id}
            onClick={() => setId(e.id)}
          >
            <span>
              <small>
                {e.id} · {e.person}
              </small>
              <strong>{e.category}</strong>
            </span>
            <span>
              <strong>{money(e.amount)}</strong>
              <Tag>{approved.includes(e.id) ? "Approved" : e.status}</Tag>
            </span>
          </button>
        ))}
      </div>
      <div className="demo-detail">
        <span className="demo-small-label">Expense details</span>
        <h4>{expense.category}</h4>
        <p>{expense.detail}</p>
        <Stat label="Related well" value={expense.well} />
        <Stat label="Amount · CAD" value={money(expense.amount)} />
        {approved.includes(id) ? (
          <p className="demo-success" role="status">
            <Check size={18} /> Approved in this demo
          </p>
        ) : manager ? (
          <button className="demo-primary" onClick={() => approve(id)}>
            <Check size={17} />
            Approve sample expense
          </button>
        ) : (
          <p className="demo-note">
            <LockKeyhole size={14} /> Manager approval required. Use the demo
            perspective control to explore that role.
          </p>
        )}
      </div>
    </div>
  );
}
function Tracking() {
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = sampleJobs.filter(
    (j) => filter === "All" || j.status === filter,
  );
  const job = rows.find((j) => j.id === selected);
  return (
    <>
      <div className="demo-filterbar">
        <label>
          Job status
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          >
            {["All", "Scheduled", "In progress", "Complete"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="demo-two-col">
        <div className="demo-records">
          {rows.map((j) => (
            <button
              key={j.id}
              className={`demo-record-button ${selected === j.id ? "selected" : ""}`}
              onClick={() => setSelected(j.id)}
            >
              <span>
                <small>
                  {j.id} · {j.well}
                </small>
                <strong>{j.title}</strong>
                <span>{j.assignee}</span>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <div className="demo-detail">
          <MapPin size={25} />
          <h4>{job ? job.title : "Every job has a shared context."}</h4>
          <p>
            {job
              ? job.detail
              : "Select a field job to see the people, service company, and well connected to it."}
          </p>
          {job && (
            <>
              <Stat label="Assigned to" value={job.assignee} />
              <Stat label="Related well" value={job.well} />
              <Tag>{job.status}</Tag>
            </>
          )}
        </div>
      </div>
    </>
  );
}
function Access({
  users,
  update,
  viewAs,
  invite,
}: {
  users: DemoUser[];
  update: (id: string, app: DemoAppId, enabled: boolean) => void;
  viewAs: (id: string) => void;
  invite: (user: DemoUser) => void;
}) {
  const [selected, setSelected] = useState("staff");
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("Taylor Brooks");
  const [email, setEmail] = useState("taylor@northstar.example");
  const [role, setRole] = useState<"Staff" | "Contractor">("Staff");
  const [apps, setApps] = useState<DemoAppId[]>(["wells", "tracking"]);
  const [created, setCreated] = useState<string | null>(null);
  const person = users.find((u) => u.id === selected) || users[1];
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = crypto.randomUUID();
    invite({
      id,
      name: name.trim(),
      email: email.trim(),
      role,
      apps: apps.filter((a) => a !== "access"),
      invited: true,
    });
    setSelected(id);
    setCreated(id);
    setInviting(false);
  }
  return (
    <>
      <div className="demo-section-title">
        <div>
          <span className="demo-small-label">Your sample organization</span>
          <h3>People & permissions</h3>
        </div>
        <button
          className="demo-primary"
          onClick={() => {
            setInviting(!inviting);
            setCreated(null);
          }}
        >
          <Plus size={17} />
          {inviting ? "Close invitation" : "Invite sample user"}
        </button>
      </div>
      {created && (
        <div className="demo-invited" role="status">
          <div>
            <Check size={18} />
            <span>Demo invitation created—no email sent.</span>
          </div>
          <button onClick={() => viewAs(created)}>
            View as this user <ArrowUpRight size={16} />
          </button>
        </div>
      )}
      {inviting && (
        <form className="demo-invite demo-detail" onSubmit={submit}>
          <h4>Create a fictional invitation</h4>
          <p className="demo-note">
            Use sample details only. Nothing is sent or saved outside this demo.
          </p>
          <div className="demo-form-grid">
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <label>
              Sample email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={150}
              />
            </label>
            <label>
              Role
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "Staff" | "Contractor")
                }
              >
                <option>Staff</option>
                <option>Contractor</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Apps available after invitation</legend>
            <div className="demo-permissions">
              {demoApps
                .filter((a) => a.id !== "access")
                .map((a) => (
                  <label key={a.id}>
                    <input
                      type="checkbox"
                      checked={apps.includes(a.id)}
                      onChange={(e) =>
                        setApps((old) =>
                          e.target.checked
                            ? [...old, a.id]
                            : old.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name}
                  </label>
                ))}
            </div>
          </fieldset>
          <button className="demo-primary" type="submit">
            Create demo invitation <ArrowUpRight size={17} />
          </button>
        </form>
      )}
      <div className="demo-two-col">
        <div className="demo-records">
          {users.map((u) => (
            <button
              key={u.id}
              className={`demo-person ${person.id === u.id ? "selected" : ""}`}
              onClick={() => setSelected(u.id)}
            >
              <span className="demo-avatar">
                {u.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{u.name}</strong>
                <small>
                  {u.role}
                  {u.invited ? " · Demo invitation" : ""}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
        <div className="demo-detail">
          <div className="demo-section-title">
            <div>
              <h4>{person.name}</h4>
              <p className="demo-note">{person.email}</p>
            </div>
            <Tag>{person.role}</Tag>
          </div>
          <fieldset>
            <legend>Visible mini apps</legend>
            <div className="demo-permissions">
              {demoApps.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={canOpen(person, a.id)}
                    disabled={person.role === "Manager" || a.id === "access"}
                    onChange={(e) => update(person.id, a.id, e.target.checked)}
                  />
                  {a.name}
                  {a.id === "access" && (
                    <span className="demo-note">Manager only</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="demo-note">
            {person.role === "Manager"
              ? "The sample manager retains all apps and permission controls."
              : "Changes apply immediately. View this person’s workspace to see their updated launcher."}
          </p>
          <button className="demo-primary" onClick={() => viewAs(person.id)}>
            View as this user <ArrowUpRight size={17} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function DemoWorkspace() {
  const [entered, setEntered] = useState(false);
  const [users, setUsers] = useState<DemoUser[]>(() =>
    structuredClone(initialUsers),
  );
  const [userId, setUserId] = useState("manager");
  const [active, setActive] = useState<DemoAppId | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const seen = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const user = users.find((u) => u.id === userId) || users[0];
  const appId = active && canOpen(user, active) ? active : null;
  const app = demoApps.find((a) => a.id === appId);
  const hintKey = entered ? appId || "launcher" : "entry";
  const hintSeen = seen.current.has(hintKey);
  useEffect(() => {
    seen.current.add(hintKey);
  }, [hintKey]);
  useEffect(() => {
    if (entered) heading.current?.focus();
  }, [entered, appId, userId]);
  useEffect(() => {
    const handle = () => {
      const target = fragmentApps[location.hash];
      if (entered && target && canOpen(user, target)) setActive(target);
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, [entered, user]);
  function viewAs(id: string) {
    setUserId(id);
    setActive(null);
  }
  function update(id: string, target: DemoAppId, enabled: boolean) {
    if (user.role !== "Manager" || target === "access") return;
    setUsers((old) =>
      old.map((u) =>
        u.id !== id || u.role === "Manager"
          ? u
          : {
              ...u,
              apps: enabled
                ? [...new Set([...u.apps, target])]
                : u.apps.filter((a) => a !== target),
            },
      ),
    );
    if (id === userId && active === target && !enabled) setActive(null);
  }
  function reset() {
    setUsers(structuredClone(initialUsers));
    setUserId("manager");
    setActive(null);
    setApproved([]);
    seen.current.clear();
    setResetKey((k) => k + 1);
    setEntered(false);
    history.replaceState({}, "", "/demo");
  }
  const Icon = app ? icons[app.id] : Grid2X2;
  return (
    <div className="demo-page">
      <div className="demo-page-intro">
        <span className="eyebrow">
          <span className="signal" />A platform built around you
        </span>
        <h1>
          Your company.
          <br />
          <em>At your fingertips.</em>
        </h1>
        <p>
          One sign-in. A world of possibilities. Explore how your people,
          operations, and tools could come together.
        </p>
      </div>
      <section
        className={`demo-shell ${entered ? "demo-entered" : ""}`}
        aria-label="Interactive company workspace demo"
      >
        <div className="demo-shell-top">
          <span>
            <span className="signal" />
            Demo · Sample data
          </span>
          <button onClick={reset}>
            <RotateCcw size={14} />
            Reset demo
          </button>
        </div>
        {!entered ? (
          <div className="demo-entry" key={resetKey}>
            <div className="demo-entry-story">
              <div className="demo-company-icon">
                <Waves size={32} />
              </div>
              <span className="demo-small-label">
                {demoCopy.company} · Fictional company
              </span>
              <h2>{demoCopy.intro}</h2>
              <div className="demo-entry-icons" aria-hidden="true">
                {[Droplets, Bot, Users, Gauge].map((EntryIcon, i) => (
                  <span key={i}>
                    <EntryIcon />
                  </span>
                ))}
              </div>
              <Hint
                key={`${resetKey}-entry`}
                text={demoCopy.entryHint}
                seen={hintSeen}
              />
            </div>
            <form
              className="demo-signin"
              onSubmit={(e) => {
                e.preventDefault();
                setEntered(true);
                setActive(fragmentApps[location.hash] || null);
              }}
            >
              <div className="demo-lock">
                <LockKeyhole size={23} />
              </div>
              <h3>Welcome to your workspace.</h3>
              <p>Your tools. Your team. All in one place.</p>
              <label>
                Sample email
                <input
                  value="alex@northstar.example"
                  readOnly
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
              <label>
                Sample password
                <input
                  value="••••••••••••"
                  readOnly
                  tabIndex={-1}
                  autoComplete="off"
                  aria-describedby="demo-login-note"
                />
              </label>
              <button className="demo-primary" type="submit">
                Sign into demo <ArrowUpRight size={18} />
              </button>
              <p id="demo-login-note" className="demo-note">
                <ShieldCheck size={15} />
                Pretend sign-in only. No credentials are submitted.
              </p>
              <a href="/signin" className="demo-real-signin">
                Already a client? Real client sign in <ArrowUpRight size={14} />
              </a>
            </form>
          </div>
        ) : (
          <div className="demo-workspace" key={resetKey}>
            <div className="demo-workspace-bar">
              <div className="demo-company">
                <span className="demo-company-icon">
                  <Waves size={22} />
                </span>
                <span>
                  <strong>{demoCopy.company}</strong>
                  <small>Fictional company workspace</small>
                </span>
              </div>
              <label className="demo-perspective">
                Demo control · View as
                <select value={userId} onChange={(e) => viewAs(e.target.value)}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="demo-perspective-note">
              Perspective switching is for this demo. Real users would only
              access their own authorized workspace.
            </p>
            <div className="demo-app-heading">
              {app && (
                <button className="demo-back" onClick={() => setActive(null)}>
                  <ArrowLeft size={16} />
                  Back to apps
                </button>
              )}
              <div className="demo-section-title">
                <div>
                  <span className="demo-small-label">
                    {app ? app.category : `Welcome, ${user.name.split(" ")[0]}`}
                  </span>
                  <h2 ref={heading} tabIndex={-1}>
                    {app ? app.name : "Your workspace."}
                  </h2>
                </div>
                <span className={`demo-app-symbol ${app?.color || "blue"}`}>
                  <Icon size={25} />
                </span>
              </div>
              <Hint
                key={`${resetKey}-${hintKey}`}
                text={app?.hint || demoCopy.launcherHint}
                seen={hintSeen}
              />
            </div>
            {!app ? (
              <>
                <div className="demo-launcher">
                  {demoApps
                    .filter((a) => canOpen(user, a.id))
                    .map((a) => {
                      const AppIcon = icons[a.id];
                      return (
                        <button
                          key={a.id}
                          className="demo-app-tile"
                          onClick={() => {
                            if (canOpen(user, a.id)) setActive(a.id);
                          }}
                        >
                          <span className={`demo-tile-icon ${a.color}`}>
                            <AppIcon size={32} strokeWidth={1.5} />
                            <span className="demo-tile-glint" />
                          </span>
                          <strong>{a.name}</strong>
                          <small>{a.category}</small>
                        </button>
                      );
                    })}
                </div>
                {user.apps.length === 0 && (
                  <div className="demo-detail">
                    <h3>No apps assigned yet.</h3>
                    <p>
                      Switch to the sample manager and open User Access to
                      assign this person’s tools.
                    </p>
                  </div>
                )}
                <div className="demo-launcher-foot">
                  <ShieldCheck size={17} />
                  <span>
                    {demoApps.filter((a) => canOpen(user, a.id)).length} apps
                    available to {user.name}. Your management team controls
                    access.
                  </span>
                </div>
              </>
            ) : null}
            {demoApps
              .filter((panel) => canOpen(user, panel.id))
              .map((panel) => (
                <div
                  className="demo-app-body"
                  hidden={appId !== panel.id}
                  key={`${userId}-${panel.id}`}
                >
                  {panel.id === "ai" && <AIExample />}
                  {(panel.id === "wells" ||
                    panel.id === "drilling" ||
                    panel.id === "production") && <Operations app={panel.id} />}
                  {panel.id === "invoices" && <Invoices />}
                  {panel.id === "accounting" && <Accounting />}
                  {panel.id === "expenses" && (
                    <Expenses
                      manager={user.role === "Manager"}
                      approved={approved}
                      approve={(id) => {
                        if (user.role === "Manager")
                          setApproved((old) => [...new Set([...old, id])]);
                      }}
                    />
                  )}
                  {panel.id === "tracking" && <Tracking />}
                  {panel.id === "access" && user.role === "Manager" && (
                    <Access
                      users={users}
                      update={update}
                      viewAs={viewAs}
                      invite={(newUser) => {
                        if (user.role === "Manager")
                          setUsers((old) => [...old, newUser]);
                      }}
                    />
                  )}
                </div>
              ))}
          </div>
        )}
        <div className="demo-shell-bottom">
          <span>
            <LockKeyhole size={14} />
            {entered
              ? `${user.role} perspective · Changes reset on refresh`
              : "No real account needed"}
          </span>
          <a href="/contact">
            Discuss your project <ArrowUpRight size={16} />
          </a>
        </div>
      </section>
      <div className="demo-after">
        <p>{demoCopy.disclosure}</p>
        <div className="demo-future">
          <span>Beyond Oil & Gas</span>
          <span>
            Robotics <Tag>Coming soon</Tag>
          </span>
          <span>
            FinTech <Tag>Coming soon</Tag>
          </span>
        </div>
      </div>
    </div>
  );
}
