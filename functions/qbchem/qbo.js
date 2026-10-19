/**
 * QuickBooks Online client for QB Chem.
 * Token owner: Firestore qbChem/_meta/qboConnection (Functions refreshes & writes).
 * Client id/secret: Secret Manager via defineSecret values passed in.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const MINOR = 75;

const baseFor = (env) =>
  env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

const connRef = () =>
  getFirestore().doc("qbChemConfig/connection");

export function authorizeUrl({ clientId, redirectUri, state, scope = "com.intuit.quickbooks.accounting" }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
  });
  return `${AUTH_URL}?${q}`;
}

export async function exchangeCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return tokenRequest(clientId, clientSecret, body);
}

async function tokenRequest(clientId, clientSecret, body) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = new Error("qbo-token-failed");
    err.code = `qbo-${res.status}`;
    throw err;
  }
  return res.json();
}

export async function saveConnection(partial) {
  const ref = connRef();
  await ref.set(
    {
      ...partial,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getConnection() {
  const snap = await connRef().get();
  if (!snap.exists) return null;
  return snap.data();
}

/** Public-safe connection status (no tokens). */
export function publicConnection(data) {
  if (!data) return { connected: false };
  return {
    connected: Boolean(data.refreshToken && data.realmId),
    env: data.env || "sandbox",
    realmId: data.realmId || null,
    companyName: data.companyName || null,
    connectedAt: data.connectedAt || null,
  };
}

async function refreshIfNeeded(clientId, clientSecret, conn) {
  const skewMs = 5 * 60 * 1000;
  if (
    conn.accessToken &&
    conn.expiresAt &&
    Date.now() < Number(conn.expiresAt) - skewMs
  ) {
    return conn;
  }
  if (!conn.refreshToken) throw new Error("qbo-not-connected");
  const tokens = await tokenRequest(
    clientId,
    clientSecret,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
    }),
  );
  const next = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || conn.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    tokenType: tokens.token_type || "bearer",
  };
  await saveConnection(next);
  return { ...conn, ...next };
}

export async function qboCall({
  clientId,
  clientSecret,
  method = "GET",
  path,
  body,
}) {
  let conn = await getConnection();
  if (!conn?.realmId) throw new Error("qbo-not-connected");
  conn = await refreshIfNeeded(clientId, clientSecret, conn);
  const base = baseFor(conn.env || "sandbox");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}/v3/company/${conn.realmId}/${path}${sep}minorversion=${MINOR}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error("qbo-api-error");
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function qboQuery(creds, query) {
  return qboCall({
    ...creds,
    method: "GET",
    path: `query?query=${encodeURIComponent(query)}`,
  });
}

export async function createInventoryAdjustment(creds, payload) {
  return qboCall({
    ...creds,
    method: "POST",
    path: "inventoryadjustment",
    body: payload,
  });
}

export async function createJournalEntry(creds, payload) {
  return qboCall({
    ...creds,
    method: "POST",
    path: "journalentry",
    body: payload,
  });
}

export async function createAccount(creds, payload) {
  return qboCall({
    ...creds,
    method: "POST",
    path: "account",
    body: payload,
  });
}

export async function createItem(creds, payload) {
  return qboCall({
    ...creds,
    method: "POST",
    path: "item",
    body: payload,
  });
}

export async function updateItem(creds, payload) {
  return qboCall({
    ...creds,
    method: "POST",
    path: "item",
    body: payload,
  });
}

export async function getItem(creds, id) {
  return qboCall({
    ...creds,
    method: "GET",
    path: `item/${id}`,
  });
}

export async function getAccount(creds, id) {
  return qboCall({
    ...creds,
    method: "GET",
    path: `account/${id}`,
  });
}

export async function getCompanyInfo(creds, realmId) {
  return qboCall({
    ...creds,
    method: "GET",
    path: `companyinfo/${realmId}`,
  });
}
