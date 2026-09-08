# iRobotX website

Static multi-page company website deployed with Firebase Hosting.

## Preview and deploy

```bash
firebase emulators:start --only hosting
firebase deploy --only hosting
```

## Custom domain

Use `irobotx.io` as the primary custom domain in Firebase Hosting. Keep `www.irobotx.io` configured as a permanent redirect to `irobotx.io`. Domain-level redirects are configured in the Firebase console, not `firebase.json`, because they depend on the incoming custom domain.

Do not change the Google Workspace MX, SPF, DKIM or DMARC records.

## Google Search Console

1. Add a **Domain property** for `irobotx.io` at Google Search Console.
2. Add the verification TXT record in GoDaddy without removing existing TXT records.
3. Submit `https://irobotx.io/sitemap.xml` in the Sitemaps section.
4. Inspect `https://irobotx.io/` and request indexing after the custom domain is connected.
