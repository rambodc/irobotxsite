// Advance only after this component deploys successfully. Failed/cancelled releases leave its baseline unchanged.
const component = process.argv[2];
if (!["hosting", "functions", "rules"].includes(component))
  throw new Error("Invalid deployment component");
const base = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/git`,
  ref = `tags/deployed-${component}`;
const headers = {
  Authorization: `Bearer ${process.env.GH_TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/vnd.github+json",
};
let res = await fetch(`${base}/refs/${ref}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ sha: process.env.GITHUB_SHA, force: true }),
});
if (res.status === 404)
  res = await fetch(`${base}/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/${ref}`, sha: process.env.GITHUB_SHA }),
  });
if (!res.ok)
  throw new Error(`Could not record ${component} deployment (${res.status}).`);
