import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { metadata } from "../src/content.ts";
const base = readFileSync("dist/index.html", "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
for (const [route, page] of Object.entries(metadata)) {
  const url = `https://irobotx.io${route}`;
  let html = base.replace(
    /<title>.*?<\/title>/,
    `<title>${escape(page.title)}</title>`,
  );
  for (const [tag, value] of [
    ['name="description"', page.description],
    ['property="og:title"', page.title],
    ['property="og:description"', page.description],
    ['property="og:url"', url],
  ])
    html = html.replace(
      new RegExp(`(<meta\\s+${tag}\\s+content=")[^"]*`),
      `$1${escape(value)}`,
    );
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*/, `$1${url}`);
  writeFileSync(route === "/" ? "dist/index.html" : `dist${route}.html`, html);
}
for (const route of [
  "signin",
  "forgot-password",
  "accept-invite",
  "auth/action",
  "portal",
  "portal/account",
  "portal/contact",
  "portal/admin",
  "portal/trading",
]) {
  if (route.includes("/"))
    mkdirSync(`dist/${route.split("/")[0]}`, { recursive: true });
  writeFileSync(
    `dist/${route}.html`,
    base
      .replace(
        "</head>",
        '<meta name="robots" content="noindex,nofollow"/></head>',
      )
      .replace(/<title>.*?<\/title>/, "<title>Client portal | iRobotX</title>"),
  );
}
