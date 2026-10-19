import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import QbChemApp from "../src/mini-apps/qb-chem/QbChemApp";
import { containerStock, stockLine } from "../src/mini-apps/qb-chem/format";
import { createFixtureClient } from "../dev/qbchem/fixtures";

afterEach(cleanup);
const T = { timeout: 4000 };

describe("QB Chem formatting", () => {
  it("shows stock container-first", () => {
    const tote = { role: "finished" as const, baseUnit: "L" as const, containerType: "tote" as const, containerCapacity: 1000, notes: "" };
    expect(stockLine(3000, tote)).toBe("3 totes · 3,000 L");
    expect(containerStock(1435, { ...tote, containerType: "drum", containerCapacity: 205 }).primary).toBe("7 drums");
    expect(containerStock(170, { ...tote, baseUnit: "kg", containerType: "pail", containerCapacity: 20 }).primary).toBe("8 pails + 10 kg");
    expect(containerStock(-5, tote).primary).toBe("Negative stock");
  });
});

describe("QB Chem app", () => {
  it("lists QuickBooks items with container stock and flags items without setup", async () => {
    render(<QbChemApp client={createFixtureClient()} />);
    const table = await screen.findByRole("table", { name: "Products and chemicals" }, T);
    expect(within(table).getByText("7 drums")).toBeTruthy();
    expect(within(table).getByText("3 totes")).toBeTruthy();
    expect(within(table).getAllByText("Needs setup")).toHaveLength(2);
    expect(within(table).queryByText(/UX Methanol/)).toBeNull();
    expect(screen.getByText(/Synced with QuickBooks/)).toBeTruthy();
  });

  it("warns about similar QuickBooks items before creating", async () => {
    render(<QbChemApp client={createFixtureClient()} />);
    fireEvent.click(await screen.findByRole("button", { name: /New product/ }, T));
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Methanol 99" } });
    fireEvent.blur(name);
    expect(await screen.findByText(/Looks similar to UX Methanol/, undefined, T)).toBeTruthy();
  });

  it("previews a run, blocks on short stock, and posts", async () => {
    render(<QbChemApp client={createFixtureClient()} initialSection="production" />);
    expect(await screen.findByText("Estimated cost", undefined, T)).toBeTruthy();
    const qty = screen.getByLabelText(/Quantity to produce/);
    fireEvent.change(qty, { target: { value: "2000" } });
    expect(await screen.findByText(/Can’t post yet/, undefined, T)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Post to QuickBooks/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(qty, { target: { value: "1000" } });
    await waitFor(() => expect(screen.queryByText(/Can’t post yet/)).toBeNull(), T);
    await waitFor(() => expect((screen.getByRole("button", { name: /Post to QuickBooks/ }) as HTMLButtonElement).disabled).toBe(false), T);
    fireEvent.click(screen.getByRole("button", { name: /Post to QuickBooks/ }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & post/ }));
    expect(await screen.findByText("Posted to QuickBooks", undefined, T)).toBeTruthy();
    expect(screen.getAllByText("Adj #203 consume").length).toBeGreaterThan(0);
  });
});
