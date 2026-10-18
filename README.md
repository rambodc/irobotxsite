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

Public pages: `/`, `/about`, `/contact`. Authentication: `/signin`, `/forgot-password`, `/accept-invite`, `/auth/action`. Private workspace: `/portal`, `/portal/account`, `/portal/contact`, `/portal/admin`.

Edit public-page copy, industries, chapter text and page metadata in `src/content.ts`. Routing, header/footer and the shared contact form are in `src/App.tsx`; the About and Contact pages live in `src/site/` (`AboutPage.tsx`, `ContactPage.tsx`, `site.css`) with a lazily loaded particle accent (`Accent.tsx`, `AccentStage.tsx`) that supports limited drag-to-orbit and falls back to a static glow without WebGL or with reduced motion. The home page is an immersive React Three Fiber particle tour in `src/home3d/` (`forms.ts` shapes, `arm.ts` robotic-arm kinematics, `shaders.ts`, `director.ts` chapter timing, `Scene.tsx`, `HomeExperience.tsx`). Visitors can drag to orbit (clamped and damped; on touch, horizontal drag orbits and vertical swipe changes chapter), particles react to the pointer, a click fires a pulse or speeds up the arm, and chapter markers preview their chapter on hover. Reduced motion or missing WebGL shows a static page with every industry. Sign-in is reached from the "Client sign-in" link at the bottom of Contact; it is not in the header. Public route metadata, Organization/WebPage JSON-LD and social tags are emitted by `scripts/page-metadata.mjs`; update it when changing page positioning.

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

Production is the only deployment target. Work directly on `production` and push to release; `main` does not deploy and is no longer part of the release process. Automatic PR tests, test gates, and preview releases are disabled at the owner's request. Existing test commands remain available for explicit diagnostic work. Force pushes and branch deletion remain blocked.

On a push to `production`, `production.yml` compares the previous and new production commits and deploys only affected components. Frontend code, public assets and frontend build configuration select Hosting; `functions/` selects Functions; Firestore rules/indexes select Rules. Shared Firebase configuration selects all three. Documentation or workflow-only edits do not redeploy application components. When multiple components change, affected Rules run before Functions and Hosting; skipped components do not block the others. A failed backend deployment blocks the dependent frontend.

Deployment compiles the frontend as needed but does not run tests. All production jobs use the GitHub `Prod` environment. To redeploy one component, run **Production release** manually on `production` and choose `hosting`, `functions`, or `rules`; `all` runs a complete release. The individual component workflows also remain manually runnable. After a failed mixed release, rerun the failed workflow or choose `all` before releasing further changes, since automatic comparison uses Git commits rather than deployed component versions.

GitHub authenticates with Google Workload Identity Federation. The provider permits only `rambodc/irobotxsite`, `refs/heads/production`, and the `Prod` environment. Environment secrets contain only the provider resource name and deploy service-account email; no JSON service-account keys. Gmail stays in Secret Manager. Production workflow dispatches are also restricted to the production branch.

Production uses the provided Firebase web app and existing domain connection. `www.irobotx.io` redirects to `irobotx.io`. Preserve all Google Workspace MX/SPF/DKIM/DMARC records. Legacy industry URLs redirect to About sections. Auth/portal pages are excluded from indexing.

## Rollback and monitoring

The original site is preserved at Git tag `legacy-static-site`. Revert a faulty release on production, or restore a previous Hosting release in Firebase for an urgent frontend rollback. Hosting rollback does not roll back Functions or Firestore; deploy the prior compatible Functions/rules revision separately. Keep additive backend changes compatible until frontend rollout completes.

Use GitHub Actions for deployment results, Cloud Logging for Function failures and email errors, and Firestore `contactSubmissions.delivery`/`users.invitationDelivery` for failed mail. Logs contain identifiers/error codes rather than message bodies or credentials. Rate-limit records use Firestore TTL. Review stored contact enquiries periodically and delete them when no longer needed. Function instance limits reduce scaling but are not a spending cap.

## App Check and reCAPTCHA Enterprise

The production browser initializes Firebase App Check before Auth and Functions, using the score-based Enterprise key `6Ld6h7AtAAAAACOLU10MUr48tO0retRwNWg115UY` (public configuration). Google Cloud and Firebase App Check registration belong to project `irobotxsite`, web app `1:881476176668:web:9032fff3a3e8769cf4c8d9`. Tokens expire after one hour and refresh automatically; the minimum accepted risk score is 0.5. Verification failures display a retry message instead of submitting a contact request.

Allowed domains: `irobotx.io` (including www), `irobotxsite.web.app`, `irobotxsite.firebaseapp.com`, and `irobotxsite--review-aqnx0z79.web.app`. Add each new preview hostname to this key before testing its forms. Do not allow all domains or add localhost to the production key. Use `VITE_EMULATORS=true` for local development; App Check is skipped for emulators. No debug tokens or production bypasses are included in the client.

Roll out App Check client support before enabling server enforcement. Validate with `SITE_URL=https://your-preview-host node scripts/verify-app-check.mjs`, then release the frontend and validate the primary domain. This smoke test uses a nonexistent recovery address and invalid contact data, so it sends no email. After enforcing Functions, run `node scripts/verify-app-check.mjs --enforced` to verify all eight endpoints reject missing/invalid tokens while browser requests continue working. These dedicated smoke scripts are for App Check, authentication, domain, or related backend changes and incident investigation; do not rerun them for routine copy, imagery, styling, or anchor fixes. They are not deployment workflow steps. App Check remains enabled during normal use without being reconfigured on each release. App Check complements account authorization and rate limits; it does not replace either.

All eight callable Functions enforce App Check in production (`enforceAppCheck: true`); the only exception is the Firebase Functions emulator. Authentication and Firestore enforcement are configured in Firebase App Check at the project level. Firestore still denies all browser access; trusted Admin SDK calls from Functions continue using IAM. There is no Storage client in this release.

For the complete live invitation/sign-in/account smoke test, run `node scripts/verify-app-check-account.mjs` with an authorized gcloud login. It creates a temporary member account, exercises real password setup and account updates in a browser, and deletes the account/profile in a finally block. No invitation email is sent and no passwords, action codes, or tokens are printed. Client verification has a 15-second timeout so blocked reCAPTCHA cannot leave forms waiting indefinitely.

If legitimate traffic is blocked, first inspect App Check metrics and the allowed-domain list. An emergency backend rollback can set Functions enforcement off in a reviewed release; Auth/Firestore enforcement can be changed to monitoring in the Firebase console. Keep the App Check-enabled frontend when rolling back another feature, or disable the corresponding enforcement before restoring a pre-App-Check build.

## Imagery and iX branding

`public/images/` holds stills rendered from the 3D scene: `home-still-{768,1536}.webp` (home fallback) and `industry-{robotics,fintech,oil-gas,entertainment}-{480,960}.webp` (About page and chapter previews). They are captured from the running site with Playwright. `npm run assets` regenerates the brand exports and composes the social card `public/og.png` from `home-still-1536.webp`. Image processing uses Sharp; generated output is committed and is not regenerated during deployment.

`public/brand/` includes transparent blue, white and monochrome iX marks, horizontal lockups, square/circular versions, and PNG exports. `scripts/brand-assets.mjs` defines the shared SVG geometry. The same mark appears in the public footer, authentication, the portal, the favicon and social card. Treat background marks as decorative; retain meaningful alternative text for the cinematic images.

Home is a five-chapter tour: iRobotX Core, Robotics (a particle industrial arm that reaches, welds and returns), FinTech, Oil & Gas and Entertainment. About covers the four industries with anchors `#robotics`, `#fintech`, `#oil-gas` and `#entertainment`. The private portal uses a mini-app launcher; existing industry application assignment IDs are preserved.

## Retired demo backend

The public `/demo` workspace (fictional employee apps, AI Chat and Well Viewer) has been removed from the frontend; `/demo` now 301-redirects to `/`. The backend function `demoChat` (`functions/demo-ai.js`, with `scripts/configure-openai.py`) is intentionally still in place because removing a deployed function from source makes the non-interactive Functions deploy abort. To retire it, an operator first runs `firebase functions:delete demoChat --project irobotxsite`, then removes `functions/demo-ai.js`, its export in `functions/index.js` and the demo references in `scripts/change-scope.mjs`. `functions/demo-config.js` is shared with `mainnetAnalyst` and must stay, and the `OPENAI_API_KEY` secret is also referenced by the Mainnet scripts.

## Authenticated Mainnet trading

Trading lives at `/portal/trading`, restricted to the configured owner UID. Public pages and other mini apps are independent. The only approved pair is XRP/RLUSD; the issuer and currency are pinned in `functions/mainnet/config.js`.

`mainnetTick` samples validated markets every minute, schedules the AI analyst, evaluates exits, and recovers pending work. `mainnetAnalyst` uses the existing OpenAI secret and model to evaluate domain-filtered news; it cannot access the signing seed. `mainnetWorker` serializes transactions, persists signed payloads before submission, and reconciles validated ledger metadata. Callables never read secrets. Mainnet RPC network ID must be zero. Amounts use decimal arithmetic.

Run `node scripts/mainnet/provision.mjs` to create or resume the wallet in Secret Manager, then `python3 scripts/mainnet/configure-cloud.py` to configure dedicated identities, queue IAM and retention. Provisioning never prints or writes a seed to a file and never funds or activates the wallet. `node scripts/mainnet/status.mjs dashboard` reports public readiness and state using the current gcloud identity.

Data is isolated under `xrplMainnet/{ownerUid}`. Browser Firestore access is denied. Signed payloads are backend-only. Samples, AI decisions and usage reservations expire after 30 days; ledger transaction and accounting history remain. The latest news snapshot is cached on the root and historical research expires after 30 days. Model pricing is conservatively accounted at $2.50/M input (including cache-write margin), $12/M output, and $0.01/search, with a larger long-context rate. Request reservations are estimates; unknown outcomes retain their reservation and prevent automatic retry of that scheduled call.

Start is an explicit owner action. Fund XRP for current reserves plus the five-XRP buffer and fees, create the bounded RLUSD trust line, deposit RLUSD, acknowledge changed funding balances, review settings, then Start. Pause stops all automatic orders, including exits; submitted transactions still reconcile. Close position & stop uses bounded price-limited sell attempts. Loss limits are triggers, not guaranteed maximum losses. Unexpected ledger balances stop automation for review; when a position remains, close it before acknowledging the new baseline.

Return addresses require authentication within five minutes and a paused idle wallet. Withdrawals go only to that saved address/tag. The app cannot import a seed or submit arbitrary transactions. Operating XRP and funding are excluded from the trading position and trading P/L. Untracked positive balances are treated as external cash flows, never as purchased inventory.

Verification: `npm run test:backend`, `npm run test:trading`, `npm run test:trading:integration` (Java and Firebase emulators required), `node --test tests/change-scope.test.mjs`, and `npm run build`. Automated tests use deterministic RPC mocks; never run automated money-moving verification against Mainnet.

Production releases compare each component to its `deployed-hosting`, `deployed-functions`, or `deployed-rules` tag, advanced only after successful deployment. Backend goes first. Trading-only source changes target the Mainnet exports; shared bootstrap/dependency changes may require all functions. Test-only changes do not deploy. Retiring functions is an explicit operator action, never an inferred deletion from a targeted deployment.

Manual swaps in the Wallet tab convert XRP ↔ RLUSD while paused with no tracked trading position and acknowledged balances. `mainnetRequest` creates a server-held, 60-second quote, then accepts only its ID to enqueue one idempotent swap. The worker rechecks balances, reserves, liquidity, spread, price bounds, revision and expiry before submitting a fill-or-kill sell offer. The confirmed minimum receipt cannot be weakened. Swaps preserve the 5-XRP buffer, reconcile actual ledger changes into the funding baseline, and book fees under setup/transfers without modifying the automated position, P/L or purchase budget. Quotes never submit transactions; confirmation does.
