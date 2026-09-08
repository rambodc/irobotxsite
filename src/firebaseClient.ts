import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
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
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-central1");
if (import.meta.env.VITE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
