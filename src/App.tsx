import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, Menu, X } from "lucide-react";
import { company, metadata } from "./content";
import { api, errorMessage } from "./api";
import HomeExperience from "./home3d/HomeExperience";
import AboutPage from "./site/AboutPage";
import ContactPage from "./site/ContactPage";
const Portal = lazy(() => import("./Portal"));
const publicPaths = ["/", "/about", "/contact"];
export function Link({
  to,
  children,
  className = "",
  ...props
}: {
  to: string;
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <a
      href={to}
      className={className}
      {...props}
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && to.startsWith("/")) {
          e.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}
export function navigate(to: string) {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) return;
  history.pushState({}, "", url.pathname + url.search + url.hash);
  dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "instant" });
  if (url.hash)
    setTimeout(
      () =>
        document
          .getElementById(url.hash.slice(1))
          ?.scrollIntoView({ behavior: "instant" }),
      100,
    );
}
export function Mark({ className = "" }: { className?: string }) {
  return (
    <img
      className={`ix-mark ${className}`}
      src="/brand/ix-blue.svg"
      alt=""
      aria-hidden="true"
      width={80}
      height={64}
    />
  );
}
export function Logo({ showMark = true }: { showMark?: boolean } = {}) {
  return (
    <span className="logo">
      {showMark && <Mark />}
      <span>
        iRobot<strong>X</strong>
      </span>
    </span>
  );
}
export function Button({
  to = "/contact",
  children,
  className = "",
}: {
  to?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={`button ${className}`}>
      {children}
      <ArrowUpRight size={17} />
    </Link>
  );
}
function Header({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <header className="site-header">
      <Link to="/" aria-label="iRobotX home">
        <Logo showMark={false} />
      </Link>
      <nav className="nav-pill" aria-label="Main navigation">
        {[
          ["Home", "/"],
          ["About", "/about"],
          ["Contact", "/contact"],
        ].map(([label, to]) => (
          <Link
            key={to}
            to={to}
            aria-current={path === to ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Link to="/contact" className="header-cta">
        Start a project <ArrowUpRight size={16} />
      </Link>
      <button
        className="menu-button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      {open && (
        <nav
          id="mobile-nav"
          className="mobile-nav"
          aria-label="Mobile navigation"
        >
          {[
            ["Home", "/"],
            ["About", "/about"],
            ["Contact", "/contact"],
          ].map(([label, to]) => (
            <Link key={to} to={to}>
              {label}
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <div>
          <Link to="/">
            <Logo />
          </Link>
          <p>
            One system, every industry.
            <br />
            Robotics · FinTech · Oil &amp; Gas · Entertainment
          </p>
        </div>
        <div>
          <span className="eyebrow">Explore</span>
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </div>
        <div>
          <span className="eyebrow">Let’s connect</span>
          <a href={`mailto:${company.email}`}>
            {company.email}
            <ArrowUpRight size={14} />
          </a>
          <span>
            {company.location}, {company.country}
          </span>
          <Link to="/contact">
            Start a project <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} iRobotX. All rights reserved.</span>
        <span>
          <i className="signal" /> Technology with purpose.
        </span>
      </div>
    </footer>
  );
}
export function ContactForm({
  prefill,
  variant = "portal",
}: {
  prefill?: { name: string; email: string; company: string };
  variant?: "portal" | "site";
}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [failed, setFailed] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setResult("");
    try {
      const response = await api.contact({
        name: String(data.get("name")),
        email: String(data.get("email")),
        company: String(data.get("company")),
        industry: String(data.get("industry")),
        message: String(data.get("message")),
        website: String(data.get("website") || ""),
        requestId,
      });
      setFailed(response.delivery === "failed");
      setResult(
        response.delivery === "sent"
          ? "Your message has been sent. Thank you for getting in touch."
          : response.delivery === "pending"
            ? "Your message is being delivered. Please wait before trying again."
            : "Your message was saved, but the email could not be delivered. Please retry or email us directly.",
      );
      if (response.delivery === "sent") {
        form.reset();
        setRequestId(crypto.randomUUID());
        setSent(true);
      }
    } catch (error) {
      setFailed(true);
      setResult(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (sent && variant === "site")
    return (
      <div className="contact-form c-form c-sent" role="status">
        <span className="c-sent-icon" aria-hidden="true">
          <Check size={26} />
        </span>
        <h2>Message received.</h2>
        <p>{result}</p>
        <p>We reply within one business day from {company.email}.</p>
        <button
          type="button"
          className="c-again"
          onClick={() => {
            setSent(false);
            setResult("");
          }}
        >
          Send another message
        </button>
      </div>
    );
  return (
    <form
      className={variant === "site" ? "contact-form c-form" : "contact-form panel"}
      aria-busy={busy}
      onSubmit={submit}
      onChange={() => {
        if (failed) {
          setRequestId(crypto.randomUUID());
          setFailed(false);
          setResult("");
        }
      }}
    >
      {variant === "site" ? (
        <h2>Start a project</h2>
      ) : (
        <h3>Start a conversation.</h3>
      )}
      <div className="form-row">
        <label>
          Your name
          <input
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            defaultValue={prefill?.name}
            placeholder="Full name"
          />
        </label>
        <label>
          Email address
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            defaultValue={prefill?.email}
            placeholder="you@company.com"
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Company <span className="optional">(optional)</span>
          <input
            name="company"
            maxLength={120}
            autoComplete="organization"
            defaultValue={prefill?.company}
            placeholder="Organization"
          />
        </label>
        <label>
          Area of interest
          <select name="industry">
            <option>Oil & Gas</option>
            <option>Robotics</option>
            <option>FinTech</option>
            <option>General enquiry</option>
          </select>
        </label>
      </div>
      <label>
        Your message
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          placeholder="Tell us about the challenge, idea, or opportunity."
        />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p className="form-note">
        We use these details to respond to your enquiry.
      </p>
      {result && (
        <div
          role={failed ? "alert" : "status"}
          className={`alert ${failed ? "error" : "success"}`}
        >
          {result}
        </div>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Sending…" : failed ? "Retry sending" : "Send message"}
        <ArrowUpRight size={18} />
      </button>
    </form>
  );
}
export default function App() {
  const [path, setPath] = useState(location.pathname.replace(/\/$/, "") || "/");
  useEffect(() => {
    // The target does not exist until React has mounted the requested page.
    let id: string;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);
  useEffect(() => {
    const update = () => setPath(location.pathname.replace(/\/$/, "") || "/");
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    const page = metadata[path as keyof typeof metadata];
    document.title = page?.title || "Client portal | iRobotX";
    for (const [selector, value] of [
      [
        'meta[name="description"]',
        page?.description || "Your private iRobotX workspace.",
      ],
      ['meta[property="og:title"]', document.title],
      ['meta[name="twitter:title"]', document.title],
      [
        'meta[name="twitter:description"]',
        page?.description || "Your private iRobotX workspace.",
      ],
      [
        'meta[property="og:description"]',
        page?.description || "Your private iRobotX workspace.",
      ],
      [
        'meta[property="og:url"]',
        `https://irobotx.io${path === "/" ? "/" : path}`,
      ],
    ])
      document.querySelector(selector)?.setAttribute("content", value);
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", `https://irobotx.io${path === "/" ? "" : path}`);
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.append(robots);
    }
    robots.setAttribute(
      "content",
      publicPaths.includes(path) ? "index,follow" : "noindex,nofollow",
    );
  }, [path]);
  if (
    ["/signin", "/forgot-password", "/accept-invite", "/auth/action"].includes(
      path,
    ) ||
    path.startsWith("/portal")
  )
    return (
      <Suspense
        fallback={
          <main className="route-loading">Loading your workspace…</main>
        }
      >
        <Portal
          key={path.startsWith("/portal") ? "workspace" : path}
          path={path}
        />
      </Suspense>
    );
  if (path === "/")
    return (
      <div className="x-home">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header key={path} path={path} />
        <main id="main">
          <HomeExperience />
        </main>
      </div>
    );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header key={path} path={path} />
      <main id="main">
        {path === "/about" ? (
          <AboutPage />
        ) : path === "/contact" ? (
          <ContactPage />
        ) : (
          <section className="page-hero">
            <span className="eyebrow">404 / Page not found</span>
            <h1>
              Let’s get you
              <br />
              <em>back on track.</em>
            </h1>
            <Button to="/">Return home</Button>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
