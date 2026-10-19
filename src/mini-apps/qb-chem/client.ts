import { httpsCallable } from "firebase/functions";
import { functions, verifyBrowser } from "../../firebaseClient";
import type { QbChemClient } from "./types";

async function call<T>(action: string, payload: object = {}): Promise<T> {
  await verifyBrowser();
  const fn = httpsCallable<{ action: string; payload: object }, T>(functions, "qbChemApi", { timeout: 125000 });
  return (await fn({ action, payload })).data;
}

export const qbChemClient: QbChemClient = {
  load: () => call("load"),
  checkName: (name, sku, excludeId) => call("checkName", { name, sku, excludeId }),
  createItem: (input) => call("createItem", input),
  saveSetup: (itemId, setup, reactivate) => call("saveSetup", { itemId, setup, reactivate }),
  updateItem: (input) => call("updateItem", input),
  saveRecipe: (recipe) => call("saveRecipe", recipe),
  deleteRecipe: (id) => call("deleteRecipe", { id }),
  previewRun: (recipeId, outputQty) => call("previewRun", { recipeId, outputQty }),
  postRun: (input) => call("postRun", input),
  ensureSetup: () => call("ensureSetup"),
  connectStart: () => call("connectStart"),
};
