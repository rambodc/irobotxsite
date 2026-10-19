# QB Chem ops notes

- OAuth tokens live in Firestore `qbChemConfig/connection` (Functions owns refresh).
- Client id/secret: Secret Manager `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET`.
- Box helper `/home/box/.config/qbo-sandbox/qbo.py` refuses live calls to avoid token rotation.
- OAuth redirect URI (register in Intuit app): `https://us-central1-irobotxsite.cloudfunctions.net/qbChemOAuthCallback`
- Sandbox realm: `9341458521176413` (Sandbox Company CA 9706).
- Preview channel: `qb-chem`.
