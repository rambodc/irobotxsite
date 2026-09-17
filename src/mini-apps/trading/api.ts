import { httpsCallable } from "firebase/functions";
import { functions, verifyBrowser } from "../../firebaseClient";
export interface Asset {
  currency: string;
  issuer?: string;
  symbol: string;
}
export interface Pair {
  id: string;
  name: string;
  base: Asset;
  quote: Asset;
}
export interface Rules {
  orderSize: number;
  maxPosition: number;
  maxSpread: number;
  threshold: number;
  cooldown: number;
}
export interface Config {
  schemaVersion: 1;
  enabled: boolean;
  revision: number;
  activePair: string;
  pairs: Pair[];
  rules: Rules;
}
export interface Sample {
  minute: number;
  at: number;
  ledger: number;
  mid: string;
}
export interface Level {
  price: string;
  quantity: string;
}
export interface Market {
  pairId: string;
  at?: number;
  ledger?: number;
  bid?: string;
  ask?: string;
  asks?: Level[];
  bids?: Level[];
  history: Sample[];
  error?: string | null;
  updatedAt?: number;
}
export interface Portfolio {
  pairId: string;
  cash: string;
  quantity: string;
  cost: string;
  realized: string;
  fees: string;
  equity: string | null;
  unrealized: string | null;
  totalPnl: string | null;
}
export interface Decision {
  side: "BUY" | "SELL" | "WAIT";
  reason: string;
  momentum: number | null;
  execution?: string;
}
export interface Dashboard {
  config: Config;
  markets: Market[];
  portfolios: Portfolio[];
  health: null | {
    lastAttempt?: number;
    lastEvaluation?: number;
    lastSuccess?: number;
    configRevision?: number;
    error?: string | null;
    decision?: Decision;
  };
}
export interface Trade {
  id: string;
  at: number;
  pairId: string;
  pairName: string;
  quote: string;
  ledger: number;
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  fee: string;
  pnl: string;
  reason: string;
}
export interface Cursor {
  id: string;
  at: number;
}
export interface History {
  trades: Trade[];
  cursor: Cursor | null;
}
export type Change =
  | {
      action: "addPair";
      base: { currency: string; issuer?: string };
      quote: "XRP" | "RLUSD";
    }
  | { action: "removePair" | "selectPair"; pairId: string }
  | { action: "rules"; rules: Rules };
async function call<T>(name: string, input: unknown): Promise<T> {
  await verifyBrowser();
  return (await httpsCallable<unknown, T>(functions, name)(input)).data;
}
export const tradingApi = {
  dashboard: () => call<Dashboard>("tradingDashboard", {}),
  configure: (change: Change) => call<Config>("tradingConfigure", change),
  automation: (enabled: boolean) =>
    call<Config>("tradingAutomation", { enabled }),
  history: (cursor: Cursor | null) =>
    call<History>("tradingHistory", { cursor }),
};
export function tradingError(e: unknown) {
  if (e instanceof Error) {
    if (e.message.includes("permission"))
      return "This mini app is private to its owner.";
    if (e.message.includes("unauthenticated"))
      return "Your session has expired. Sign in again.";
    return e.message.replace(/^Firebase:\s*/, "");
  }
  return "The request could not complete. Please try again.";
}
