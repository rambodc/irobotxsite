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
    discover: vi.fn(),
    request: vi.fn(),
    automation: vi.fn(),
    history: vi.fn(),
  },
  tradingError: (e: Error) => e.message,
}));
const data = {
  network: "testnet",
  trader: "rTrader",
  receiver: "rReceiver",
  provisioning: "ready",
  enabled: false,
  pending: null,
  wallet: {
    funded: true,
    balance: "100",
    available: "99",
    reserve: "1",
    lines: [],
  },
  market: {
    symbol: "USD",
    asset: { currency: "USD", issuer: "rIssuer" },
    eligible: true,
    reason: "Eligible test market",
    source: "Testnet",
    at: Date.now(),
  },
  run: null,
  position: {
    quantity: "0",
    cost: "0",
    realized: "0",
    tradingFees: "0",
    setupFees: "0",
  },
  health: {},
  transactions: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tradingApi.dashboard).mockResolvedValue(data as never);
  vi.mocked(tradingApi.history).mockResolvedValue({
    transactions: [],
    cursor: null,
  });
});
afterEach(cleanup);
describe("Testnet mini app", () => {
  it("labels test funds and ledger balances without paper trading", async () => {
    render(<TradingApp />);
    await screen.findByText("100 XRP");
    expect(screen.getByText("XRPL Testnet — test funds only")).toBeTruthy();
    expect(screen.queryByText("PAPER ONLY")).toBeNull();
  });
  it("uses fixed actions and request IDs instead of raw transactions", async () => {
    render(<TradingApp />);
    await screen.findByText("100 XRP");
    fireEvent.click(screen.getByText("Run Test"));
    fireEvent.click(screen.getByText("Send test payment"));
    await waitFor(() =>
      expect(tradingApi.request).toHaveBeenCalledWith(
        "payment",
        expect.any(String),
      ),
    );
  });
  it("exposes pause while a submitted trade is pending", async () => {
    vi.mocked(tradingApi.dashboard).mockResolvedValue({
      ...data,
      enabled: true,
      pending: "pending123",
      transactions: [
        { id: "pending123", action: "buy", status: "submitted", createdAt: 1 },
      ],
    } as never);
    render(<TradingApp />);
    await screen.findByText(/Waiting for validation/);
    fireEvent.click(screen.getByText("Run Test"));
    fireEvent.click(screen.getByText("Pause run"));
    await waitFor(() =>
      expect(tradingApi.automation).toHaveBeenCalledWith(false),
    );
  });
  it("displays issuer identity with explicit test asset label", async () => {
    render(<TradingApp />);
    await screen.findByText("100 XRP");
    fireEvent.click(screen.getByText("Market"));
    expect(screen.getByText("TEST ASSET")).toBeTruthy();
    expect(screen.getByText("rIssuer")).toBeTruthy();
  });
  it("never displays pending as validated", async () => {
    vi.mocked(tradingApi.dashboard).mockResolvedValue({
      ...data,
      pending: "pending123",
      transactions: [
        { id: "pending123", action: "buy", status: "pending", createdAt: 1 },
      ],
    } as never);
    render(<TradingApp />);
    await screen.findByText(/Waiting for validation/);
    expect(screen.queryByText("tesSUCCESS")).toBeNull();
  });
});
