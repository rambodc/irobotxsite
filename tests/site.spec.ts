import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Public pages work at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [route, heading] of [
      ["/", "AI-powered software"],
      ["/about", "Technology that understands"],
      ["/demo", "See what we could build"],
      ["/contact", "Your operation."],
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toContainText(heading);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const img of await page.locator("picture img").all()) {
        await img.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            img.evaluate(
              (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
            ),
          )
          .toBe(true);
      }
      await page.evaluate(() => scrollTo(0, 0));
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
    page.getByRole("region", { name: "Oil & Gas visual concepts" }),
  ).toBeVisible();
  await expect(page.locator(".concept-card")).toHaveCount(3);
  await expect(page.getByText("Coming soon", { exact: true })).toHaveCount(2);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /motion|rotate/i }),
  ).toHaveCount(0);
  await expect(page.getByText(/These are illustrative concepts/)).toBeVisible();
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

test("About anchors, primary call to action and brand assets work", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Discuss your project" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/contact$/);
  for (const id of ["oil-gas", "robotics", "fintech"]) {
    await page.goto("/about#" + id);
    await expect(page.locator("#" + id)).toBeVisible();
    // Wait for fragment scrolling to finish before changing the next hash.
    await expect
      .poll(
        () => page.locator("#" + id).evaluate(el => Math.round(el.getBoundingClientRect().top)),
        { message: `Section ${id} should align below navigation` },
      )
      .toBe(110);
  }
  for (const path of [
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/brand/ix-blue.svg",
    "/og.png",
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/image/);
  }
});
