process.env.GOOGLE_CLOUD_QUOTA_PROJECT = "irobotxsite";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp({
  projectId: "irobotxsite",
  credential: {
    getAccessToken: async () => ({
      access_token: execFileSync("gcloud", ["auth", "print-access-token"], {
        encoding: "utf8",
      }).trim(),
      expires_in: 3500,
    }),
  },
});
const email = "rambodc@irobotx.io",
  auth = getAuth();
let user;
try {
  user = await auth.getUserByEmail(email);
} catch (e) {
  if (e.code !== "auth/user-not-found") throw e;
  user = await auth.createUser({
    email,
    password: randomBytes(48).toString("base64url"),
    displayName: "Rambod",
  });
}
const token = execFileSync("gcloud", ["auth", "print-access-token"], {
  encoding: "utf8",
}).trim();
const endpoint = `https://firestore.googleapis.com/v1/projects/irobotxsite/databases/(default)/documents/users/${user.uid}`;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
const existing = await fetch(endpoint, { headers });
if (existing.status === 404) {
  const str = (value) => ({ stringValue: value });
  const fields = {
    email: str(email),
    name: str("Rambod"),
    company: str("iRobotX"),
    role: str("admin"),
    status: str("active"),
    apps: {
      arrayValue: { values: ["oil-gas", "robotics", "fintech"].map(str) },
    },
    createdAt: { timestampValue: new Date().toISOString() },
    updatedAt: { timestampValue: new Date().toISOString() },
  };
  const created = await fetch(endpoint + "?currentDocument.exists=false", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!created.ok)
    throw new Error(`Profile creation failed: ${created.status}`);
  console.log("Initial administrator provisioned.");
} else if (existing.ok)
  console.log("Existing administrator profile preserved.");
else throw new Error(`Profile lookup failed: ${existing.status}`);
if (process.argv.includes("--send-setup")) {
  const nodemailer = require("nodemailer");
  const settings = JSON.parse(
    execFileSync(
      "gcloud",
      [
        "secrets",
        "versions",
        "access",
        "latest",
        "--secret=SMTP_CONFIG",
        "--project=irobotxsite",
      ],
      { encoding: "utf8" },
    ),
  );
  if (!settings.enabled) throw new Error("Email is not configured.");
  const generated = new URL(
    await auth.generatePasswordResetLink(email, {
      url: "https://irobotx.io/portal",
    }),
  );
  const link = new URL("https://irobotx.io/accept-invite");
  link.search = generated.search;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: settings.username || "info@irobotx.io",
      pass: settings.password,
    },
  });
  await transport.sendMail({
    from: "iRobotX <info@irobotx.io>",
    to: email,
    subject: "Your iRobotX administrator account is ready",
    text: `Your iRobotX administrator workspace is ready. Set your password here:\n\n${link}\n\nYou can then invite users and manage app access at https://irobotx.io/portal/admin`,
  });
  console.log("Administrator setup email sent.");
}
