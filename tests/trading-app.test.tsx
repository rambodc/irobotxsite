import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import TradingApp from "../src/mini-apps/trading/TradingApp";
import { tradingApi } from "../src/mini-apps/trading/api";
vi.mock("../src/mini-apps/trading/api", () => ({
  tradingApi: {
    dashboard: vi.fn(),
    settings: vi.fn(),
    request: vi.fn(),
    automation: vi.fn(),
    history: vi.fn(),
    returnAddress: vi.fn(),
    reauthenticate: vi.fn(),
    acknowledgeBalances: vi.fn(),
  },
  tradingError: (e: Error) => e.message,
}));
const data = {
  network: "mainnet",
  trader: "rTrader",
  enabled: false,
  mode: "paused",
  pending: null,
  settings: {
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
  },
  wallet: {
    funded: true,
    balance: "7",
    rlusd: "50",
    available: "5.8",
    reserve: "1.2",
    trustReady: true,
    fundingMinimum: "6.22",
  },
  pairs: [{ id: "XRP-RLUSD", label: "XRP / RLUSD" }],
  market: { eligible: true, reason: "Validated funded book.", at: Date.now() },
  position: {
    quantity: "0",
    cost: "0",
    realized: "0",
    tradingFees: "0",
    setupFees: "0",
  },
  health: {},
  signal: { action: "WAIT", reason: "Warming up" },
  analysis: null,
  news: null,
  aiUsage: { day: "", spent: "0" },
  budget: { day: "", spent: "0" },
  transactions: [],
  nextAnalysisAt: 0,
  nextNewsAt: 0,
  returnAddress: null,
  discrepancy: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tradingApi.dashboard).mockResolvedValue(
    structuredClone(data) as never,
  );
  vi.mocked(tradingApi.history).mockResolvedValue({
    transactions: [],
    cursor: null,
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Mainnet trading workspace", () => {
  it("labels real money and defaults to stopped", async () => {
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    expect(screen.getByText("XRPL Mainnet — real funds")).toBeTruthy();
    expect(screen.getByText("Automation stopped")).toBeTruthy();
  });
  it("Start requires explicit confirmation", async () => {
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    fireEvent.click(screen.getByText("Start"));
    await waitFor(() =>
      expect(tradingApi.automation).toHaveBeenCalledWith("running"),
    );
    expect(window.confirm).toHaveBeenCalled();
  });
  it("cancelled Start never calls backend", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    fireEvent.click(screen.getByText("Start"));
    expect(tradingApi.automation).not.toHaveBeenCalled();
  });
  it("Pause is distinct from closing and works while a transaction is pending", async () => {
    vi.mocked(tradingApi.dashboard).mockResolvedValue({
      ...data,
      pending: "queued",
      enabled: true,
      mode: "running",
    } as never);
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    fireEvent.click(screen.getByText("Pause"));
    await waitFor(() =>
      expect(tradingApi.automation).toHaveBeenCalledWith("paused"),
    );
  });
  it("settings expose minutes and amounts and pause when saved", async () => {
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    fireEvent.click(screen.getByText("Automation"));
    fireEvent.change(screen.getByLabelText("AI / entry check (minutes)"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByText("Save settings & pause"));
    await waitFor(() =>
      expect(tradingApi.settings).toHaveBeenCalledWith(
        expect.objectContaining({ analysisMinutes: 30, purchase: "10" }),
      ),
    );
  });
  it("shows explanations and API usage in Analysis", async () => {
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    fireEvent.click(screen.getByText("Analysis"));
    expect(screen.getByText("AI entry review")).toBeTruthy();
    expect(screen.getByText("News research has not completed.")).toBeTruthy();
  });
  it("history uses validated outcomes and paginated interface", async () => {
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    fireEvent.click(screen.getByText("Activity"));
    await waitFor(() => expect(tradingApi.history).toHaveBeenCalledWith(null));
    expect(screen.getByText("No Mainnet transactions yet.")).toBeTruthy();
  });
  it("unfunded wallet cannot start", async () => {
    vi.mocked(tradingApi.dashboard).mockResolvedValue({
      ...data,
      wallet: { ...data.wallet, funded: false },
    } as never);
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    expect((screen.getByText("Start") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it("withdrawals remain disabled without a saved return address", async () => {
    render(<TradingApp />);
    await screen.findByText("7 XRP");
    fireEvent.change(screen.getByLabelText("Withdrawal amount"), {
      target: { value: "1" },
    });
    expect(
      (screen.getByText("Review withdrawal") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
