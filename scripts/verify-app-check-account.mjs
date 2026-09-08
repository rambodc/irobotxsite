import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const token = execFileSync('gcloud', ['auth', 'print-access-token'], {encoding:'utf8'}).trim();
initializeApp({projectId:'irobotxsite',credential:{getAccessToken:async()=>({access_token:token,expires_in:3500})}});
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = 'irobotxsite';
const auth = getAuth();
const site = process.env.SITE_URL || 'https://irobotx.io';
const headers = {Authorization:`Bearer ${token}`,'x-goog-user-project':'irobotxsite','Content-Type':'application/json'};
const documents = 'https://firestore.googleapis.com/v1/projects/irobotxsite/databases/(default)/documents/users/';
// Exercise the minimum-length policy using letters only. Never log credentials.
const password = randomBytes(6).map(byte => 97 + byte % 26).toString('ascii');
let uid;
const browser = await chromium.launch();
try {
  const user = await auth.createUser({email:`appcheck-account-${Date.now()}@example.invalid`,password});
  uid = user.uid;
  const str = stringValue => ({stringValue});
  const fields = {name:str('App Check verification'),email:str(user.email),company:str('iRobotX'),role:str('member'),status:str('invited'),apps:{arrayValue:{values:[]}}};
  assert.ok((await fetch(documents+uid,{method:'PATCH',headers,body:JSON.stringify({fields})})).ok);
  const link = new URL(await auth.generatePasswordResetLink(user.email,{url:'https://irobotx.io/portal'}));
  const page = await browser.newPage();
  await page.goto(site+'/accept-invite?oobCode='+encodeURIComponent(link.searchParams.get('oobCode')));
  await page.getByLabel('New password', {exact:true}).fill(password);
  await page.getByLabel('Confirm password', {exact:true}).fill(password);
  const signedIn = page.waitForResponse(r=>r.url().includes('accounts:signInWithPassword') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Set password & continue'}).click();
  const login = await signedIn;
  assert.equal(login.status(),200);
  assert.ok(login.request().headers()['x-firebase-appcheck'], 'Auth SDK must send App Check');
  await expect(page).toHaveURL(/\/portal$/, {timeout:60000});
  await page.goto(site+'/portal/account');
  await page.getByRole('textbox',{name:'Full name'}).fill('App Check verified');
  await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByRole('status')).toContainText('Your account has been updated.', {timeout:60000});
  console.log('Real invitation acceptance, App Check authenticated sign-in, portal access and account update passed.');
  const saved = await (await fetch(documents+uid,{headers})).json();
  assert.equal(saved.fields.role.stringValue,'member');
  assert.equal(saved.fields.status.stringValue,'active');
} finally {
  await browser.close();
  if(uid) {
    await auth.deleteUser(uid);
    assert.ok((await fetch(documents+uid,{method:'DELETE',headers})).ok);
    console.log('Temporary verification account and profile removed.');
  }
}
