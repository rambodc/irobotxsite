import type { Item, Setup } from "./types";

const num = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 });
const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const cadUnit = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const fmtNum = (v: number) => num.format(v);
export const fmtMoney = (v: number) => cad.format(v);
export const fmtUnitCost = (v: number) => cadUnit.format(v);
export const unitOf = (item?: Item | null) => item?.setup?.baseUnit ?? "units";
export const fmtQty = (v: number, item?: Item | null) => `${fmtNum(v)} ${unitOf(item)}`;

const NOUN: Record<string, [string, string]> = {
  drum: ["drum", "drums"],
  tote: ["tote", "totes"],
  pail: ["pail", "pails"],
  other: ["container", "containers"],
};
export const containerNoun = (type: string, n: number) => (NOUN[type] ?? NOUN.other)[n === 1 ? 0 : 1];

/** Container-first stock text, e.g. { primary: "3 totes", secondary: "3,000 L" }. */
export function containerStock(qty: number, setup: Setup | null): { primary: string; secondary: string } {
  if (!setup) return { primary: fmtNum(qty), secondary: "units" };
  const total = `${fmtNum(qty)} ${setup.baseUnit}`;
  if (qty < 0) return { primary: "Negative stock", secondary: total };
  const cap = setup.containerCapacity;
  const full = Math.floor(qty / cap + 1e-9);
  const rest = Math.round((qty - full * cap) * 1000) / 1000;
  if (qty === 0) return { primary: `0 ${containerNoun(setup.containerType, 0)}`, secondary: total };
  if (rest === 0) return { primary: `${fmtNum(full)} ${containerNoun(setup.containerType, full)}`, secondary: total };
  if (full === 0) return { primary: `Part ${containerNoun(setup.containerType, 1)}`, secondary: total };
  return { primary: `${fmtNum(full)} ${containerNoun(setup.containerType, full)} + ${fmtNum(rest)} ${setup.baseUnit}`, secondary: total };
}
export const stockLine = (qty: number, setup: Setup | null) => {
  const s = containerStock(qty, setup);
  return setup ? `${s.primary} · ${s.secondary}` : `${s.primary} ${s.secondary}`;
};

export function ago(iso: string | null, now: number) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton" }) : "—";

export function friendlyError(e: unknown): string {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  if (/invalid-argument|failed-precondition|aborted|not-found|unavailable/.test(code) && message) return message;
  if (/permission-denied/.test(code)) return "Your account does not have access to QB Chem.";
  if (/unauthenticated/.test(code)) return "Please sign in again to continue.";
  if (/deadline-exceeded/.test(code)) return "QuickBooks is taking too long to respond. Check the run history before retrying.";
  if (code.startsWith("appCheck/")) return "Browser verification failed. Reload the page and try again.";
  return "Something went wrong talking to QuickBooks. Please try again.";
}
