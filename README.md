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

Edit public-page copy, industries, concept definitions, image descriptions and page metadata in `src/content.ts`. Layout is in `src/App.tsx`; blue theme tokens and responsive rules are in `src/styles.css`. The site uses static cinematic images and reduced-motion-aware reveals; Three.js loads only when the demo Well Viewer opens, with a static fallback when WebGL is unavailable. The demo combines fictional employee/well data with real AI Chat and public-source LSD research; it includes no engineering calculations or live operational integrations. Public route metadata is emitted by `scripts/page-metadata.mjs`; update it when changing page positioning.

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

Six cinematic images were generated with the built-in image generation tool. Original artwork and the exact prompt set are in `assets/artwork/` and `assets/artwork/prompts.json`. Imagery is conceptual and does not depict a delivered customer system. `public/images/` contains responsive 640/1024/1536px AVIF and WebP exports. Run `npm run assets` after changing original artwork or the brand source. Image processing uses Sharp; generated output is committed and is not regenerated during deployment.

`public/brand/` includes transparent blue, white and monochrome iX marks, horizontal lockups, square/circular versions, and PNG exports. `scripts/brand-assets.mjs` defines the shared SVG geometry. The same mark appears in the public footer, authentication, the portal, the favicon and social card. Treat background marks as decorative; retain meaningful alternative text for the cinematic images.

Home prioritizes custom Oil & Gas platforms and tailored AI integration. About preserves Oil & Gas, Robotics and FinTech anchors. Demo opens a full-screen fictional employee workspace with Profile, Company, Employees, AI Chat, LSD Finder, and Well Viewer. The private portal retains its stable application IDs and coming-soon status.

## Interactive demo

`src/DemoWorkspace.tsx` is lazy-loaded at `/demo`, outside the public header/footer. The home screen has Profile, Company, Employees, AI Chat, LSD Finder, and Well Viewer. App definitions, employee/company records, and action permissions live in `src/demoContent.ts`; styling is isolated in `src/demo.css`. Retired gallery fragments return to the launcher.

The default employee is John Miller at fictional PulseCrest Energy Inc. Profile edits update the same employee record shown in the directory. Company details, employee creation/editing, granular access, and portraits are held only in React memory. Refresh or Reset workspace restores the initial data. Employee/company actions never call authentication, email, or database APIs. AI apps call dedicated backend endpoints; transcripts, photos, and results remain temporary. The real portal remains at `/signin`.

View permissions control app visibility; action permissions independently control editing, employee creation, and access management. Disabling View clears dependent actions. New employees get their own editable Profile and read-only Company by default. John retains all permissions and active status. View as employee applies that employee's permissions, with a separate Return to John control. Email uniqueness is case-insensitive. Photo uploads accept decodable JPEG/PNG/WebP images up to 5 MB; Cancel discards them and Save updates only memory.

Company uses a downtown Calgary OpenStreetMap embed with attribution and a permanent external map link. The marker is an illustrative location, not an actual PulseCrest office. Contact addresses use the reserved `.example` domain and phone numbers are fictional.

John's fictional portrait was generated with the built-in image generation tool. The source is `assets/artwork/john-miller.png`, the compressed asset is `public/images/people/john-miller.webp`, and the exact prompt is `assets/artwork/john-miller-prompt.json`.


### Demo AI and well viewer

`src/DemoAIApps.tsx` and `src/demoAI.ts` provide chat streaming and photo/lookup interfaces. State is scoped to the selected fictional employee in memory. Refresh/Reset clears it. View and Use permissions govern the UI; these fictional permissions are not a backend identity.

`functions/demo-ai.js` exports `demoChat`, `extractLsd`, and `findLsd`. Every endpoint validates existing App Check tokens. UTC daily limits are site-wide 100/25/25 and per-IP 10/3/3 for chat/lookup/photo; each also allows at most three requests per minute per IP. Limits are transactional, and failed AI calls still count. Only hashed-IP/global counters and expiration timestamps enter the server-only `rateLimits` collection. OpenAI requests use `store: false`; no transcripts or photos are saved by this application. Counter documents carry a two-day `expiresAt` for the existing TTL policy.

The `OPENAI_API_KEY` secret is entered through `python3 scripts/configure-openai.py` using a hidden local prompt and stored in Secret Manager. Never put it in frontend environment variables. The Functions parameter `DEMO_AI_MODEL` defaults to `gpt-5.6-terra`; change it in Functions configuration and redeploy Functions without rebuilding Hosting. Set conservative billing alerts in the OpenAI project separately if desired.

LSD lookup uses Alberta/AER web search, then structured extraction. Coordinates must occur with the matching well identifier and surface/bottom-hole label in an independently retrieved government source excerpt; otherwise no map pin is rendered. Unsupported fields remain unavailable. It is not a land-description conversion engine or an exhaustive well registry.

The Well Viewer is adapted from `rambodc/uniq` production commit `1030fce0f65aafbe4299cf167ec5109676b7861a`. Its fixed metric dataset is in `src/well-viewer/sample-well.ts`. A main bore and three laterals share exact junction stations. Survey, casing, and drilling values are illustrative. No package import, saved-well library, cloud storage, or geometry editor is included.

Release AI backend changes through `production` with Functions first, then Hosting; unchanged Firestore rules are skipped automatically. For rollback, restore the prior production commit and redeploy the changed components. Removing AI UI alone can be released as Hosting only; disable the AI endpoints separately if retiring them.
