// QuickBooks Online REST client. Tokens live ONLY in Firestore
// qbChemConfig/connection; refresh happens inside a transaction so the rotated
// refresh token is written back exactly once (single token owner).
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const MINOR_VERSION = 75;
const API = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};
export const CONNECTION_DOC = "qbChemConfig/connection";

export class QboError extends Error {
  constructor(status, body) {
    super("qbo-api-error");
    const e = body?.Fault?.Error?.[0];
    this.status = status;
    this.qboCode = e?.code || null;
    this.detail = String(e?.Detail || e?.Message || `HTTP ${status}`).slice(0, 300);
  }
}
export const isStale = (e) => e instanceof QboError && e.qboCode === "5010";
export const isDuplicateName = (e) => e instanceof QboError && e.qboCode === "6240";
export const isDuplicateDocNumber = (e) => e instanceof QboError && e.qboCode === "6140";

export function authorizeUrl({ clientId, redirectUri, state }) {
  return `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    state,
  })}`;
}

export function publicConnection(c) {
  return c?.refreshToken && c?.realmId
    ? { connected: true, env: c.env || "sandbox", realmId: c.realmId, companyName: c.companyName || null }
    : { connected: false, env: null, realmId: null, companyName: null };
}

async function tokenCall({ clientId, clientSecret, fetchImpl }, params) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = new Error(res.status === 400 ? "qbo-reauth" : "qbo-token-failed");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function exchangeCode(creds, code, redirectUri) {
  return tokenCall({ fetchImpl: fetch, ...creds }, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function createQbo({ db, clientId, clientSecret, fetchImpl = fetch }) {
  const ref = db.doc(CONNECTION_DOC);
  const fresh = (c) => c?.accessToken && Date.now() < Number(c.expiresAt) - 300000;

  async function session() {
    const c = (await ref.get()).data();
    if (!c?.refreshToken || !c?.realmId) throw new Error("qbo-not-connected");
    if (fresh(c)) return c;
    return db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data();
      if (fresh(cur)) return cur;
      const t = await tokenCall({ clientId, clientSecret, fetchImpl }, {
        grant_type: "refresh_token",
        refresh_token: cur.refreshToken,
      });
      const next = {
        accessToken: t.access_token,
        refreshToken: t.refresh_token || cur.refreshToken,
        expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
        refreshedAt: new Date().toISOString(),
      };
      tx.update(ref, next);
      return { ...cur, ...next };
    });
  }

  async function request(method, path, body) {
    const c = await session();
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetchImpl(
      `${API[c.env === "production" ? "production" : "sandbox"]}/v3/company/${c.realmId}/${path}${sep}minorversion=${MINOR_VERSION}`,
      {
        method,
        headers: { Authorization: `Bearer ${c.accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      },
    );
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) throw new QboError(res.status, json);
    return json;
  }

  const query = async (sql) => (await request("GET", `query?query=${encodeURIComponent(sql)}`)).QueryResponse || {};
  return {
    session,
    request,
    query,
    items: async () =>
      (await query("select * from Item where Active in (true, false) and Type in ('Inventory', 'NonInventory') maxresults 1000")).Item || [],
    getItem: async (id) => (await request("GET", `item/${id}`)).Item,
    saveItem: async (body) => (await request("POST", "item", body)).Item,
    getAccount: async (id) => (await request("GET", `account/${id}`)).Account,
    accounts: async () => (await query("select * from Account maxresults 1000")).Account || [],
    createAccount: async (body) => (await request("POST", "account", body)).Account,
    createAdjustment: async (body) => (await request("POST", "inventoryadjustment", body)).InventoryAdjustment,
    createBill: async (body) => (await request("POST", "bill", body)).Bill,
    vendorByName: async (name) =>
      ((await query(`select * from Vendor where DisplayName = '${name.replace(/'/g, "\\'")}'`)).Vendor || [])[0] || null,
    createVendor: async (body) => (await request("POST", "vendor", body)).Vendor,
    taxCodes: async () => (await query("select * from TaxCode")).TaxCode || [],
    createJournal: async (body) => (await request("POST", "journalentry", body)).JournalEntry,
    companyInfo: async (realmId) => (await request("GET", `companyinfo/${realmId}`)).CompanyInfo,
  };
}
