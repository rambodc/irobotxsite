import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "../functions/node_modules/firebase-admin/lib/app/index.js";
import { getAuth } from "../functions/node_modules/firebase-admin/lib/auth/index.js";
import { getFirestore } from "../functions/node_modules/firebase-admin/lib/firestore/index.js";
initializeApp({ projectId: "demo-irobotx" });
const auth = getAuth(),
  db = getFirestore();
const password = "Testing-password-123!";
const base = "http://127.0.0.1:5001/demo-irobotx/us-central1/";
async function signIn(email, passwordValue = password) {
  const r = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: passwordValue,
        returnSecureToken: true,
      }),
    },
  );
  return (await r.json()).idToken;
}
async function call(name, data = {}, token) {
  const r = await fetch(base + name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  return r.json();
}
async function seed(email, role = "member", status = "active", profile = true) {
  const user = await auth.createUser({ email, password });
  if (profile)
    await db.doc("users/" + user.uid).set({
      email,
      name: "Test User",
      company: "Test",
      role,
      status,
      apps: [],
    });
  return { uid: user.uid, token: await signIn(email) };
}
const expectedDelivery =
  process.env.TEST_MAIL_FAILURE === "true" ? "failed" : "sent";
test("Firebase authorization, invitations, rules and mail lifecycle", async (t) => {
  const admin = await seed("admin@example.com", "admin");
  const member = await seed("member@example.com");
  const outsider = await seed(
    "outsider@example.com",
    "member",
    "active",
    false,
  );
  await t.test(
    "unauthenticated and uninvited users cannot read profiles",
    async () => {
      assert.equal((await call("getProfile")).error.status, "UNAUTHENTICATED");
      assert.equal(
        (await call("getProfile", {}, outsider.token)).error.status,
        "PERMISSION_DENIED",
      );
    },
  );
  await t.test(
    "members cannot invite, list users, or assign apps",
    async () => {
      for (const name of ["listUsers", "inviteUser", "updateUser"])
        assert.equal(
          (
            await call(
              name,
              {
                uid: member.uid,
                role: "admin",
                status: "active",
                apps: ["oil-gas"],
              },
              member.token,
            )
          ).error.status,
          "PERMISSION_DENIED",
        );
    },
  );
  await t.test("profile updates cannot elevate roles", async () => {
    const result = await call(
      "updateProfile",
      { name: "Updated", company: "Company", role: "admin", apps: ["oil-gas"] },
      member.token,
    );
    assert.equal(result.result.role, "member");
    assert.deepEqual(result.result.apps, []);
  });
  await t.test("last active admin is protected", async () => {
    assert.equal(
      (
        await call(
          "updateUser",
          { uid: admin.uid, status: "disabled", apps: [] },
          admin.token,
        )
      ).error.status,
      "FAILED_PRECONDITION",
    );
  });
  await t.test(
    "assignments and disabling take effect with existing tokens",
    async () => {
      assert.deepEqual(
        (
          await call(
            "updateUser",
            { uid: member.uid, status: "active", apps: ["oil-gas"] },
            admin.token,
          )
        ).result.apps,
        ["oil-gas"],
      );
      assert.deepEqual(
        (await call("getProfile", {}, member.token)).result.apps,
        ["oil-gas"],
      );
      await call(
        "updateUser",
        { uid: member.uid, status: "active", apps: [] },
        admin.token,
      );
      assert.deepEqual(
        (await call("getProfile", {}, member.token)).result.apps,
        [],
      );
      await call(
        "updateUser",
        { uid: member.uid, status: "disabled", apps: [] },
        admin.token,
      );
      assert.ok((await call("getProfile", {}, member.token)).error);
    },
  );
  await t.test(
    "invitation creation, duplicate prevention and password setup",
    async () => {
      const result = await call(
        "inviteUser",
        { email: "invited@example.com", name: "Invited", apps: ["robotics"] },
        admin.token,
      );
      assert.equal(result.result.delivery, expectedDelivery);
      assert.equal(
        (
          await call(
            "inviteUser",
            { email: "invited@example.com", name: "Invited", apps: [] },
            admin.token,
          )
        ).error.status,
        "ALREADY_EXISTS",
      );
      const user = await auth.getUserByEmail("invited@example.com");
      assert.equal(
        (await db.doc("users/" + user.uid).get()).data().status,
        "invited",
      );
      const link = await auth.generatePasswordResetLink(user.email);
      const oobCode = new URL(link).searchParams.get("oobCode");
      const endpoint =
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=fake";
      const reset = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode, newPassword: password }),
      });
      assert.equal(reset.status, 200);
      const reused = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode, newPassword: password }),
      });
      assert.equal(reused.status, 400);
      const token = await signIn(user.email);
      const profile = await call("getProfile", {}, token);
      assert.equal(profile.result.status, "active");
      assert.deepEqual(profile.result.apps, ["robotics"]);
    },
  );
  await t.test(
    "contact delivery is explicit, retry safe, and stored",
    async () => {
      const input = {
        name: "Test",
        email: "test@example.com",
        company: "",
        industry: "Oil & Gas",
        message: "Automated emulator test only.",
        website: "",
        requestId: randomUUID(),
      };
      const result = await call("submitContact", input);
      assert.equal(result.result.delivery, expectedDelivery);
      assert.equal(
        (await db.doc("contactSubmissions/" + result.result.id).get()).data()
          .delivery,
        expectedDelivery,
      );
      assert.equal(
        (await call("submitContact", input)).result.id,
        result.result.id,
      );
      assert.equal(
        (
          await call("submitContact", {
            ...input,
            message: "Different content for same id",
          })
        ).error.status,
        "INVALID_ARGUMENT",
      );
      assert.equal(
        (await call("submitContact", { ...input, website: "spam" })).error
          .status,
        "INVALID_ARGUMENT",
      );
    },
  );
  await t.test(
    "direct Firestore reads and writes are denied even for administrators",
    async () => {
      for (const token of [null, admin.token, outsider.token]) {
        const headers = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const url = `http://127.0.0.1:8080/v1/projects/demo-irobotx/databases/(default)/documents/users/${admin.uid}`;
        assert.equal((await fetch(url, { headers })).status, 403);
        assert.equal(
          (
            await fetch(url, {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                fields: { role: { stringValue: "admin" } },
              }),
            })
          ).status,
          403,
        );
      }
    },
  );
  await t.test(
    "password recovery does not disclose account existence and is rate limited",
    async () => {
      assert.deepEqual(
        (await call("requestPasswordReset", { email: "missing@example.com" }))
          .result,
        { ok: true },
      );
      assert.deepEqual(
        (await call("requestPasswordReset", { email: "admin@example.com" }))
          .result,
        { ok: true },
      );
      for (let i = 0; i < 3; i++)
        await call("requestPasswordReset", { email: "missing@example.com" });
      assert.equal(
        (await call("requestPasswordReset", { email: "missing@example.com" }))
          .error.status,
        "RESOURCE_EXHAUSTED",
      );
    },
  );
  await t.test(
    "portal browser: login, account edit, admin invitations and member restrictions",
    async () => {
      const server = spawn(
        process.execPath,
        [
          "node_modules/vite/bin/vite.js",
          "--host",
          "127.0.0.1",
          "--port",
          "5180",
        ],
        { env: { ...process.env, VITE_EMULATORS: "true" }, stdio: "ignore" },
      );
      let browser, page;
      try {
        for (let i = 0; i < 60; i++) {
          try {
            if ((await fetch("http://127.0.0.1:5180")).ok) break;
          } catch {}
          await new Promise((r) => setTimeout(r, 250));
        }
        browser = await chromium.launch();
        page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        });
        page.setDefaultTimeout(15000);
        await page.goto("http://127.0.0.1:5180/signin");
        await page
          .getByLabel("Email address", { exact: true })
          .fill("admin@example.com");
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await page.getByRole("heading", { name: "Welcome, Test." }).waitFor();
        await page.screenshot({ path: "/tmp/irobotx-admin-portal.png" });
        await page
          .getByRole("navigation", { name: "Workspace navigation" })
          .getByRole("link", { name: "Account", exact: true })
          .click();
        await page.getByLabel("Full name").fill("Admin Updated");
        await page.getByRole("button", { name: "Save changes" }).click();
        await page.getByText("Your account has been updated.").waitFor();
        await page
          .getByRole("link", { name: "User access", exact: true })
          .click();
        await page.getByLabel("Full name").fill("Browser Invite");
        await page
          .getByLabel("Email address", { exact: true })
          .fill("browser-invite@example.com");
        await page.getByRole("button", { name: "Send invitation" }).click();
        await page
          .getByText(
            expectedDelivery === "sent"
              ? "Invitation sent."
              : "Account created; invitation email is not yet delivered. Use Resend after checking email setup.",
            { exact: true },
          )
          .waitFor();
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await page.waitForURL("**/signin");
        await page
          .getByLabel("Email address", { exact: true })
          .fill("invited@example.com");
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Welcome, Invited." })
          .waitFor()
          .catch(async (error) => {
            console.log(
              "Portal failure state:",
              await page.locator("body").innerText(),
            );
            throw error;
          });
        assert.equal(
          await page
            .getByRole("link", { name: "User access", exact: true })
            .count(),
          0,
        );
        await page.goto("http://127.0.0.1:5180/portal/admin");
        await page.getByText("Administrator access is required.").waitFor();
      } finally {
        await browser?.close();
        server.kill();
      }
    },
  );
});
