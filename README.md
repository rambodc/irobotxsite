# iRobotX website and workspace

React/TypeScript/Vite public website and invite-only Firebase portal. Production: https://irobotx.io. Firebase project: `irobotxsite`. Repository: `rambodc/irobotxsite`.

## Development and verification

Use Node.js 22 and Java 21 for the emulators.

```sh
npm ci
npm ci --prefix functions
npm run dev
npm run lint
npm run build
npx playwright install chromium
npm test
npm test --prefix functions
npm run test:rules
TEST_MAIL_FAILURE=true npm run test:rules
```

Set `VITE_EMULATORS=true` in `.env.local` to use local Auth/Functions. Integration tests always use the isolated `demo-irobotx` project; no production accounts, email, or data are touched. Emulator email delivery is simulated; failure mode exercises saved submissions and retry handling. All logs, local environment files and test artifacts are ignored.

## Routes and content

Public pages: `/`, `/about`, `/demo`, `/contact`. Authentication: `/signin`, `/forgot-password`, `/accept-invite`, `/auth/action`. Private workspace: `/portal`, `/portal/account`, `/portal/contact`, `/portal/admin`.

Edit company text, industries and demo definitions in `src/content.ts`. Layout and public copy are in `src/App.tsx`; blue theme tokens and responsive rules are in `src/styles.css`. `src/Scene.tsx` contains the lightweight industrial 3D scene, reduced motion support and no-WebGL fallback. The demo is illustrative only; no engineering calculations, operational data or full industry applications are included. Public route metadata is emitted by `scripts/page-metadata.mjs`; update it when changing page positioning.

## Accounts and application access

Firebase Email/Password sign-in is enabled. Passwords require at least 6 characters, with no uppercase, lowercase, numeric, or special-character requirement. Longer passwords are accepted. Public sign-up and user deletion are disabled at the Firebase Auth project level. The backend additionally denies every user without a server-created invited/active profile. Accounts, assignments and roles cannot be written by browsers.

Initial administrator: `rambodc@irobotx.io`. `scripts/bootstrap-admin.mjs` provisions only this initial profile; an existing profile is preserved. The administrator signs in at `/signin`, opens User Access, invites users, and manages assignments and disabled status. Roles cannot be changed by client requests. The last active administrator cannot be disabled. No delete-user action is exposed.

Invitations use Firebase password-reset action codes to let pre-created users choose a password. Links are single-use and expire according to Firebase. Resend creates a new email. First successful sign-in activates the invited profile. Existing sessions are checked against current Auth and profile status on every backend request; the UI refreshes account state every 30 seconds and on focus. Placeholder application cards cannot be launched even if assigned. Account and Contact are available to all active members; User Access is admin-only. The user list supports the first 1,000 users; add server pagination before growing beyond this initial scale.

## Backend interfaces and data

Callable Functions: `getProfile`, `updateProfile`, `listUsers`, `inviteUser`, `resendInvitation`, `updateUser`, `requestPasswordReset`, `submitContact`. Client contracts are in `src/api.ts`.

Firestore collections: `users` (profiles/status/role/apps/invitation status), `auditEvents` (admin access changes), `contactSubmissions` (contact details, message and delivery state), `rateLimits` (expiring abuse counters). Firestore browser reads and writes are denied, including for administrators; Functions apply authorization using the Admin SDK. No uploads or Storage access is used. Functions run in `us-central1`, zero minimum and two maximum instances each. Existing Firestore location is retained.

Contact delivery has explicit pending/sent/failed states and an idempotency key. Failed messages remain saved and may be retried with unchanged content. SMTP delivery cannot provide exactly-once guarantees if a process exits after sending but before recording success. Fixed sender/recipient prevent the form from becoming an arbitrary email relay. Honeypot, input limits and transactional per-IP limits reduce abuse. Password recovery returns the same response for known and unknown addresses.

## Email configuration

Sender and contact recipient: `info@irobotx.io`, an alias of `rambodc@irobotx.io`. Authenticate Gmail SMTP with the actual mailbox account and configure its authorized send-as alias in Google Workspace if required.

```sh
python3 scripts/configure-email.py --username rambodc@irobotx.io
# On macOS, use --dialog for a native hidden-input prompt.
```

The script checks SMTP login and writes the app password directly to the `SMTP_CONFIG` Secret Manager secret. It does not write plaintext credentials to disk or print them. After rotating it, redeploy Functions to bind the new secret version. Send the initial admin setup link with `node scripts/bootstrap-admin.mjs --send-setup`. Never commit credentials. The Firebase web configuration is public client configuration; database rules and server authorization protect user data.

## Deployment

Pull requests run separate Hosting, Functions and Rules workflows. `production.yml` calls the reusable rules, functions and hosting workflows in that order on a push to `production`. `main` is the development branch. Release by opening a PR from main into production and merging after required checks pass. All production jobs use the GitHub `Prod` environment.

GitHub authenticates with Google Workload Identity Federation. The provider permits only `rambodc/irobotxsite`, `refs/heads/production`, and the `Prod` environment. Environment secrets contain only the provider resource name and deploy service-account email; no JSON service-account keys. Gmail stays in Secret Manager. Production workflow dispatches are also restricted to the production branch.

Preview before release:

```sh
npm run build
firebase hosting:channel:deploy review --expires 7d --project irobotxsite
```

Production uses the provided Firebase web app and existing domain connection. `www.irobotx.io` redirects to `irobotx.io`. Preserve all Google Workspace MX/SPF/DKIM/DMARC records. Legacy industry URLs redirect to About sections. Auth/portal pages are excluded from indexing.

## Rollback and monitoring

The original site is preserved at Git tag `legacy-static-site`. Revert a faulty release through a PR to production, or restore a previous Hosting release in Firebase for an urgent frontend rollback. Hosting rollback does not roll back Functions or Firestore; deploy the prior compatible Functions/rules revision separately. Keep additive backend changes compatible until frontend rollout completes.

Use GitHub Actions for deployment results, Cloud Logging for Function failures and email errors, and Firestore `contactSubmissions.delivery`/`users.invitationDelivery` for failed mail. Logs contain identifiers/error codes rather than message bodies or credentials. Rate-limit records use Firestore TTL. Review stored contact enquiries periodically and delete them when no longer needed. Function instance limits reduce scaling but are not a spending cap.

## App Check and reCAPTCHA Enterprise

The production browser initializes Firebase App Check before Auth and Functions, using the score-based Enterprise key `6Ld6h7AtAAAAACOLU10MUr48tO0retRwNWg115UY` (public configuration). Google Cloud and Firebase App Check registration belong to project `irobotxsite`, web app `1:881476176668:web:9032fff3a3e8769cf4c8d9`. Tokens expire after one hour and refresh automatically; the minimum accepted risk score is 0.5. Verification failures display a retry message instead of submitting a contact request.

Allowed domains: `irobotx.io` (including www), `irobotxsite.web.app`, `irobotxsite.firebaseapp.com`, and `irobotxsite--review-aqnx0z79.web.app`. Add each new preview hostname to this key before testing its forms. Do not allow all domains or add localhost to the production key. Use `VITE_EMULATORS=true` for local development; App Check is skipped for emulators. No debug tokens or production bypasses are included in the client.

Roll out App Check client support before enabling server enforcement. Validate with `SITE_URL=https://your-preview-host node scripts/verify-app-check.mjs`, then release the frontend and validate the primary domain. This smoke test uses a nonexistent recovery address and invalid contact data, so it sends no email. After enforcing Functions, run `node scripts/verify-app-check.mjs --enforced` to verify all eight endpoints reject missing/invalid tokens while browser requests continue working. Review Firebase App Check metrics and Cloud Functions verification logs after releases. App Check complements account authorization and rate limits; it does not replace either.

All eight callable Functions enforce App Check in production (`enforceAppCheck: true`); the only exception is the Firebase Functions emulator. Authentication and Firestore enforcement are configured in Firebase App Check at the project level. Firestore still denies all browser access; trusted Admin SDK calls from Functions continue using IAM. There is no Storage client in this release.

For the complete live invitation/sign-in/account smoke test, run `node scripts/verify-app-check-account.mjs` with an authorized gcloud login. It creates a temporary member account, exercises real password setup and account updates in a browser, and deletes the account/profile in a finally block. No invitation email is sent and no passwords, action codes, or tokens are printed. Client verification has a 15-second timeout so blocked reCAPTCHA cannot leave forms waiting indefinitely.

If legitimate traffic is blocked, first inspect App Check metrics and the allowed-domain list. An emergency backend rollback can set Functions enforcement off in a reviewed release; Auth/Firestore enforcement can be changed to monitoring in the Firebase console. Keep the App Check-enabled frontend when rolling back another feature, or disable the corresponding enforcement before restoring a pre-App-Check build.
