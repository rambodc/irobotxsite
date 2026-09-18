// Run from repository root with Node 22. Secrets never leave process memory except
// the authenticated Secret Manager API; no seed is logged.

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
const doc = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/xrplMainnet/${owner}`;
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
let existing = {};
try {
  existing = (await request(doc)).fields || {};
} catch (e) {
  if (e.status !== 404) throw e;
}
async function provision(name, role) {
  const pin = existing[role]?.mapValue?.fields;
  let version = pin?.secretVersion?.stringValue;
  if (
    version &&
    !new RegExp(
      `^projects/(?:${project}|881476176668)/secrets/${name}/versions/[0-9]+$`,
    ).test(version)
  )
    throw new Error("Invalid pinned secret reference.");
  if (!version)
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
  if (
    pin?.address?.stringValue &&
    pin.address.stringValue !== wallet.classicAddress
  )
    throw new Error(
      "Stored wallet address does not match its pinned secret; refusing replacement.",
    );
  return { address: wallet.classicAddress, secretVersion: version };
}
const trader = await provision("XRPL_MAINNET_TRADER_SEED", "trader");
await patch({
  network: "mainnet",
  networkId: 0,
  trader,
  provisioning: "ready",
});
console.log(
  JSON.stringify({
    address: trader.address,
    network: "mainnet",
    provisioning: "ready",
    funding: "Owner funding required. Automation remains off.",
  }),
);
