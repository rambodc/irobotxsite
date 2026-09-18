import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export const MAINNET_FUNCTIONS = [
  "mainnetDashboard",
  "mainnetSettings",
  "mainnetAutomation",
  "mainnetRequest",
  "mainnetReturnAddress",
  "mainnetHistory",
  "mainnetAcknowledgeBalances",
  "mainnetWorker",
  "mainnetTick",
  "mainnetAnalyst",
];
export function classify(files, validation = false) {
  const scopes = { hosting: false, functions: false, rules: false };
  for (const file of files) {
    if (/^(firebase\.json|\.firebaserc)$/.test(file))
      Object.keys(scopes).forEach((k) => (scopes[k] = true));
    if (
      /^(src\/|public\/|index\.html$|package(-lock)?\.json$|vite\.config\.|postcss\.config\.|\.env($|\.production)|tsconfig|scripts\/page-metadata\.mjs$)/.test(
        file,
      )
    )
      scopes.hosting = true;
    if (file.startsWith("functions/") && !file.startsWith("functions/test/"))
      scopes.functions = true;
    if (/^firestore\.(rules|indexes\.json)$/.test(file)) scopes.rules = true;
    if (validation) {
      if (/^(\.github\/|scripts\/change-scope|tests\/change-scope)/.test(file))
        Object.keys(scopes).forEach((k) => (scopes[k] = true));
      if (/^(tests\/site\.spec|playwright\.config|eslint\.config)/.test(file))
        scopes.hosting = true;
      if (/^(functions\/|tests\/integration|package(-lock)?\.json$)/.test(file))
        scopes.rules = true;
    }
  }
  return scopes;
}
export function functionTargets(files, indexCoreUnchanged = false) {
  const selected = new Set();
  for (const f of files.filter(
    (f) => f.startsWith("functions/") && !f.startsWith("functions/test/"),
  )) {
    if (
      [
        "functions/mainnet/worker.js",
        "functions/mainnet/execution.js",
      ].includes(f)
    )
      selected.add("mainnetWorker");
    else if (f === "functions/mainnet/analyst.js")
      selected.add("mainnetAnalyst");
    else if (f === "functions/mainnet/service.js")
      MAINNET_FUNCTIONS.filter(
        (n) => !["mainnetWorker", "mainnetAnalyst"].includes(n),
      ).forEach((n) => selected.add(n));
    else if (f.startsWith("functions/mainnet/"))
      MAINNET_FUNCTIONS.forEach((n) => selected.add(n));
    else if (f === "functions/demo-config.js") {
      selected.add("demoChat");
      selected.add("mainnetAnalyst");
    } else if (f === "functions/demo-ai.js") selected.add("demoChat");
    else if (f === "functions/index.js" && indexCoreUnchanged)
      MAINNET_FUNCTIONS.forEach((n) => selected.add(n));
    else return "functions";
  }
  return selected.size
    ? [...selected]
        .sort()
        .map((n) => "functions:" + n)
        .join(",")
    : "functions";
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const {
    BASE_SHA,
    HEAD_SHA = "HEAD",
    VALIDATION,
    DEPLOY_SCOPE = "auto",
  } = process.env;
  if (!["auto", "all", "hosting", "functions", "rules"].includes(DEPLOY_SCOPE))
    throw new Error("Invalid deployment scope");
  const scopes = {},
    filesByScope = {},
    bases = {};
  for (const component of ["hosting", "functions", "rules"]) {
    let base = BASE_SHA;
    if (VALIDATION !== "true")
      try {
        base = git(
          "rev-parse",
          "--verify",
          "--quiet",
          `refs/tags/deployed-${component}`,
        );
      } catch {
        /* Bootstrap from push base only until the first recorded release. */
      }
    if (!base || /^0+$/.test(base)) {
      if (DEPLOY_SCOPE === "auto")
        throw new Error("Missing deployment baseline; select explicit scope.");
      filesByScope[component] = [];
    } else
      filesByScope[component] = git(
        "diff",
        "--name-only",
        "--no-renames",
        base,
        HEAD_SHA,
        "--",
      ).split("\n");
    bases[component] = base;
    scopes[component] =
      DEPLOY_SCOPE === "auto"
        ? classify(filesByScope[component], VALIDATION === "true")[component]
        : DEPLOY_SCOPE === "all" || DEPLOY_SCOPE === component;
  }
  let coreUnchanged = false;
  try {
    const core = (s) => s.split("export { demoChat }")[0];
    coreUnchanged =
      core(git("show", `${bases.functions}:functions/index.js`)) ===
      core(git("show", `${HEAD_SHA}:functions/index.js`));
  } catch {}
  // Deleted obsolete modules have already been explicitly retired; they are not deployment targets.
  const existingFiles = new Set(
    git("ls-tree", "-r", "--name-only", HEAD_SHA).split("\n"),
  );
  const functionsFiles = filesByScope.functions.filter((f) =>
    existingFiles.has(f),
  );
  let deployFiles = functionsFiles;
  try {
    const runtime = (p) => {
      const { dependencies, engines, type, main } = JSON.parse(p);
      return JSON.stringify({ dependencies, engines, type, main });
    };
    if (
      runtime(git("show", `${bases.functions}:functions/package.json`)) ===
      runtime(git("show", `${HEAD_SHA}:functions/package.json`))
    )
      deployFiles = deployFiles.filter((f) => f !== "functions/package.json");
  } catch {}
  const targets =
    DEPLOY_SCOPE !== "auto"
      ? "functions"
      : functionTargets(deployFiles, coreUnchanged);
  const output =
    Object.entries({ ...scopes, targets })
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n";
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
}
