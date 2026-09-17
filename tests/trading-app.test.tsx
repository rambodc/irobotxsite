import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Dashboard } from "../src/mini-apps/trading/api";
const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  configure: vi.fn(),
  automation: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../src/mini-apps/trading/api", () => ({
  tradingApi: mocks,
  tradingError: (e: Error) => e.message,
}));
import TradingApp from "../src/mini-apps/trading/TradingApp";
const initial = (): Dashboard => ({
  config: {
    schemaVersion: 1,
    enabled: false,
    revision: 0,
    activePair: "xrp",
    pairs: [
      {
        id: "xrp",
        name: "XRP / RLUSD",
        base: { currency: "XRP", symbol: "XRP" },
        quote: { currency: "RLUSD", symbol: "RLUSD", issuer: "rExample" },
      },
    ],
    rules: {
      orderSize: 100,
      maxPosition: 1000,
      maxSpread: 0.5,
      threshold: 0.15,
      cooldown: 60,
    },
  },
  markets: [
    {
      pairId: "xrp",
      history: [],
      error: "Waiting for the next scheduled sample.",
    },
  ],
  portfolios: [
    {
      pairId: "xrp",
      cash: "10000",
      quantity: "0",
      cost: "0",
      fees: "0",
      realized: "0",
      equity: null,
      unrealized: null,
      totalPnl: null,
    },
  ],
  health: null,
});
let data: Dashboard;
beforeEach(() => {
  data = initial();
  mocks.dashboard.mockImplementation(async () => data);
  mocks.automation.mockImplementation(async (enabled: boolean) => {
    data = {
      ...data,
      config: { ...data.config, enabled, revision: data.config.revision + 1 },
    };
    return data.config;
  });
  mocks.configure.mockImplementation(async (change) => {
    data = {
      ...data,
      config: {
        ...data.config,
        rules: change.rules || data.config.rules,
        enabled: false,
        revision: data.config.revision + 1,
      },
    };
    return data.config;
  });
  mocks.history.mockResolvedValue({ trades: [], cursor: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("loads simulated balance, WAIT status, and no fabricated market price", async () => {
  render(<TradingApp />);
  await screen.findByRole("button", { name: "Start paper trading" });
  expect(screen.getByText("10,000")).toBeTruthy();
  expect(screen.getByText("WAIT")).toBeTruthy();
  expect(screen.getByText(/No wallet is connected/)).toBeTruthy();
});
it("Start and Pause call the backend and reflect confirmed state", async () => {
  render(<TradingApp />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Start paper trading" }),
  );
  await screen.findByRole("button", { name: "Pause trading" });
  expect(mocks.automation).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "Pause trading" }));
  await screen.findByRole("button", { name: "Start paper trading" });
  expect(mocks.automation).toHaveBeenLastCalledWith(false);
});
it("strategy changes save settings and pause", async () => {
  render(<TradingApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Strategy" }));
  fireEvent.change(screen.getByLabelText(/Momentum threshold/), {
    target: { value: "0.25" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save settings & pause" }),
  );
  await waitFor(() =>
    expect(mocks.configure).toHaveBeenCalledWith({
      action: "rules",
      rules: { ...initial().config.rules, threshold: 0.25 },
    }),
  );
  await screen.findByText("Settings saved. Paper automation is paused.");
});
it("custom pair input passes currency and issuer separately", async () => {
  render(<TradingApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Markets" }));
  fireEvent.change(screen.getByLabelText("Currency code"), {
    target: { value: "USD" },
  });
  fireEvent.change(screen.getByLabelText("Issuer address"), {
    target: { value: "rIssuer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
  await waitFor(() =>
    expect(mocks.configure).toHaveBeenCalledWith({
      action: "addPair",
      base: { currency: "USD", issuer: "rIssuer" },
      quote: "XRP",
    }),
  );
});
it("history has a clear empty state and disabled pagination", async () => {
  render(<TradingApp />);
  fireEvent.click(await screen.findByRole("button", { name: "History" }));
  await screen.findByText("No simulated trades yet.");
  expect(
    (screen.getByRole("button", { name: "Next" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("a failed pause keeps the confirmed running status and shows the error", async () => {
  data.config.enabled = true;
  mocks.automation.mockRejectedValue(new Error("Connection interrupted"));
  render(<TradingApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Pause trading" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Pause trading" })).toBeTruthy();
  expect(screen.getByText("Connection interrupted")).toBeTruthy();
});
