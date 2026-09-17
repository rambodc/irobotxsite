import { execFileSync } from "node:child_process";
const project = "irobotxsite",
  uid = "T3OJomXeXohNl3ns5sFLnRB314Z2";
const target = `projects/${project}/databases/(default)/documents/users/${uid}/miniApps/trading`;
const token = execFileSync("gcloud", ["auth", "print-access-token"], {
  encoding: "utf8",
}).trim();
const api = "https://firestore.googleapis.com/v1/";
async function req(path, method = "GET", body) {
  const r = await fetch(api + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${r.status}`);
  return r.json();
}
const current = await req(target);
if (current && current.fields?.schemaVersion?.integerValue !== "1")
  throw new Error("Refusing deletion: unexpected paper schema.");
if (current?.fields?.enabled?.booleanValue === true)
  throw new Error("Refusing deletion: paper worker still enabled.");
let count = 0;
async function remove(path) {
  if (path !== target && !path.startsWith(target + "/"))
    throw new Error("Deletion outside verified paper namespace.");
  let pageToken;
  do {
    const cols = await req(path + ":listCollectionIds", "POST", {
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const col of cols?.collectionIds || []) {
      let next;
      do {
        const list = await req(
          `${path}/${col}?pageSize=100${next ? "&pageToken=" + encodeURIComponent(next) : ""}`,
        );
        for (const doc of list?.documents || []) await remove(doc.name);
        next = list?.nextPageToken;
      } while (next);
    }
    pageToken = cols?.nextPageToken;
  } while (pageToken);
  await req(path, "DELETE");
  count++;
}
await remove(target);
console.log(
  `Deleted ${count} paper documents only beneath users/${uid}/miniApps/trading.`,
);
