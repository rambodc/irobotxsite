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
  Cpu,
  Layers3,
  Menu,
  X,
  Workflow,
  ShieldCheck,
  Radio,
  ChevronDown,
} from "lucide-react";
import { company, industries, demos } from "./content";
import { api, errorMessage } from "./api";
const Scene = lazy(() => import("./Scene"));
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
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-symbol">
        i<span>×</span>
      </span>
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
function SceneView({
  interactive = false,
  playing = true,
}: {
  interactive?: boolean;
  playing?: boolean;
}) {
  return (
    <Suspense
      fallback={<div className="scene-loading">Connecting the dots…</div>}
    >
      <Scene interactive={interactive} playing={playing} />
    </Suspense>
  );
}
function CTA() {
  return (
    <section className="cta-band">
      <div className="orbital" />
      <Reveal>
        <span className="eyebrow">
          Your next challenge. Our next conversation.
        </span>
        <h2>
          Let’s build something
          <br />
          <em>that moves you forward.</em>
        </h2>
        <p>Bring us the operation, the idea, or the problem worth solving.</p>
        <Button>Talk to our team</Button>
      </Reveal>
    </section>
  );
}
function Home() {
  const reduce = useReducedMotion();
  return (
    <>
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-glow" />
        <div className="hero-inner">
          <motion.div
            className="hero-copy"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <span className="eyebrow">
              <i className="signal" /> Technology for industries in motion
            </span>
            <h1>
              Intelligence
              <br />
              built for
              <br />
              <em>the field.</em>
            </h1>
            <p>{company.description}</p>
            <div className="button-row">
              <Button to="/demo">Explore our technology</Button>
              <Link className="text-link" to="/about">
                Meet iRobotX <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
          <div className="hero-visual">
            <div className="scene-caption">
              <span>
                <i className="signal" /> INDUSTRIAL INTELLIGENCE
              </span>
              <span>iRX / 01</span>
            </div>
            <SceneView playing={!reduce} />
            <div className="visual-label">
              <span className="crosshair">+</span>
              <div>
                Complex systems.
                <br />
                <strong>Connected thinking.</strong>
              </div>
            </div>
            <span className="concept-label">CONCEPT VISUALIZATION</span>
          </div>
        </div>
        <div className="hero-base">
          <span>THREE DISCIPLINES. ONE BUILDER’S MINDSET.</span>
          <div>
            <span>Oil & Gas</span>
            <b>✳</b>
            <span>Robotics</span>
            <b>✳</b>
            <span>FinTech</span>
          </div>
          <a href="#focus" aria-label="Explore our focus">
            <ChevronDown size={20} />
          </a>
        </div>
      </section>
      <section id="focus" className="section intro">
        <Reveal>
          <span className="eyebrow">Built around real-world complexity</span>
          <h2>
            The field is complex.
            <br />
            <em>
              Your technology
              <br />
              should bring clarity.
            </em>
          </h2>
        </Reveal>
        <Reveal className="intro-right">
          <p className="large-copy">
            We connect deep technical thinking with the realities of industrial
            operations.
          </p>
          <p>
            From software that brings information together to automation that
            connects the physical and digital, our work starts with
            understanding the problem—and building a practical way forward.
          </p>
          <Link className="text-link" to="/about">
            Discover our approach <ArrowUpRight size={18} />
          </Link>
        </Reveal>
      </section>
      <section className="section-wide">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Where we focus</span>
            <h2>
              Technology with
              <br />
              <em>an industrial edge.</em>
            </h2>
          </div>
          <p>
            Oil & Gas at the core.
            <br />
            Ideas that travel across industries.
          </p>
        </div>
        <div className="industry-grid">
          {industries.map((industry, i) => (
            <Reveal key={industry.id} className={`industry-card industry-${i}`}>
              <div className="card-top">
                <span>
                  {industry.number} / {industry.name}
                </span>
                {i === 0 ? <Workflow /> : i === 1 ? <Cpu /> : <Layers3 />}
              </div>
              <div className="industry-art" aria-hidden="true">
                {i === 0 ? (
                  <>
                    <i />
                    <i />
                    <i />
                    <span />
                  </>
                ) : i === 1 ? (
                  <div className="chip">
                    <Cpu size={70} />
                  </div>
                ) : (
                  <div className="stack">
                    <Layers3 size={90} />
                  </div>
                )}
              </div>
              <h3>{industry.title}</h3>
              <p>{industry.text}</p>
              <Link to={`/about#${industry.id}`} className="card-link">
                Explore {industry.name}
                <ArrowUpRight size={20} />
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="section process">
        <Reveal className="process-visual">
          <div className="orbit-rings">
            <i />
            <i />
            <i />
          </div>
          <div className="process-core">
            <Logo />
            <small>IDEA → REALITY</small>
          </div>
          <span className="process-node node-one">
            <Radio size={16} /> Understand
          </span>
          <span className="process-node node-two">
            <Workflow size={16} /> Connect
          </span>
          <span className="process-node node-three">
            <ShieldCheck size={16} /> Engineer
          </span>
        </Reveal>
        <Reveal>
          <span className="eyebrow">Our way of working</span>
          <h2>
            Start with the problem.
            <br />
            <em>Build what matters.</em>
          </h2>
          <p>
            Useful technology comes from staying close to the people, systems,
            and environments it serves.
          </p>
          <ol className="steps">
            <li>
              <b>01</b>
              <div>
                <h3>Understand the operation</h3>
                <p>Work from the real context, constraints, and goals.</p>
              </div>
            </li>
            <li>
              <b>02</b>
              <div>
                <h3>Connect the disciplines</h3>
                <p>Bring software, data, and intelligent systems together.</p>
              </div>
            </li>
            <li>
              <b>03</b>
              <div>
                <h3>Develop and refine</h3>
                <p>Prototype, learn, and engineer the next iteration.</p>
              </div>
            </li>
          </ol>
        </Reveal>
      </section>
      <CTA />
    </>
  );
}
function About() {
  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">About iRobotX</span>
        <h1>
          Curiosity connects us.
          <br />
          <em>Engineering moves us.</em>
        </h1>
        <p>
          A Calgary technology company developing software and intelligent
          systems across Oil & Gas, Robotics, and FinTech.
        </p>
      </section>
      <section className="section intro">
        <Reveal>
          <span className="eyebrow">One company. Connected disciplines.</span>
          <h2>
            Built to explore.
            <br />
            <em>Driven to make.</em>
          </h2>
        </Reveal>
        <Reveal className="intro-right">
          <p className="large-copy">
            Good ideas rarely stay inside one industry.
          </p>
          <p>
            Our work brings together physical systems and digital technology. An
            industrial challenge can lead to an automation idea. A robotics
            problem can inform a software platform. Each discipline adds another
            perspective.
          </p>
          <p>
            Oil & Gas is central to that work: complex environments where
            context, integration, and practical engineering matter.
          </p>
        </Reveal>
      </section>
      {industries.map((industry, i) => (
        <section
          id={industry.id}
          key={industry.id}
          className="section industry-detail"
        >
          <Reveal>
            <span className="eyebrow">
              {industry.number} / {industry.name}
            </span>
            <h2>{industry.title}</h2>
            <p>{industry.text}</p>
            <div className="tags">
              {industry.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </Reveal>
          <Reveal className="detail-art">
            {i === 0 ? (
              <SceneView playing={false} />
            ) : (
              <div className="detail-icon">
                {i === 1 ? <Cpu /> : <Layers3 />}
                <span>
                  {industry.name.toUpperCase()} / RESEARCH & DEVELOPMENT
                </span>
              </div>
            )}
          </Reveal>
        </section>
      ))}
      <CTA />
    </>
  );
}
function Demo() {
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <section className="page-hero compact">
        <span className="eyebrow">The demonstration space</span>
        <h1>
          A window into
          <br />
          <em>what comes next.</em>
        </h1>
        <p>
          A place to explore ideas, try concepts, and see our technology take
          shape. This is just the beginning.
        </p>
      </section>
      <section className="section-wide demo-section">
        <div className="demo-workspace">
          <div className="workspace-bar">
            <span>
              <i className="signal" /> Connected industrial systems
            </span>
            <span className="badge">Interactive concept</span>
          </div>
          <div className="demo-canvas">
            <SceneView interactive playing={playing && !reduce} />
            <div className="demo-overlay">
              <span className="eyebrow">01 / Oil & Gas</span>
              <h2>
                A different perspective
                <br />
                on connected operations.
              </h2>
            </div>
          </div>
          <div className="workspace-bottom">
            <span>Drag to rotate · Scroll to zoom · Sample geometry only</span>
            <button
              className="small-button"
              disabled={Boolean(reduce)}
              onClick={() => setPlaying(!playing)}
            >
              {reduce
                ? "Reduced motion enabled"
                : playing
                  ? "Pause motion"
                  : "Enable motion"}
            </button>
          </div>
        </div>
        <div className="demo-note">
          <Radio size={18} />
          <p>
            This is an illustrative 3D concept, not live operational data or an
            engineering simulation. More demonstrations will be added here.
          </p>
        </div>
        <div className="demo-cards">
          {demos.map((demo) => (
            <article className="panel" key={demo.id}>
              <span className="eyebrow">{demo.category}</span>
              <h3>{demo.name}</h3>
              <p>{demo.text}</p>
              <span className="badge muted">Coming soon</span>
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
    <form className="contact-form panel" onSubmit={submit}>
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
      <section className="page-hero compact">
        <span className="eyebrow">Let’s connect</span>
        <h1>
          Great work starts
          <br />
          <em>with a conversation.</em>
        </h1>
        <p>
          Tell us what you’re working on. We’d like to hear where technology
          could make a difference.
        </p>
      </section>
      <section className="section contact-layout">
        <div>
          <span className="eyebrow">A direct connection</span>
          <h2>
            Your next idea.
            <br />
            Our next challenge.
          </h2>
          <a className="email-link" href={`mailto:${company.email}`}>
            {company.email}
            <ArrowUpRight size={21} />
          </a>
          <p>Calgary, Alberta, Canada</p>
          <div className="contact-coordinate">
            <span>51.0447° N / 114.0719° W</span>
            <div className="coordinate-orbit" />
            <span>
              <i className="signal" /> OPEN TO NEW POSSIBILITIES
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
    const update = () => setPath(location.pathname.replace(/\/$/, "") || "/");
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    const names: Record<string, string> = {
      "/": "Intelligence built for the field",
      "/about": "About us",
      "/demo": "Technology demos",
      "/contact": "Contact",
    };
    document.title = `${names[path] || "Client portal"} | iRobotX`;
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
