import { httpsCallable } from "firebase/functions";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { functions, verifyBrowser, auth } from "../../firebaseClient";
export interface Settings {
  pair: string;
  analysisMinutes: number;
  newsMinutes: number;
  purchase: string;
  positionCap: string;
  dailyPurchases: string;
  dailyLoss: string;
  stopLoss: string;
  takeProfit: string;
  spread: string;
  movement: string;
  aiBudget: string;
}
export interface Transaction {
  id: string;
  action: string;
  status: string;
  createdAt: number;
  hash?: string;
  error?: string;
  reason?: string;
  result?: {
    result: string;
    fee: string;
    tradeXrp: string;
    tokenChange: string;
    executionPrice: string | null;
    ledger: number;
  };
}
export interface Cursor {
  at: number;
  id: string;
}
export interface History {
  transactions: Transaction[];
  cursor: Cursor | null;
}
export interface Dashboard extends History {
  network: "mainnet";
  trader: string;
  provisioning: string;
  enabled: boolean;
  mode: "paused" | "running" | "closing";
  pending: string | null;
  settings: Settings;
  wallet: {
    funded: boolean;
    balance?: string;
    available?: string;
    reserve?: string;
    rlusd: string;
    trustReady: boolean;
    fundingMinimum: string;
    error?: string;
    reason?: string;
  };
  market: null | {
    bid?: string;
    ask?: string;
    spread?: string;
    buyDepth?: string;
    sellDepth?: string;
    eligible: boolean;
    reason: string;
    at: number;
    ledger?: number;
    source?: string;
    asset?: { issuer: string; currency: string };
  };
  pairs: { id: string; label: string }[];
  position: {
    quantity: string;
    cost: string;
    realized: string;
    tradingFees: string;
    setupFees: string;
  };
  unrealized: string | null;
  health: {
    heartbeat?: number;
    lastSuccess?: number;
    error?: string;
    analysisError?: string;
  };
  signal: { action: string; reason: string };
  analysis: null | {
    verdict: string;
    reason: string;
    sources: string[];
    at: number;
    expiresAt: number;
  };
  news: null | {
    at: number;
    articles: {
      url: string;
      title: string;
      publishedAt: string;
      summary: string;
    }[];
  };
  aiUsage: { day: string; spent: string };
  budget: { day: string; spent: string };
  nextAnalysisAt: number;
  nextNewsAt: number;
  returnAddress: null | { address: string; tag: number | null };
  discrepancy: unknown;
}
async function call<T>(name: string, input: unknown = {}): Promise<T> {
  await verifyBrowser();
  return (await httpsCallable<unknown, T>(functions, name)(input)).data;
}
export const tradingApi = {
  dashboard: () => call<Dashboard>("mainnetDashboard"),
  settings: (v: Settings) => call("mainnetSettings", v),
  automation: (mode: Dashboard["mode"]) => call("mainnetAutomation", { mode }),
  request: (
    action: "trust" | "withdraw",
    requestId: string,
    extra?: { amount: string; currency: string },
  ) => call<Transaction>("mainnetRequest", { action, requestId, ...extra }),
  history: (cursor: Cursor | null) =>
    call<History>("mainnetHistory", { cursor }),
  returnAddress: (address: string, tag: number | null) =>
    call("mainnetReturnAddress", { address, tag }),
  acknowledgeBalances: () => call("mainnetAcknowledgeBalances"),
  reauthenticate: async (password: string) => {
    const u = auth.currentUser;
    if (!u?.email)
      throw new Error("Sign in again to save your return address.");
    await reauthenticateWithCredential(
      u,
      EmailAuthProvider.credential(u.email, password),
    );
    await u.getIdToken(true);
  },
};
export const tradingError = (e: unknown) =>
  e instanceof Error
    ? e.message.replace(/^Firebase:\s*/, "")
    : "The request could not complete.";
