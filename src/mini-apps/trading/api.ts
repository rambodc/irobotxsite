import { httpsCallable } from "firebase/functions";
import { functions, verifyBrowser } from "../../firebaseClient";
export interface Asset {
  currency: string;
  issuer: string;
}
export interface Transaction {
  id: string;
  action: "payment" | "trust" | "buy" | "sell";
  status: string;
  createdAt: number;
  hash?: string;
  error?: string | null;
  result?: {
    result: string;
    fee: string;
    tokenChange: string;
    tradeXrp: string;
    xrpChange: string;
    ledger: number;
  };
  asset?: Asset;
}
export interface Dashboard {
  network: "testnet";
  trader: string;
  receiver: string;
  provisioning: string;
  enabled: boolean;
  pending: string | null;
  wallet: {
    funded: boolean;
    balance?: string;
    reserve?: string;
    available?: string;
    ledger?: number;
    at?: number;
    error?: string;
    reason?: string;
    lines?: { currency: string; account: string; balance: string }[];
  };
  market: null | {
    asset?: Asset;
    symbol?: string;
    eligible: boolean;
    reason: string;
    source: string;
    at: number;
    ledger?: number;
    bid?: string;
    ask?: string;
    spread?: string;
    buyDepth?: string;
    sellDepth?: string;
  };
  run: null | { completed: number; status: string; sellAttempts: number };
  position: {
    quantity: string;
    cost: string;
    realized: string;
    tradingFees: string;
    setupFees: string;
  };
  health: { heartbeat?: number; lastSuccess?: number; error?: string };
  transactions: Transaction[];
}
export interface Cursor {
  at: number;
  id: string;
}
export interface History {
  transactions: Transaction[];
  cursor: Cursor | null;
}
async function call<T>(name: string, input: unknown = {}): Promise<T> {
  await verifyBrowser();
  return (await httpsCallable<unknown, T>(functions, name)(input)).data;
}
export const tradingApi = {
  dashboard: () => call<Dashboard>("testnetDashboard"),
  discover: () => call("testnetDiscover"),
  request: (action: Transaction["action"], requestId: string) =>
    call<Transaction>("testnetRequest", { action, requestId }),
  automation: (enabled: boolean) => call("testnetAutomation", { enabled }),
  history: (cursor: Cursor | null) =>
    call<History>("testnetHistory", { cursor }),
};
export const tradingError = (e: unknown) =>
  e instanceof Error
    ? e.message.replace(/^Firebase:\s*/, "")
    : "The request could not complete. Try again.";
