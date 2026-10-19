# QB Chem local fixture preview (dev only)

`npx vite` then open http://localhost:5173/dev/qbchem/ (`?section=recipes|production|settings`, `&dialog=new`, `&empty=1`).

Renders the real QB Chem UI with an in-memory mock client, so no sign-in, Firebase or QuickBooks is involved.
This folder is not part of the production build (Vite only builds `index.html`; `tsconfig` only covers `src/`),
and nothing under `src/` imports it.
