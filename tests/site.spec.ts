import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Public pages work at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [route, heading] of [
      ["/", "Intelligence"],
      ["/about", "Curiosity"],
      ["/demo", "A window"],
      ["/contact", "Great work"],
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toContainText(heading);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/${viewport.width}-${route.replace("/", "") || "home"}.png`,
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
}
test("mobile navigation, sign in and private-route guard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "About us" })
    .click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toHaveCount(0);
  await page.goto("/portal/admin");
  await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  await page.goto("/signin");
  await expect(
    page.getByRole("textbox", { name: "Email address" }),
  ).toBeVisible();
  await expect(page.getByText("Access is by invitation.")).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.locator("h1")).toHaveText("A fresh start.");
});
test("reduced motion and unavailable WebGL preserve content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/demo");
  await expect(
    page.getByLabel("Conceptual connected industrial system"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reduced motion enabled" }),
  ).toBeDisabled();
  await expect(page.locator("h1")).toBeVisible();
});
test("invalid invitation and contact validation are usable", async ({
  page,
}) => {
  await page.goto("/accept-invite?oobCode=invalid");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Request a new link" }),
  ).toBeVisible();
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send message" }).click();
  expect(
    await page
      .locator('input[name="name"]')
      .evaluate((e: HTMLInputElement) => e.validity.valueMissing),
  ).toBe(true);
});
