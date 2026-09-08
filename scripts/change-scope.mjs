import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function classify(files, validation = false) {
  const scopes = { hosting: false, functions: false, rules: false };
  for (const file of files) {
    if (/^(firebase\.json|\.firebaserc)$/.test(file)) Object.keys(scopes).forEach(k => scopes[k] = true);
    if (/^(src\/|public\/|index\.html$|package(-lock)?\.json$|vite\.config\.|postcss\.config\.|\.env($|\.production)|tsconfig|scripts\/page-metadata\.mjs$)/.test(file)) scopes.hosting = true;
    if (file.startsWith('functions/')) scopes.functions = true;
    if (/^firestore\.(rules|indexes\.json)$/.test(file)) scopes.rules = true;
    if (validation) {
      if (/^(\.github\/|scripts\/change-scope|tests\/change-scope)/.test(file)) Object.keys(scopes).forEach(k => scopes[k] = true);
      if (/^(tests\/site\.spec|playwright\.config|eslint\.config)/.test(file)) scopes.hosting = true;
      if (/^(functions\/|tests\/integration|package(-lock)?\.json$)/.test(file)) scopes.rules = true;
    }
  }
  return scopes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { BASE_SHA, HEAD_SHA = 'HEAD', VALIDATION, DEPLOY_SCOPE = 'auto' } = process.env;
  if (!['auto', 'all', 'hosting', 'functions', 'rules'].includes(DEPLOY_SCOPE)) throw new Error('Invalid deployment scope');
  let scopes;
  if (DEPLOY_SCOPE !== 'auto') {
    scopes = Object.fromEntries(['hosting', 'functions', 'rules'].map(k => [k, DEPLOY_SCOPE === 'all' || DEPLOY_SCOPE === k]));
  } else {
    if (!BASE_SHA || /^0+$/.test(BASE_SHA)) throw new Error('Missing comparison commit; select an explicit deployment scope');
    const files = execFileSync('git', ['diff', '--name-only', '--no-renames', BASE_SHA, HEAD_SHA, '--'], { encoding: 'utf8' }).trim().split('\n');
    scopes = classify(files, VALIDATION === 'true');
  }
  const output = Object.entries(scopes).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
}
