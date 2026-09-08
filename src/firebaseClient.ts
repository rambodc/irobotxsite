import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
const app = initializeApp({
  apiKey: "AIzaSyAO1jsdnwbpOqhcNSLfRGoCLNBJIvFYBi0",
  authDomain: "irobotxsite.firebaseapp.com",
  projectId:
    import.meta.env.VITE_EMULATORS === "true" ? "demo-irobotx" : "irobotxsite",
  storageBucket: "irobotxsite.firebasestorage.app",
  messagingSenderId: "881476176668",
  appId: "1:881476176668:web:9032fff3a3e8769cf4c8d9",
  measurementId: "G-RPYXRB0LEN",
});
// Public site key; domain restrictions and server enforcement provide protection.
// Local development uses emulators, never a production debug-token bypass.
export const appCheck =
  import.meta.env.PROD && import.meta.env.VITE_EMULATORS !== "true"
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(
          "6Ld6h7AtAAAAACOLU10MUr48tO0retRwNWg115UY",
        ),
        isTokenAutoRefreshEnabled: true,
      })
    : undefined;
export async function verifyBrowser() {
  if (!appCheck) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getToken(appCheck),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(
          new Error("Browser verification timed out"),
          { code: "appCheck/timeout" },
        )), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-central1");
if (import.meta.env.VITE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
