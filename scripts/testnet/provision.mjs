// Run from repository root with Node 22. Secrets never leave process memory except
// the authenticated Secret Manager API; no seed or faucet response is logged.
import { execFileSync } from "node:child_process";
import { Wallet } from "../../functions/node_modules/xrpl/dist/npm/index.js";
const project = "irobotxsite",
  owner = "T3OJomXeXohNl3ns5sFLnRB314Z2";
const token = () =>
  execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
  }).trim();
let access = token();
async function request(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    const e = new Error(
      `Google API ${res.status}: ${data.error?.status || "request failed"}`,
    );
    e.status = res.status;
    throw e;
  }
  return data;
}
const secretBase = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets`;
const doc = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/xrplTestnet/${owner}`;
function encode(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return { integerValue: String(v) };
  if (typeof v === "string") return { stringValue: v };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(v).map(([k, v]) => [k, encode(v)]),
      ),
    },
  };
}
async function patch(fields) {
  return request(
    `${doc}?${Object.keys(fields)
      .map((k) => `updateMask.fieldPaths=${k}`)
      .join("&")}`,
    "PATCH",
    {
      fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, encode(v)]),
      ),
    },
  );
}
async function provision(name) {
  let version;
  try {
    const list = await request(`${secretBase}/${name}/versions?pageSize=100`);
    version = list.versions?.find((v) => v.state === "ENABLED")?.name;
    if (!version && list.versions?.length)
      throw new Error(
        "Existing secret has no enabled version; refuse replacement.",
      );
  } catch (e) {
    if (e.status !== 404) throw e;
    await request(`${secretBase}?secretId=${name}`, "POST", {
      replication: { automatic: {} },
    });
  }
  let wallet;
  if (version) {
    const data = await request(
      `https://secretmanager.googleapis.com/v1/${version}:access`,
    );
    wallet = Wallet.fromSeed(
      Buffer.from(data.payload.data, "base64").toString(),
    );
  } else {
    wallet = Wallet.generate();
    version = (
      await request(`${secretBase}/${name}:addVersion`, "POST", {
        payload: { data: Buffer.from(wallet.seed).toString("base64") },
      })
    ).name;
  }
  return { address: wallet.classicAddress, secretVersion: version };
}
async function rpc(method, params = {}) {
  const res = await fetch("https://s.altnet.rippletest.net:51234/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: [params] }),
    signal: AbortSignal.timeout(20000),
  });
  return (await res.json()).result;
}
const info = await rpc("server_info");
if (info.info?.network_id !== 1) throw new Error("Testnet network mismatch.");
const trader = await provision("XRPL_TESTNET_TRADER_SEED");
await patch({
  network: "testnet",
  networkId: 1,
  trader,
  provisioning: "creating receiver",
});
const receiver = await provision("XRPL_TESTNET_RECEIVER_SEED");
await patch({ receiver, provisioning: "funding" });
for (const [role, w] of Object.entries({ trader, receiver })) {
  let a = await rpc("account_info", {
    account: w.address,
    ledger_index: "validated",
  });
  if (a.error === "actNotFound") {
    const funded = await fetch(
      "https://faucet.altnet.rippletest.net/accounts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: w.address }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!funded.ok)
      throw new Error(
        `Faucet unavailable (${funded.status}) for ${role}; rerun safely to resume.`,
      );
    for (let i = 0; i < 12; i++) {
      a = await rpc("account_info", {
        account: w.address,
        ledger_index: "validated",
      });
      if (a.account_data) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!a.account_data)
    throw new Error(`Funding not yet validated for ${role}; rerun to resume.`);
  console.log(
    `${role}: ${w.address}; validated balance ${Number(a.account_data.Balance) / 1e6} test XRP`,
  );
}
await patch({ provisioning: "ready" });
console.log(
  "Provisioned Testnet accounts. Seeds are stored only in Secret Manager.",
);
