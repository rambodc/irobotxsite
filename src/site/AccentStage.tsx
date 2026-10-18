/* eslint-disable react-hooks/immutability -- orbit is a mutable store read by the render loop. */
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { hasWebGL, useReducedMotion } from "./motion";
import type { AccentVariant, OrbitState } from "./Accent";

const Accent = lazy(() => import("./Accent"));

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Decorative particle accent with limited, damped drag-to-orbit. Falls back to a CSS glow.
export default function AccentStage({ variant, className = "" }: { variant: AccentVariant; className?: string }) {
  const reduced = useReducedMotion();
  const [webgl] = useState(hasWebGL);
  const [count] = useState(() => (matchMedia("(max-width: 820px), (pointer: coarse)").matches ? 6500 : 15000));
  const [orbit] = useState<OrbitState>(() => ({ az: 0, el: 0, dragging: false, releasedAt: -1e9 }));
  const drag = useRef<{ id: number; x: number; y: number; az: number; el: number; on: boolean; mouse: boolean } | null>(null);
  const live = webgl && !reduced;
  // Load the 3D accent after the page has painted so it never delays the copy.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!live) return;
    let idle = 0;
    const start = () => {
      idle = window.requestIdleCallback
        ? window.requestIdleCallback(() => setReady(true), { timeout: 1200 })
        : window.setTimeout(() => setReady(true), 200);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [live]);
  return (
    <div
      className={`accent accent-${variant} ${live ? "is-live" : "is-static"} ${className}`}
      aria-hidden="true"
      onPointerDown={(e) => {
        if (!live) return;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el, on: false, mouse: e.pointerType === "mouse" };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x,
          dy = e.clientY - d.y;
        if (!d.on) {
          if (Math.hypot(dx, dy) < 6) return;
          // Touch: only horizontal drags orbit so vertical page scrolling keeps working.
          if (!d.mouse && Math.abs(dy) > Math.abs(dx)) {
            drag.current = null;
            return;
          }
          d.on = true;
          orbit.dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        orbit.az = Math.max(-0.7, Math.min(0.7, d.az - dx * 0.005));
        if (d.mouse) orbit.el = Math.max(-0.1, Math.min(0.4, d.el + dy * 0.004));
      }}
      onPointerUp={() => {
        if (drag.current?.on) {
          orbit.dragging = false;
          orbit.releasedAt = performance.now() / 1000;
        }
        drag.current = null;
      }}
      onPointerCancel={() => {
        orbit.dragging = false;
        orbit.releasedAt = performance.now() / 1000;
        drag.current = null;
      }}
    >
      {live && ready && (
        <Boundary>
          <Suspense fallback={null}>
            <Accent variant={variant} count={count} orbit={orbit} />
          </Suspense>
        </Boundary>
      )}
    </div>
  );
}
