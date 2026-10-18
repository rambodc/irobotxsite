import { Matrix4, Vector3 } from "three";
import { ARM } from "./forms";

// Cycle (seconds): reach over the part, descend, weld around the seam, lift, return, rest.
export const ARM_CYCLE = 7.6;
type P = [number, number, number];
const [px, py, pz] = ARM.part;
const seamAt = (phi: number, lift = 0): P => [
  px + Math.cos(phi) * ARM.seam,
  py + 0.05 + lift,
  pz + Math.sin(phi) * ARM.seam,
];
const REST = { yaw: 2.05, radius: 2.3, y: 0.35 };
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const mix = (a: P, b: P, t: number): P => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
// Arc between two points around the base (cylindrical interpolation).
function arc(a: P, b: P, t: number): P {
  const ya = Math.atan2(a[2], a[0]),
    yb = Math.atan2(b[2], b[0]);
  let dy = yb - ya;
  if (dy > Math.PI) dy -= 2 * Math.PI;
  if (dy < -Math.PI) dy += 2 * Math.PI;
  const yaw = ya + dy * t,
    ra = Math.hypot(a[0], a[2]),
    rb = Math.hypot(b[0], b[2]),
    rad = ra + (rb - ra) * t,
    y = a[1] + (b[1] - a[1]) * t + Math.sin(Math.PI * t) * 0.5;
  return [Math.cos(yaw) * rad, y, Math.sin(yaw) * rad];
}
const rest = (time: number): P => [
  Math.cos(REST.yaw) * REST.radius,
  REST.y + Math.sin(time * 1.3) * 0.06,
  Math.sin(REST.yaw) * REST.radius,
];

export function armTarget(t: number, time: number): { tip: P; weld: number; roll: number } {
  const above = seamAt(0, 0.9),
    down = seamAt(0);
  if (t < 1.5) return { tip: arc(rest(time), above, ease(t / 1.5)), weld: 0, roll: 0 };
  if (t < 2.1) return { tip: mix(above, down, ease((t - 1.5) / 0.6)), weld: 0, roll: 0 };
  if (t < 4.8) {
    const u = (t - 2.1) / 2.7,
      phi = u * Math.PI * 2;
    const weld = Math.min(1, u * 12, (1 - u) * 12);
    return { tip: seamAt(phi), weld, roll: phi * 2 };
  }
  if (t < 5.4) return { tip: mix(down, above, ease((t - 4.8) / 0.6)), weld: 0, roll: 0 };
  if (t < 6.9) return { tip: arc(above, rest(time), ease((t - 5.4) / 1.5)), weld: 0, roll: 0 };
  return { tip: rest(time), weld: 0, roll: 0 };
}

const L1 = ARM.upper,
  L2 = ARM.fore,
  TOOL = ARM.wrist + ARM.tip;
const m = () => new Matrix4();
const tmp = { t: m(), r: m() };
export function solveArm(tip: P, roll: number, out: Matrix4[], tipOut: Vector3) {
  // Tool points straight down; solve the planar 2-link chain for the wrist pivot.
  const w: P = [tip[0], tip[1] + TOOL, tip[2]];
  const yaw = Math.atan2(-w[2], w[0]);
  const d = Math.hypot(w[0], w[2]),
    h = w[1] - (ARM.turretY + ARM.shoulder);
  const D = Math.min(Math.hypot(d, h), L1 + L2 - 0.01);
  const alpha = Math.atan2(d, h);
  const beta = Math.acos(Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  const gamma = Math.acos(Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)));
  const a1 = alpha - beta,
    a2 = Math.PI - gamma,
    a3 = Math.PI - a1 - a2;
  const [m2, m3, m4, m5, m6] = out;
  m2.makeTranslation(0, ARM.turretY, 0).multiply(tmp.r.makeRotationY(yaw));
  m3.copy(m2).multiply(tmp.t.makeTranslation(0, ARM.shoulder, 0)).multiply(tmp.r.makeRotationZ(-a1));
  m4.copy(m3).multiply(tmp.t.makeTranslation(0, L1, 0)).multiply(tmp.r.makeRotationZ(-a2));
  m5.copy(m4).multiply(tmp.t.makeTranslation(0, L2, 0)).multiply(tmp.r.makeRotationZ(-a3));
  m6.copy(m5).multiply(tmp.t.makeTranslation(0, ARM.wrist, 0)).multiply(tmp.r.makeRotationY(roll));
  tipOut.set(0, ARM.tip, 0).applyMatrix4(m6);
}
