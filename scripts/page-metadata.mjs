import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { company, metadata } from "../src/content.ts";
const base = readFileSync("dist/index.html", "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
// Organization structured data on every public page, plus a page-specific node.
function structuredData(route, url, page) {
  const org = {
    "@type": "Organization",
    "@id": `${company.url}/#organization`,
    name: company.name,
    url: company.url,
    logo: `${company.url}/brand/ix-blue-512.png`,
    email: company.email,
    description: metadata["/"].description,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Calgary",
      addressRegion: "AB",
      addressCountry: "CA",
    },
    knowsAbout: ["Industrial robotics", "Automation", "FinTech", "Oil and gas software", "Entertainment technology"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: company.email,
      url: `${company.url}/contact`,
    },
  };
  const type = route === "/about" ? "AboutPage" : route === "/contact" ? "ContactPage" : "WebPage";
  const graph = [
    org,
    {
      "@type": type,
      "@id": `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { "@id": `${company.url}/#website` },
      about: { "@id": `${company.url}/#organization` },
    },
  ];
  if (route === "/")
    graph.push({
      "@type": "WebSite",
      "@id": `${company.url}/#website`,
      url: `${company.url}/`,
      name: company.name,
      publisher: { "@id": `${company.url}/#organization` },
    });
  return { "@context": "https://schema.org", "@graph": graph };
}
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
    ['name="twitter:title"', page.title],
    ['name="twitter:description"', page.description],
  ])
    html = html.replace(
      new RegExp(`(<meta\\s+${tag}\\s+content=")[^"]*`),
      `$1${escape(value)}`,
    );
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*/, `$1${url}`);
  html = html.replace(
    "</head>",
    `<script type="application/ld+json">${JSON.stringify(structuredData(route, url, page)).replaceAll("<", "\\u003c")}</script></head>`,
  );
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
