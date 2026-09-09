import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import nodemailer from "nodemailer";
import { createHash, randomBytes } from "node:crypto";
import {
  email,
  text,
  apps,
  assertAccess,
  assertLastAdmin,
  publicProfile,
  contactInput,
} from "./policy.js";
initializeApp();
const db = getFirestore(),
  auth = getAuth();
const smtpConfig = defineSecret("SMTP_CONFIG");
const base = {
  // Emulator integration tests remain isolated from Google's attestation service.
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  region: "us-central1",
  maxInstances: 2,
  minInstances: 0,
  timeoutSeconds: 60,
  memory: "256MiB",
  cors: [
    "https://irobotx.io",
    "https://www.irobotx.io",
    /^https:\/\/irobotxsite(?:--[a-z0-9-]+)?\.web\.app$/,
    "https://irobotxsite.firebaseapp.com",
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
  ],
};
const mailBase = { ...base, secrets: [smtpConfig] };
const hash = (v) => createHash("sha256").update(v).digest("hex");
const now = () => FieldValue.serverTimestamp();
function endpoint(options, fn) {
  return onCall(options, async (request) => {
    try {
      return await fn(request);
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (
        [
          "invalid-argument",
          "permission-denied",
          "failed-precondition",
        ].includes(e.message)
      )
        throw new HttpsError(
          e.message,
          e.message === "failed-precondition"
            ? "The last active administrator cannot be disabled."
            : "Request could not be accepted.",
        );
      console.error("Operation failed", { code: e.code || "internal" });
      throw new HttpsError("internal", "The request could not be completed.");
    }
  });
}
async function current(request, admin = false) {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in required.");
  const bearer = request.rawRequest.headers.authorization?.replace(
    /^Bearer /,
    "",
  );
  if (!bearer) throw new HttpsError("unauthenticated", "Sign in required.");
  try {
    await auth.verifyIdToken(bearer, true);
  } catch {
    throw new HttpsError("unauthenticated", "Session expired.");
  }
  const user = await auth.getUser(request.auth.uid);
  if (user.disabled)
    throw new HttpsError("permission-denied", "Account disabled.");
  const ref = db.doc(`users/${user.uid}`);
  const snap = await ref.get();
  const p = snap.data();
  assertAccess(p, admin);
  return { uid: user.uid, ref, profile: p, user };
}
async function rate(request, scope, limit = 10, window = 3600000) {
  const key = hash(
    `${scope}:${request.rawRequest.ip || "unknown"}:${Math.floor(Date.now() / window)}`,
  );
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`rateLimits/${key}`);
    const snap = await tx.get(ref);
    const count = snap.data()?.count || 0;
    if (count >= limit)
      throw new HttpsError("resource-exhausted", "Please try later.");
    tx.set(ref, {
      count: count + 1,
      expiresAt: new Date(Date.now() + window * 2),
    });
  });
}
async function sendMail({ to, subject, body, replyTo }) {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    if (process.env.TEST_MAIL_FAILURE === "true")
      throw new Error("test-delivery-failure");
    return;
  }
  const settings = JSON.parse(smtpConfig.value());
  if (!settings.enabled || !settings.password)
    throw new Error("smtp-not-configured");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: settings.username || "info@irobotx.io",
      pass: settings.password,
    },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from: "iRobotX <info@irobotx.io>",
    to,
    subject,
    text: body,
    ...(replyTo ? { replyTo } : {}),
  });
}
async function actionLink(address, invite = false) {
  const generated = await auth.generatePasswordResetLink(address, {
    url: "https://irobotx.io/portal",
  });
  const source = new URL(generated);
  const target = new URL(
    invite
      ? "https://irobotx.io/accept-invite"
      : "https://irobotx.io/auth/action",
  );
  target.search = source.search;
  return target.toString();
}
async function deliverInvite(uid) {
  const ref = db.doc(`users/${uid}`);
  const profile = (await ref.get()).data();
  if (!profile || profile.status !== "invited")
    throw new HttpsError(
      "failed-precondition",
      "Only pending invitations can be resent.",
    );
  const lease = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const p = snap.data();
    if (
      p.invitationDelivery === "pending" &&
      p.invitationAttemptAt > Date.now() - 90000
    )
      return false;
    tx.update(ref, {
      invitationDelivery: "pending",
      invitationAttemptAt: Date.now(),
    });
    return true;
  });
  if (!lease) return { delivery: "pending" };
  try {
    const link = await actionLink(profile.email, true);
    await sendMail({
      to: profile.email,
      subject: "Your invitation to iRobotX",
      body: `Hello ${profile.name},\n\nYou have been invited to the iRobotX workspace. Set your password using this secure link:\n\n${link}\n\nIf this link has expired, request a new one from your administrator.\n\niRobotX\nhttps://irobotx.io`,
    });
    await ref.update({ invitationDelivery: "sent", invitationSentAt: now() });
    return { delivery: "sent" };
  } catch (e) {
    console.error("Invitation delivery failed", {
      uid,
      code: e.code || "mail-unavailable",
    });
    await ref.update({ invitationDelivery: "failed" });
    return { delivery: "failed" };
  }
}
export const getProfile = endpoint(base, async (request) => {
  const account = await current(request);
  if (account.profile.status === "invited") {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(account.ref);
      assertAccess(snap.data());
      if (snap.data().status === "invited")
        tx.update(account.ref, {
          status: "active",
          acceptedAt: now(),
          updatedAt: now(),
        });
    });
    account.profile = (await account.ref.get()).data();
  }
  return publicProfile(account.uid, account.profile);
});
export const updateProfile = endpoint(base, async (request) => {
  const a = await current(request);
  const changes = {
    name: text(request.data.name, 100),
    company: text(request.data.company || "", 120, false),
  };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(a.ref);
    assertAccess(snap.data());
    tx.update(a.ref, { ...changes, updatedAt: now() });
  });
  return publicProfile(a.uid, { ...a.profile, ...changes });
});
export const listUsers = endpoint(base, async (request) => {
  await current(request, true);
  const users = await db.collection("users").orderBy("email").limit(1000).get();
  return users.docs.map((doc) => publicProfile(doc.id, doc.data()));
});
export const inviteUser = endpoint(mailBase, async (request) => {
  const actor = await current(request, true);
  await rate(request, "invite", 30);
  const input = {
    email: email(request.data.email),
    name: text(request.data.name, 100),
    apps: apps(request.data.apps || []),
  };
  let user;
  try {
    user = await auth.getUserByEmail(input.email);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  if (user) {
    const existing = await db.doc(`users/${user.uid}`).get();
    if (existing.exists)
      throw new HttpsError("already-exists", "Account already exists.");
  } else {
    try {
      user = await auth.createUser({
        email: input.email,
        password: randomBytes(48).toString("base64url"),
        displayName: input.name,
      });
    } catch (e) {
      if (e.code === "auth/email-already-exists")
        throw new HttpsError("already-exists", "Account already exists.");
      throw e;
    }
  }
  // Reset any uninvited Auth-only account so prior credentials cannot activate this invitation.
  await auth.updateUser(user.uid, {
    password: randomBytes(48).toString("base64url"),
    disabled: false,
  });
  await auth.revokeRefreshTokens(user.uid);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${user.uid}`);
    const [target, admin] = await Promise.all([tx.get(ref), tx.get(actor.ref)]);
    assertAccess(admin.data(), true);
    if (target.exists)
      throw new HttpsError("already-exists", "Account already exists.");
    tx.create(ref, {
      ...input,
      company: "",
      role: "member",
      status: "invited",
      invitationDelivery: "pending",
      createdAt: now(),
      updatedAt: now(),
      invitedBy: actor.uid,
    });
    tx.create(db.collection("auditEvents").doc(), {
      actor: actor.uid,
      action: "invite",
      target: user.uid,
      at: now(),
    });
  });
  return deliverInvite(user.uid);
});
export const resendInvitation = endpoint(mailBase, async (request) => {
  await current(request, true);
  await rate(request, "resend", 20);
  return deliverInvite(text(request.data.uid, 128));
});
export const updateUser = endpoint(base, async (request) => {
  const actor = await current(request, true);
  const uid = text(request.data.uid, 128),
    assigned = apps(request.data.apps || []),
    status = request.data.status;
  if (!["active", "disabled"].includes(status))
    throw new HttpsError("invalid-argument", "Invalid status.");
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const [target, admin, admins] = await Promise.all([
      tx.get(ref),
      tx.get(actor.ref),
      tx.get(db.collection("users").where("role", "==", "admin")),
    ]);
    assertAccess(admin.data(), true);
    if (!target.exists) throw new HttpsError("not-found", "User not found.");
    const p = target.data();
    assertLastAdmin(
      p,
      status,
      admins.docs.filter((d) => d.data().status === "active").length,
    );
    const next =
      p.status === "invited" && status === "active" ? "invited" : status;
    tx.update(ref, { status: next, apps: assigned, updatedAt: now() });
    tx.create(db.collection("auditEvents").doc(), {
      actor: actor.uid,
      action: "update-access",
      target: uid,
      from: { status: p.status, apps: p.apps },
      to: { status: next, apps: assigned },
      at: now(),
    });
  });
  await auth.updateUser(uid, { disabled: status === "disabled" });
  if (status === "disabled") await auth.revokeRefreshTokens(uid);
  return publicProfile(uid, (await ref.get()).data());
});
export const requestPasswordReset = endpoint(mailBase, async (request) => {
  await rate(request, "reset", 5);
  const address = email(request.data.email);
  const found = await db
    .collection("users")
    .where("email", "==", address)
    .limit(1)
    .get();
  if (found.empty || found.docs[0].data().status === "disabled")
    return { ok: true };
  try {
    const link = await actionLink(
      address,
      found.docs[0].data().status === "invited",
    );
    await sendMail({
      to: address,
      subject: "Reset your iRobotX password",
      body: `Set a new password for your iRobotX account:\n\n${link}\n\nIf you did not request this email, you can ignore it.\n\niRobotX`,
    });
  } catch (e) {
    console.error("Password email delivery failed", {
      code: e.code || "mail-unavailable",
    });
  }
  return { ok: true };
});
export const submitContact = endpoint(mailBase, async (request) => {
  await rate(request, "contact", 10);
  if (request.data.website)
    throw new HttpsError("invalid-argument", "Invalid submission.");
  const input = contactInput(request.data);
  const fingerprint = hash(JSON.stringify(input));
  const id = hash(`${request.data.requestId}:${input.email}`);
  const ref = db.doc(`contactSubmissions/${id}`);
  const acquired = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const prior = snap.data();
      if (prior.fingerprint !== fingerprint)
        throw new HttpsError(
          "invalid-argument",
          "Retry must contain the same message.",
        );
      if (prior.delivery === "sent") return "sent";
      if (prior.delivery === "pending" && prior.attemptAt > Date.now() - 90000)
        return "pending";
    }
    tx.set(
      ref,
      {
        ...input,
        fingerprint,
        delivery: "pending",
        attemptAt: Date.now(),
        updatedAt: now(),
        ...(snap.exists ? {} : { createdAt: now() }),
        uid: request.auth?.uid || null,
      },
      { merge: true },
    );
    return "send";
  });
  if (acquired !== "send") return { delivery: acquired, id };
  try {
    await sendMail({
      to: "info@irobotx.io",
      replyTo: input.email,
      subject: `iRobotX enquiry: ${input.industry}`,
      body: `Name: ${input.name}\nEmail: ${input.email}\nCompany: ${input.company || "Not provided"}\nIndustry: ${input.industry}\n\n${input.message}`,
    });
    await ref.update({ delivery: "sent", sentAt: now() });
    return { delivery: "sent", id };
  } catch (e) {
    console.error("Contact delivery failed", {
      id,
      code: e.code || "mail-unavailable",
    });
    await ref.update({ delivery: "failed" });
    return { delivery: "failed", id };
  }
});

export { demoChat } from './demo-ai.js';
