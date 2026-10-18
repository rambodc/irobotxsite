/* eslint-disable react-hooks/immutability -- Director is an external mutable animation store. */
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { experience } from "../content";
import { Link } from "../App";
import { CHAPTERS, Director } from "./director";
import "./home3d.css";

const Scene = lazy(() => import("./Scene"));
const labels = ["iRobotX Core", ...experience.chapters.map((c) => c.name)];

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Actions() {
  return (
    <div className="x-actions">
      <Link to="/contact" className="x-cta">
        {experience.cta}
        <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
      <Link to="/about" className="x-secondary">
        {experience.secondary}
      </Link>
    </div>
  );
}

function StaticHome() {
  return (
    <div className="x-static">
      <picture className="x-static-art">
        <source
          type="image/webp"
          srcSet="/images/home-still-768.webp 768w, /images/home-still-1536.webp 1536w"
          sizes="100vw"
        />
        <img
          src="/images/home-still-1536.webp"
          alt="Glowing particle humanoid robot formed from the iRobotX network"
          fetchPriority="high"
        />
      </picture>
      <div className="x-static-shade" />
      <section className="x-static-hero">
        <span className="x-eyebrow">{experience.eyebrow}</span>
        <h1>{experience.headline}</h1>
        <p className="x-intro">{experience.intro}</p>
        <Actions />
      </section>
      <section className="x-static-grid" aria-label="Industries">
        {experience.chapters.map((c, i) => (
          <article key={c.id}>
            <span className="x-index">0{i + 1}</span>
            <h2>{c.name}</h2>
            <p className="x-line">{c.line}</p>
            <p>{c.copy}</p>
          </article>
        ))}
      </section>
      <p className="x-legal">© {new Date().getFullYear()} iRobotX · Calgary, Alberta</p>
    </div>
  );
}

function Experience({ onFail }: { onFail: () => void }) {
  const [director] = useState(() => new Director());
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const holds = useRef({ hover: false, touch: false, hidden: false });
  const lastNav = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [device] = useState(() => {
    const mobile = matchMedia("(max-width: 820px), (pointer: coarse)").matches;
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
    const count = Math.round((mobile ? 26000 : 72000) * (lowEnd ? 0.7 : 1));
    return { count, pointSize: mobile ? 4.2 : 3.1, maxDpr: 1.5 };
  });

  useEffect(() => {
    director.onChapter = setChapter;
    return () => {
      director.onChapter = undefined;
    };
  }, [director]);

  const syncPause = useCallback(() => {
    const h = holds.current;
    director.paused = h.hover || h.touch || h.hidden;
    setPaused(h.hover || h.touch);
  }, [director]);
  const hold = useCallback(
    (key: "hover" | "touch" | "hidden", value: boolean) => {
      holds.current[key] = value;
      syncPause();
    },
    [syncPause],
  );
  const step = useCallback(
    (dir: number) => {
      const now = performance.now();
      if (now - lastNav.current < 900) return;
      lastNav.current = now;
      director.go((director.chapter + dir + CHAPTERS) % CHAPTERS);
    },
    [director],
  );

  useEffect(() => {
    const vis = () => hold("hidden", document.hidden);
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") step(1);
      if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") step(-1);
    };
    document.addEventListener("visibilitychange", vis);
    addEventListener("keydown", key);
    document.documentElement.classList.add("x-lock");
    return () => {
      document.removeEventListener("visibilitychange", vis);
      removeEventListener("keydown", key);
      document.documentElement.classList.remove("x-lock");
    };
  }, [hold, step]);

  return (
    <div
      ref={stage}
      className="x-stage"
      data-chapter={chapter}
      data-phase="morph"
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > 24) step(e.deltaY > 0 ? 1 : -1);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") hold("touch", true);
        touchStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = touchStart.current;
        touchStart.current = null;
        if (e.pointerType !== "mouse") hold("touch", false);
        if (!s || e.pointerType === "mouse") return;
        const dx = e.clientX - s.x,
          dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 48)
          step((Math.abs(dy) > Math.abs(dx) ? dy : dx) < 0 ? 1 : -1);
      }}
      onPointerCancel={() => hold("touch", false)}
    >
      <div className="x-canvas">
        <SceneBoundary onError={onFail}>
          <Suspense fallback={null}>
            <Scene director={director} stage={stage} {...device} />
          </Suspense>
        </SceneBoundary>
      </div>
      <div className="x-vignette" aria-hidden="true" />
      <section
        className="x-copy"
        aria-live="polite"
        onPointerEnter={(e) => e.pointerType === "mouse" && hold("hover", true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && hold("hover", false)}
      >
        <div className="x-copy-stack">
          <article className={chapter === 0 ? "is-active" : ""} aria-hidden={chapter !== 0}>
            <span className="x-eyebrow">{experience.eyebrow}</span>
            <h1>{experience.headline}</h1>
            <p className="x-intro">{experience.intro}</p>
          </article>
          {experience.chapters.map((c, i) => (
            <article
              key={c.id}
              className={chapter === i + 1 ? "is-active" : ""}
              aria-hidden={chapter !== i + 1}
            >
              <span className="x-eyebrow">
                <b>0{i + 1}</b> Industry
              </span>
              <h2>{c.name}</h2>
              <p className="x-line">{c.line}</p>
              <p className="x-intro">{c.copy}</p>
            </article>
          ))}
        </div>
        <Actions />
      </section>
      <nav
        className="x-chapters"
        aria-label="Chapters"
        onPointerEnter={(e) => e.pointerType === "mouse" && hold("hover", true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && hold("hover", false)}
      >
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-current={chapter === i ? "step" : undefined}
            onClick={() => director.go(i)}
          >
            <span className="x-num">0{i}</span>
            <span className="x-label">{label}</span>
            <span className="x-track">
              <span className="x-fill" />
            </span>
          </button>
        ))}
      </nav>
      <div className="x-hud" aria-hidden="true">
        <span className="x-dot" />
        <span>iRobotX OS</span>
        <span className="x-sep">/</span>
        <span>{labels[chapter]}</span>
        <span className="x-state">{paused ? "Paused" : "Auto tour"}</span>
      </div>
    </div>
  );
}

export default function HomeExperience() {
  const reduced = useReducedMotion();
  const [webgl] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);
  if (reduced || !webgl || failed) return <StaticHome />;
  return <Experience onFail={() => setFailed(true)} />;
}
