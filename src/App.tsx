import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  Menu,
  X,
  Sparkles,
  Info,
} from "lucide-react";
import {
  company,
  industries,
  demos,
  images,
  home,
  about,
  concepts,
  demoPage,
  contact,
  cta,
  metadata,
  type ImageId,
} from "./content";
import { api, errorMessage } from "./api";
const Portal = lazy(() => import("./Portal"));
const publicPaths = ["/", "/about", "/demo", "/contact"];
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
  window.scrollTo(0, 0);
  if (url.hash)
    setTimeout(
      () => document.getElementById(url.hash.slice(1))?.scrollIntoView(),
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
export function Logo() {
  return (
    <span className="logo">
      <Mark />
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
function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.65 }}
    >
      {children}
    </motion.div>
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
        <Logo />
      </Link>
      <nav className="nav-pill" aria-label="Main navigation">
        {[
          ["Home", "/"],
          ["About us", "/about"],
          ["Demo", "/demo"],
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
      <Link to="/signin" className="header-signin">
        Client sign in <ArrowUpRight size={16} />
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
            ["About us", "/about"],
            ["Demo", "/demo"],
            ["Contact", "/contact"],
            ["Client sign in", "/signin"],
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
            Engineering what comes next.
            <br />
            Built in Calgary. Designed for the field.
          </p>
        </div>
        <div>
          <span className="eyebrow">Explore</span>
          <Link to="/about">About us</Link>
          <Link to="/demo">Explore demos</Link>
          <Link to="/signin">Client portal</Link>
        </div>
        <div>
          <span className="eyebrow">Let’s connect</span>
          <a href={`mailto:${company.email}`}>
            {company.email}
            <ArrowUpRight size={14} />
          </a>
          <span>Calgary, Alberta, Canada</span>
          <Link to="/contact">
            Start a conversation <ArrowUpRight size={14} />
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
function Art({
  name,
  priority = false,
  className = "",
}: {
  name: ImageId;
  priority?: boolean;
  className?: string;
}) {
  const asset = images[name];
  return (
    <picture className={`cinematic-art art-${name} ${className}`}>
      <source
        type="image/avif"
        srcSet={`/images/${asset.src}-640.avif 640w, /images/${asset.src}-1024.avif 1024w, /images/${asset.src}-1536.avif 1536w`}
        sizes={priority ? "100vw" : "(max-width: 800px) 100vw, 60vw"}
      />
      <img
        src={`/images/${asset.src}-1024.webp`}
        srcSet={`/images/${asset.src}-640.webp 640w, /images/${asset.src}-1024.webp 1024w, /images/${asset.src}-1536.webp 1536w`}
        sizes={priority ? "100vw" : "(max-width: 800px) 100vw, 60vw"}
        alt={asset.alt}
        width={1536}
        height={1024}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}
function CTA() {
  return (
    <section className="cta-band">
      <Mark className="brand-watermark" />
      <Reveal>
        <span className="eyebrow">{cta.eyebrow}</span>
        <h2>{cta.title}</h2>
        <p>{cta.text}</p>
        <Button>{cta.button}</Button>
      </Reveal>
    </section>
  );
}
function Process() {
  return (
    <section className="content-section process-section">
      <Reveal className="section-heading">
        <div>
          <span className="eyebrow">{home.process.eyebrow}</span>
          <h2>{home.process.title}</h2>
        </div>
        <p>{home.process.text}</p>
      </Reveal>
      <div className="process-cards">
        {home.process.steps.map((step, i) => (
          <Reveal className="process-card" key={step.title}>
            <span className="step-number">0{i + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
function Disciplines() {
  return (
    <section className="content-section disciplines-section">
      <Reveal className="section-heading">
        <div>
          <span className="eyebrow">{home.disciplines.eyebrow}</span>
          <h2>{home.disciplines.title}</h2>
        </div>
        <p>{home.disciplines.text}</p>
      </Reveal>
      <div className="discipline-grid">
        {industries.slice(1).map((industry) => (
          <Reveal className="discipline-card" key={industry.id}>
            <div className="discipline-image">
              <Art name={industry.image} />
              <span className="image-label">
                {industry.name} / Concept imagery
              </span>
            </div>
            <div className="discipline-copy">
              <span className="eyebrow">
                {industry.number} / {industry.name}
              </span>
              <h3>{industry.title}</h3>
              <p>{industry.text}</p>
              <Link to={`/about#${industry.id}`} className="text-link">
                Explore {industry.name}
                <ArrowUpRight size={17} />
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
function Home() {
  return (
    <>
      <section className="oil-hero">
        <Art name="oilfield" priority />
        <div className="oil-hero-shade" />
        <Mark className="hero-watermark" />
        <div className="oil-hero-content">
          <Reveal>
            <span className="eyebrow">
              <i className="signal" />
              {home.eyebrow}
            </span>
            <h1>
              AI-powered software for{" "}
              <em>connected Oil &amp; Gas operations.</em>
            </h1>
            <p>{company.description}</p>
            <div className="button-row">
              <Button>{home.primary}</Button>
              <Link to="/demo" className="text-link">
                {home.secondary}
                <ArrowRight size={17} />
              </Link>
            </div>
          </Reveal>
        </div>
        <div className="oil-hero-bottom">
          <div>
            {home.strip.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <a href="#operations" aria-label="Explore connected operations">
            <ArrowDown size={18} />
          </a>
        </div>
        <span className="hero-art-note">Oil &amp; Gas / Concept imagery</span>
      </section>
      <section id="operations" className="content-section operations-section">
        <Reveal className="section-heading">
          <div>
            <span className="eyebrow">{home.operations.eyebrow}</span>
            <h2>{home.operations.title}</h2>
          </div>
          <p>{home.operations.text}</p>
        </Reveal>
        <Reveal className="operations-showcase">
          <Art name="operations" />
          <div className="concept-panel">
            <span className="eyebrow">A shared operational workspace</span>
            <Mark />
            <div className="concept-connections">
              {home.strip.map((item, i) => (
                <div key={item}>
                  <span>0{i + 1}</span>
                  {item}
                  <ArrowUpRight size={14} />
                </div>
              ))}
            </div>
            <span className="concept-disclosure">
              Illustrative platform concept
            </span>
          </div>
        </Reveal>
        <div className="capability-grid">
          {home.operations.points.map((item, i) => (
            <Reveal className="capability" key={item.title}>
              <span className="eyebrow">0{i + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="ai-band">
        <div className="content-section split-feature">
          <Reveal className="feature-copy">
            <span className="eyebrow">{home.ai.eyebrow}</span>
            <h2>{home.ai.title}</h2>
            <p>{home.ai.text}</p>
            <ul className="capability-list">
              {home.ai.points.map((item) => (
                <li key={item}>
                  <Sparkles size={15} />
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/demo#ai-workspace" className="text-link">
              Explore the AI concept
              <ArrowUpRight size={17} />
            </Link>
          </Reveal>
          <Reveal className="ai-visual">
            <Art name="ai" />
            <div className="ai-example">
              <span className="eyebrow">
                <Mark />
                Your data. Your questions.
              </span>
              <blockquote>{home.ai.example}</blockquote>
              <p>{home.ai.caption}</p>
            </div>
          </Reveal>
        </div>
      </section>
      <Process />
      <Disciplines />
      <CTA />
    </>
  );
}
function About() {
  return (
    <>
      <section className="page-hero brand-page-hero">
        <Mark className="page-watermark" />
        <span className="eyebrow">{about.eyebrow}</span>
        <h1>{about.title}</h1>
        <p>{about.intro}</p>
      </section>
      <section className="content-section about-intro">
        <Reveal>
          <span className="eyebrow">{about.eyebrow2}</span>
          <h2>{about.heading}</h2>
        </Reveal>
        <Reveal>
          {about.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </Reveal>
      </section>
      {industries.map((industry) => (
        <section
          key={industry.id}
          id={industry.id}
          className={`content-section about-industry ${industry.id === "oil-gas" ? "about-primary" : ""}`}
        >
          <Reveal className="about-industry-art">
            <Art name={industry.image} />
            <span className="image-label">
              {industry.name} / Illustrative concept
            </span>
          </Reveal>
          <Reveal className="about-industry-copy">
            <span className="eyebrow">
              {industry.number} / {industry.name}
            </span>
            <h2>{industry.title}</h2>
            <p>{industry.text}</p>
            <p>{industry.detail}</p>
            <div className="tags">
              {industry.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </Reveal>
        </section>
      ))}
      <Process />
      <CTA />
    </>
  );
}
function Demo() {
  return (
    <>
      <section className="page-hero brand-page-hero">
        <Mark className="page-watermark" />
        <span className="eyebrow">{demoPage.eyebrow}</span>
        <h1>{demoPage.title}</h1>
        <p>{demoPage.intro}</p>
      </section>
      <div className="gallery-note">
        <Info size={18} />
        <p>{demoPage.disclosure}</p>
      </div>
      <section
        className="content-section concept-gallery"
        aria-label="Oil & Gas visual concepts"
      >
        {concepts.map((concept) => (
          <Reveal key={concept.id} className="concept-card">
            <article id={concept.id}>
              <div className="concept-art">
                <Art name={concept.image} />
                <div className="concept-art-top">
                  <span>
                    {concept.number} / {concept.category}
                  </span>
                  <span className="badge">Visual concept</span>
                </div>
                {concept.id === "ai-workspace" && (
                  <div className="gallery-ai-question">
                    <Mark />
                    <span>{home.ai.example}</span>
                  </div>
                )}
              </div>
              <div className="concept-copy">
                <div>
                  <span className="eyebrow">{concept.category}</span>
                  <h2>{concept.name}</h2>
                </div>
                <div>
                  <p>{concept.text}</p>
                  <div className="tags">
                    {concept.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <span className="concept-disclosure">{concept.note}</span>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
        <div className="future-heading">
          <span className="eyebrow">Robotics &amp; FinTech</span>
          <h2>{demoPage.future}</h2>
        </div>
        <div className="future-grid">
          {demos.slice(1).map((demo) => (
            <article className="panel future-card" key={demo.id}>
              <Mark />
              <span className="badge muted">Coming soon</span>
              <span className="eyebrow">{demo.category}</span>
              <h3>{demo.name}</h3>
              <p>{demo.text}</p>
            </article>
          ))}
        </div>
      </section>
      <CTA />
    </>
  );
}

export function ContactForm({
  prefill,
}: {
  prefill?: { name: string; email: string; company: string };
}) {
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
      }
    } catch (error) {
      setFailed(true);
      setResult(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="contact-form panel"
      onSubmit={submit}
      onChange={() => {
        if (failed) {
          setRequestId(crypto.randomUUID());
          setFailed(false);
          setResult("");
        }
      }}
    >
      <h3>Start a conversation.</h3>
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
        <div role="status" className={`alert ${failed ? "error" : "success"}`}>
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
function Contact() {
  return (
    <>
      <section className="page-hero brand-page-hero">
        <Mark className="page-watermark" />
        <span className="eyebrow">{contact.eyebrow}</span>
        <h1>{contact.title}</h1>
        <p>{contact.intro}</p>
      </section>
      <section className="section contact-layout">
        <div>
          <span className="eyebrow">A direct connection</span>
          <h2>{contact.heading}</h2>
          <p>{contact.text}</p>
          <a className="email-link" href={`mailto:${company.email}`}>
            {company.email}
            <ArrowUpRight size={21} />
          </a>
          <p>{company.location}, Canada</p>
          <div className="contact-brand">
            <Mark />
            <span>
              Connected thinking.
              <br />
              Built around you.
            </span>
          </div>
        </div>
        <ContactForm />
      </section>
    </>
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
      document.getElementById(id)?.scrollIntoView();
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
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header key={path} path={path} />
      <main id="main">
        {path === "/" ? (
          <Home />
        ) : path === "/about" ? (
          <About />
        ) : path === "/demo" ? (
          <Demo />
        ) : path === "/contact" ? (
          <Contact />
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
