import { existsSync, readFileSync } from "node:fs";
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
      ["/", "Technology for the industries of tomorrow."],
      ["/about", "Helping organizations adopt the technologies shaping four industries."],
      ["/contact", "Tell us what you want to build."],
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
    .getByRole("link", { name: "About" })
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
test("header has no sign-in or project button; contact page links to client sign-in", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign.?in/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /demo/i })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: /start a project/i })).toHaveCount(0);
    if (width === 390) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const menu = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(menu.getByRole("link")).toHaveText(["Home", "About", "Contact"]);
      await expect(menu.getByRole("link", { name: /sign.?in/i })).toHaveCount(0);
      await page.getByRole("button", { name: "Close navigation" }).click();
    }
  }
  await page.goto("/contact");
  await page.getByRole("link", { name: "Client sign-in" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
});
test("the demo page is gone", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.locator("h1")).not.toHaveText("Demo");
  await expect(page.getByRole("navigation", { name: "Employee apps" })).toHaveCount(0);
  if (!existsSync("dist/sitemap.xml")) return;
  const sitemap = readFileSync("dist/sitemap.xml", "utf8");
  expect(sitemap).not.toContain("/demo");
  expect(sitemap).toContain("<lastmod>");
  expect(sitemap).toContain("/about");
  expect(sitemap).toContain("/contact");
});
for (const [route, title, h1] of [
  ["/about", "About iRobotX", "Helping organizations adopt the technologies shaping four industries."],
  ["/contact", "Contact iRobotX", "Tell us what you want to build."],
]) {
  test(`${route} has unique SEO metadata`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveTitle(new RegExp(title));
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(h1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://irobotx.io${route}`);
    for (const sel of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="twitter:title"]'])
      await expect(page.locator(sel)).toHaveAttribute("content", /\S/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", new RegExp(title));
    if (route === "/about")
      for (const name of ["Robotics", "FinTech", "Oil & Gas", "Entertainment"])
        await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
  });
}
test("built pages ship complete SEO in static HTML", async () => {
  test.skip(!existsSync("dist/about.html"), "run `npm run build` first");
  const titles = new Set<string>();
  for (const [route, file] of [["/", "index"], ["/about", "about"], ["/contact", "contact"]]) {
    const html = readFileSync(`dist/${file}.html`, "utf8");
    const one = (re: RegExp) => html.match(re)?.[1];
    const title = one(/<title>([^<]+)<\/title>/);
    expect(title, route).toBeTruthy();
    titles.add(title!);
    expect(one(/<meta\s+name="description"\s+content="([^"]+)"/), route).toBeTruthy();
    expect(one(/<link\s+rel="canonical"\s+href="([^"]+)"/)).toBe(`https://irobotx.io${route}`);
    expect(one(/<meta\s+property="og:url"\s+content="([^"]+)"/)).toBe(`https://irobotx.io${route}`);
    expect(one(/<meta\s+property="og:image"\s+content="([^"]+)"/)).toBe("https://irobotx.io/og.png");
    expect(one(/<meta\s+property="og:image:width"\s+content="([^"]+)"/)).toBe("1200");
    expect(one(/<meta\s+name="twitter:card"\s+content="([^"]+)"/)).toBe("summary_large_image");
    expect(html.match(/<h1[\s>]/g)?.length, route).toBe(1);
    expect((html.match(/<h2[\s>]/g)?.length ?? 0) >= 1, route).toBe(true);
    const data = JSON.parse(one(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)!);
    const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain(route === "/about" ? "AboutPage" : route === "/contact" ? "ContactPage" : "WebPage");
    if (route === "/") expect(types).toContain("WebSite");
  }
  expect(titles.size).toBe(3);
  for (const file of ["signin", "portal", "portal/admin", "auth/action"]) {
    const html = readFileSync(`dist/${file}.html`, "utf8");
    expect(html).toContain('name="robots" content="noindex');
    expect(html).not.toContain('rel="canonical"');
  }
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
  await page.getByRole("link", { name: "Start a project" }).first().click();
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

test("home falls back to a static page with every industry when WebGL is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Technology for the industries of tomorrow.");
  await expect(page.locator("canvas")).toHaveCount(0);
  for (const name of ["Robotics", "FinTech", "Oil & Gas", "Entertainment"])
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: "Start a project" }).first()).toHaveAttribute("href", "/contact");
});

test.describe("immersive home", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ])
    test(`3D tour renders and chapters can be selected at ${viewport.width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator(".x-canvas canvas")).toHaveCount(1);
      await expect(page.locator("h1")).toContainText("Technology for the industries of tomorrow.");
      const stage = page.locator(".x-stage");
      for (const [index, name] of ["Robotics", "FinTech", "Oil & Gas", "Entertainment"].entries()) {
        await page.getByRole("button", { name, exact: true }).click();
        await expect(stage).toHaveAttribute("data-chapter", String(index + 1));
        await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
        await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-current", "step");
      }
      await page.getByRole("button", { name: "iRobotX Core", exact: true }).click();
      await expect(page.locator("h1")).toBeVisible();
      await page.waitForTimeout(950);
      await page.keyboard.press("ArrowDown");
      await expect(stage).toHaveAttribute("data-chapter", "1");
      await expect(page.locator("#main").getByRole("link", { name: "Start a project" })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
});
