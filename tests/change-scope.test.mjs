import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../scripts/change-scope.mjs';
test('deployment selects only affected services, including deleted files', () => {
  assert.deepEqual(classify(['src/App.tsx', 'public/images/hero.avif']), { hosting: true, functions: false, rules: false });
  assert.deepEqual(classify(['functions/src/index.ts']), { hosting: false, functions: true, rules: false });
  assert.deepEqual(classify(['firestore.rules']), { hosting: false, functions: false, rules: true });
  assert.deepEqual(classify(['src/api.ts', 'functions/package-lock.json']), { hosting: true, functions: true, rules: false });
  assert.deepEqual(classify(['firebase.json']), { hosting: true, functions: true, rules: true });
  assert.deepEqual(classify(['README.md', '.github/workflows/production.yml']), { hosting: false, functions: false, rules: false });
});
test('authorization and workflow changes receive relevant PR validation without extra deployments', () => {
  assert.deepEqual(classify(['functions/src/index.ts'], true), { hosting: false, functions: true, rules: true });
  assert.deepEqual(classify(['tests/site.spec.ts'], true), { hosting: true, functions: false, rules: false });
  assert.deepEqual(classify(['.github/workflows/production.yml'], true), { hosting: true, functions: true, rules: true });
});
