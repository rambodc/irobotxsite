import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Profile } from "../src/api";
import { canOpenApp, visibleMiniApps } from "../src/portal/miniApps";
const mocks = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock("../src/api", () => ({
  api: { profile: mocks.profile },
  errorMessage: () => "Access denied",
}));
vi.mock("../src/firebaseClient", () => ({
  auth: { currentUser: { uid: "owner" } },
  verifyBrowser: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a: unknown, fn: () => void) => {
    queueMicrotask(fn);
    return () => {};
  },
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));
vi.mock("../src/App", () => ({
  Link: ({ to, children, ...p }: React.PropsWithChildren<{ to: string }>) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
  Logo: () => <span>iRobotX</span>,
  Mark: () => <span />,
  navigate: vi.fn(),
}));
vi.mock("../src/mini-apps/trading/TradingApp", () => ({
  default: () => <div>Private trading app</div>,
}));
import Portal from "../src/Portal";
const owner: Profile = {
  uid: "owner",
  email: "owner@example.com",
  name: "Rambod",
  company: "iRobotX",
  role: "admin",
  status: "active",
  apps: ["fintech"],
  miniApps: ["account", "contact-team", "user-access", "trading"],
};
afterEach(cleanup);
describe("mini app registry and portal", () => {
  it("preserves owner-only trading and existing role visibility", () => {
    expect(visibleMiniApps(owner)).toHaveLength(5);
    expect(canOpenApp(owner, "qb-chem")).toBe(true);
    const other = { ...owner, miniApps: [] };
    expect(canOpenApp(other, "trading")).toBe(false);
    expect(canOpenApp(other, "user-access")).toBe(true);
    expect(canOpenApp({ ...other, role: "member" }, "user-access")).toBe(false);
    expect(canOpenApp({ ...other, role: "member" }, "qb-chem")).toBe(false);
    expect(canOpenApp(other, "qb-chem")).toBe(true);
    expect(visibleMiniApps({ ...owner, status: "disabled" })).toHaveLength(0);
  });
  it("renders the authenticated launcher with standalone app destinations", async () => {
    mocks.profile.mockResolvedValue(owner);
    render(<Portal path="/portal" />);
    await screen.findByRole("region", { name: "Your mini apps" });
    expect(
      screen.getByRole("link", { name: /XRP Trading/ }).getAttribute("href"),
    ).toBe("/portal/trading");
    expect(
      screen.getByRole("link", { name: /Account Your/ }).getAttribute("href"),
    ).toBe("/portal/account");
    expect(screen.queryByText("On the horizon.")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
  it("guards a direct trading URL for another administrator", async () => {
    mocks.profile.mockResolvedValue({
      ...owner,
      miniApps: ["account", "user-access"],
    });
    render(<Portal path="/portal/trading" />);
    await screen.findByText("This app is not available to your account.");
    expect(screen.queryByText("Private trading app")).toBeNull();
  });
  it("opens Trading under the common shell with a return-to-launcher control", async () => {
    mocks.profile.mockResolvedValue(owner);
    render(<Portal path="/portal/trading" />);
    await screen.findByText("Private trading app");
    expect(
      screen
        .getByRole("link", { name: "Back to mini apps" })
        .getAttribute("href"),
    ).toBe("/portal");
  });
  it("shows no mini-app content on an unauthorized profile failure", async () => {
    mocks.profile.mockRejectedValue(new Error("access"));
    render(<Portal path="/portal/trading" />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Go to sign in" })).toBeTruthy(),
    );
    expect(screen.queryByText("Private trading app")).toBeNull();
  });
});
