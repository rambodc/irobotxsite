// Authorized operator verification uses existing gcloud credentials in memory.
// It invokes the same outbox service, never reads wallet seeds or signs locally.
import { execFileSync } from "node:child_process";
import { initializeApp } from "../../functions/node_modules/firebase-admin/lib/app/index.js";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore/index.js";
import {
  OAuth2Client,
  GoogleAuth,
} from "../../functions/node_modules/google-gax/node_modules/google-auth-library/build/src/index.js";
import { ensureState, rootRef } from "../../functions/mainnet/state.js";
import { dashboard } from "../../functions/mainnet/service.js";
const token = execFileSync("gcloud", ["auth", "print-access-token"], {
  encoding: "utf8",
}).trim();
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = "irobotxsite";
const app = initializeApp({ projectId: "irobotxsite" });
app.options.credential.getAccessToken = async () => ({
  access_token: token,
  expires_in: 3500,
});
const authClient = new OAuth2Client();
authClient.setCredentials({ access_token: token });
getFirestore().settings({
  preferRest: true,
  auth: new GoogleAuth({ authClient, projectId: "irobotxsite" }),
});
await ensureState();
const c = (await rootRef().get()).data();
console.log(
  JSON.stringify(
    {
      address: c.trader.address,
      enabled: c.enabled,
      pending: c.pending,
      mode: c.mode,
      health: c.health,
    },
    null,
    2,
  ),
);
if (process.argv[2] === "dashboard")
  console.log(JSON.stringify(await dashboard(), null, 2));
