import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Run against a deployed build. Does not send email or print bearer tokens.
const site = process.env.SITE_URL || 'https://irobotx.io';
const enforced = process.argv.includes('--enforced');
const root = 'https://us-central1-irobotxsite.cloudfunctions.net/';
const names = ['getProfile', 'updateProfile', 'listUsers', 'inviteUser',
  'resendInvitation', 'updateUser', 'requestPasswordReset', 'submitContact'];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(site + '/forgot-password');
  await page.getByRole('textbox', { name: 'Email address' }).fill(`appcheck-test-${Date.now()}@example.invalid`);
  const responsePromise = page.waitForResponse(r => r.url() === root + 'requestPasswordReset' && r.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: 'Send reset instructions' }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'Browser password recovery must work');
  const appToken = response.request().headers()['x-firebase-appcheck'];
  assert.ok(appToken && appToken.split('.').length === 3, 'SDK must attach a real App Check JWT');
  const claims = JSON.parse(Buffer.from(appToken.split('.')[1], 'base64url').toString());
  assert.equal(claims.sub, '1:881476176668:web:9032fff3a3e8769cf4c8d9');
  assert.ok(claims.exp * 1000 > Date.now());
  console.log('Browser obtained a valid reCAPTCHA Enterprise App Check token; password recovery succeeded.');
  const call = async (name, token) => {
    const r = await fetch(root + name, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: new URL(site).origin,
      ...(token ? { 'X-Firebase-AppCheck': token } : {}),
    }, body: JSON.stringify({ data: {} }) });
    return { status: r.status, body: await r.json() };
  };
  const valid = await call('submitContact', appToken);
  assert.equal(valid.status, 400, 'Verified contact request must reach input validation');
  assert.equal(valid.body.error.status, 'INVALID_ARGUMENT');
  console.log('Verified contact request reached validation without sending email.');
  if (enforced) {
    for (const name of names) {
      for (const token of [undefined, 'invalid-token']) {
        const r = await call(name, token);
        assert.equal(r.status, 401, `${name} must reject missing/invalid App Check`);
        assert.equal(r.body.error.status, 'UNAUTHENTICATED');
      }
    }
    console.log('All eight callable functions reject missing and invalid App Check tokens.');
  }
} finally {
  await browser.close();
}
