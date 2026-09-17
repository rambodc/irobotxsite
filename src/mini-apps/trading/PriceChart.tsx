import { useEffect, useRef } from "react";
import type { Sample } from "./api";
export default function PriceChart({
  samples,
  unit,
}: {
  samples: Sample[];
  unit: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const width = canvas.clientWidth,
        height = 200,
        ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, width, height);
      const values = samples.map((s) => Number(s.mid));
      if (values.length < 2) return;
      const min = Math.min(...values),
        max = Math.max(...values),
        pad = Math.max((max - min) * 0.2, max * 0.00005);
      const low = min - pad,
        high = max + pad;
      ctx.strokeStyle = "#253248";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const y = 15 + i * 52;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3,
        y = (v: number) => 175 - ((v - low) / (high - low)) * 150;
      ctx.beginPath();
      values.forEach((v, i) =>
        i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)),
      );
      ctx.strokeStyle = "#8bbcff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineTo(x(values.length - 1), 190);
      ctx.lineTo(x(0), 190);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, 20, 0, 190);
      fill.addColorStop(0, "#689dff35");
      fill.addColorStop(1, "#689dff00");
      ctx.fillStyle = fill;
      ctx.fill();
    }
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [samples]);
  if (samples.length < 2)
    return (
      <div className="xt-chart-empty">
        Your price history will appear after two scheduled samples.
      </div>
    );
  const first = samples[0],
    last = samples.at(-1)!;
  return (
    <figure className="xt-chart">
      <canvas
        ref={ref}
        role="img"
        aria-label={`${samples.length} midpoint samples: ${Number(first.mid).toPrecision(6)} to ${Number(last.mid).toPrecision(6)} ${unit}.`}
      />
      <figcaption>
        <span>{new Date(first.at).toLocaleTimeString()}</span>
        <span>Midpoint · {unit}</span>
        <span>{new Date(last.at).toLocaleTimeString()}</span>
      </figcaption>
    </figure>
  );
}
