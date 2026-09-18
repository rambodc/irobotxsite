import Decimal from "decimal.js";
export const PROJECT = "irobotxsite";
export const API_SA = `xrpl-mainnet-api@${PROJECT}.iam.gserviceaccount.com`;
export const SIGNER_SA = `xrpl-mainnet-signer@${PROJECT}.iam.gserviceaccount.com`;
export const ANALYST_SA = `xrpl-mainnet-analyst@${PROJECT}.iam.gserviceaccount.com`;
export const RLUSD = Object.freeze({
  currency: "524C555344000000000000000000000000000000",
  issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
});
export const PAIRS = Object.freeze([
  { id: "XRP-RLUSD", label: "XRP / RLUSD", base: "XRP", quote: RLUSD },
]);
export const DEFAULTS = Object.freeze({
  pair: "XRP-RLUSD",
  analysisMinutes: 20,
  newsMinutes: 60,
  purchase: "10",
  positionCap: "50",
  dailyPurchases: "50",
  dailyLoss: "5",
  stopLoss: "2",
  takeProfit: "3",
  spread: "0.5",
  movement: "0.5",
  aiBudget: "3",
});
export const LIMITS = Object.freeze({
  buffer: "5",
  feeDrops: 10000,
  trustLimit: "1000",
  attempts: 5,
  duration: 600000,
  cooldown: 1200000,
});
export const D = (v) => new Decimal(v);
export const day = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);
export function settings(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !(k in DEFAULTS))
  )
    throw new Error("Unknown settings.");
  const c = { ...DEFAULTS, ...input };
  if (c.pair !== "XRP-RLUSD")
    throw new Error("Only the approved XRP/RLUSD pair is available.");
  for (const [key, min, max] of [
    ["analysisMinutes", 5, 1440],
    ["newsMinutes", 15, 1440],
  ])
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max)
      throw new Error(`${key} must be an integer from ${min} to ${max}.`);
  for (const k of [
    "purchase",
    "positionCap",
    "dailyPurchases",
    "dailyLoss",
    "stopLoss",
    "takeProfit",
    "spread",
    "movement",
    "aiBudget",
  ]) {
    if (!/^(?:\d{1,9})(?:\.\d{1,6})?$/.test(String(c[k])))
      throw new Error(`Invalid ${k}.`);
    const v = D(c[k]);
    if (!v.isFinite() || v.lte(0)) throw new Error(`${k} must be positive.`);
    c[k] = v.toString();
  }
  if (D(c.purchase).gt(c.positionCap) || D(c.purchase).gt(c.dailyPurchases))
    throw new Error(
      "Purchase must fit the position and daily purchase limits.",
    );
  for (const k of ["stopLoss", "takeProfit"])
    if (D(c[k]).gt(100)) throw new Error(`${k} cannot exceed 100%.`);
  for (const k of ["spread", "movement"])
    if (D(c[k]).gt(1)) throw new Error(`${k} cannot exceed 1%.`);
  return c;
}
export const initialState = () => ({
  enabled: false,
  mode: "paused",
  revision: 0,
  pending: null,
  settings: { ...DEFAULTS },
  position: {
    quantity: "0",
    cost: "0",
    realized: "0",
    tradingFees: "0",
    setupFees: "0",
  },
  budget: { day: "", spent: "0" },
  daily: { day: "", baseline: "0", stoppedDay: null },
  exit: null,
  cooldownUntil: 0,
  nextAnalysisAt: 0,
  nextNewsAt: 0,
  health: {},
  signal: { action: "WAIT", reason: "Collecting market samples." },
});
export const safeMessage = (e) =>
  /seed|secret|credential|payload|PRIVATE|sk-[a-z0-9]/i.test(e?.message || "")
    ? "Service unavailable; see worker health."
    : String(e?.message || "Trading service unavailable.").slice(0, 240);
