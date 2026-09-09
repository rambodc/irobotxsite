import { Component, type ReactNode } from "react";
function available() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
export class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: !available() };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="well-fallback">
        <svg
          viewBox="0 0 600 500"
          role="img"
          aria-label="Illustrative main bore with three horizontal lateral legs"
        >
          <g fill="none" strokeWidth="5">
            <path stroke="#42dff5" d="M170 30V240Q170 320 250 320H530" />
            <path stroke="#ffd166" d="M250 320Q310 320 350 380L490 465" />
            <path stroke="#ef476f" d="M310 320Q350 320 390 260L520 160" />
            <path stroke="#8cff98" d="M380 320Q440 320 460 360L560 410" />
          </g>
        </svg>
        <p>
          3D is unavailable in this browser. The well details remain available.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
