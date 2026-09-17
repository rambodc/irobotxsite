// Authorized operator verification uses existing gcloud credentials in memory.
// It invokes the same outbox service, never reads wallet seeds or signs locally.
import { execFileSync } from "node:child_process";
import { initializeApp } from "../../functions/node_modules/firebase-admin/lib/app/index.js";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore/index.js";
import {
  OAuth2Client,
  GoogleAuth,
} from "../../functions/node_modules/google-gax/node_modules/google-auth-library/build/src/index.js";
import {
  ensureState,
  discover,
  enqueue,
  automation,
  dashboard,
  rootRef,
} from "../../functions/testnet/service.js";
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
const command = process.argv[2] || "status";
// Leave dispatch to the deployed scheduler; this operator has no runtime identity.
process.env.FUNCTIONS_EMULATOR = "true";
await ensureState();
if (command === "discover")
  console.log(
    JSON.stringify(
      await discover(),
      (k, v) => (["asks", "bids"].includes(k) ? undefined : v),
      2,
    ),
  );
else if (["payment", "trust", "buy", "sell"].includes(command))
  console.log(
    await enqueue(
      command,
      process.argv[3] || `operator-${command}-${Date.now()}`,
    ),
  );
else if (command === "start" || command === "pause")
  console.log(await automation(command === "start"));
else if (command === "status") {
  const d = await dashboard();
  console.log(JSON.stringify(d, (k, v) => (k === "lines" ? undefined : v), 2));
} else if (command === "state") {
  const c = (await rootRef().get()).data();
  console.log(
    JSON.stringify(
      {
        enabled: c.enabled,
        pending: c.pending,
        run: c.run,
        position: c.position,
        health: c.health,
      },
      null,
      2,
    ),
  );
} else throw new Error("Unsupported operator action.");
