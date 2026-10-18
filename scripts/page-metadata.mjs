import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { about, company, contact, experience, metadata } from "../src/content.ts";
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
    knowsAbout: ["Robotics", "Artificial intelligence", "Industrial automation", "FinTech", "Blockchain", "XRP Ledger", "Oil and gas technology", "Entertainment technology"],
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
// Static, crawlable copy for each public page. React's createRoot replaces it
// on start-up, so it only shows to crawlers, no-JS visitors and the first paint.
const t = (value) => escape(value).replaceAll(">", "&gt;");
const nav = `<header class="pre-header"><a href="/" class="pre-logo">iRobotX</a><nav aria-label="Main navigation"><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>`;
const footer = `<footer class="pre-footer"><p>${t(company.name)} · ${t(company.location)}, ${t(company.country)} · <a href="mailto:${company.email}">${t(company.email)}</a></p></footer>`;
const bodies = {
  "/": () =>
    `<p class="pre-eyebrow">${t(experience.eyebrow)}</p><h1>${t(experience.headline)}</h1><p>${t(experience.intro)}</p><p><a href="/contact">${t(experience.cta)}</a> · <a href="/about">${t(experience.secondary)}</a></p>` +
    experience.chapters
      .map((c) => `<section><h2><a href="/about#${c.id}">${t(c.name)}</a></h2><p><strong>${t(c.line)}</strong></p><p>${t(c.copy)}</p></section>`)
      .join(""),
  "/about": () =>
    `<p class="pre-eyebrow">${t(about.eyebrow)}</p><h1>${t(about.headline)}</h1><p>${t(about.intro)}</p>` +
    about.industries
      .map(
        (i) =>
          `<section id="${i.id}"><h2>${t(i.name)}</h2><p><strong>${t(i.headline)}</strong></p><p>${t(i.text)}</p>${i.points ? `<ul>${i.points.map((pt) => `<li>${t(pt)}</li>`).join("")}</ul>` : ""}</section>`,
      )
      .join("") +
    `<section><h2>${t(about.approach.title)}</h2><p>${t(about.approach.text)}</p>${about.approach.steps.map((st) => `<h3>${t(st.name)}</h3><p>${t(st.text)}</p>`).join("")}</section>` +
    `<section><h2>${t(about.band.title)}</h2><p>${t(about.band.text)} <a href="/contact">Start a project</a></p></section>`,
  "/contact": () =>
    `<p class="pre-eyebrow">${t(contact.eyebrow)}</p><h1>${t(contact.headline)}</h1><p>${t(contact.intro)}</p><h2>How to reach us</h2><dl>${contact.details
      .map((d) => `<dt>${t(d.label)}</dt><dd>${d.href ? `<a href="${d.href}">${t(d.value)}</a>` : t(d.value)}</dd>`)
      .join("")}</dl>`,
};
const preStyle = `<style>.pre{max-width:860px;margin:0 auto;padding:110px 24px 60px;color:#c9d6e6;font:16px/1.6 Inter,system-ui,sans-serif}.pre h1{color:#fff;font-size:clamp(34px,6vw,60px);line-height:1.05;font-weight:500;margin:.3em 0}.pre h2{color:#fff;font-weight:500;margin:1.6em 0 .3em}.pre a{color:#9fd0ff}.pre-header{position:absolute;top:24px;left:24px;right:24px;display:flex;justify-content:space-between}.pre-header nav{display:flex;gap:18px}.pre-logo{font-weight:600}.pre-eyebrow{letter-spacing:.2em;text-transform:uppercase;font-size:12px}.pre-footer{margin-top:60px;font-size:13px}</style>`;
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
  html = html
    .replace("</head>", `${preStyle}</head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="pre">${nav}<main>${bodies[route]()}</main>${footer}</div></div>`);
  writeFileSync(route === "/" ? "dist/index.html" : `dist${route}.html`, html);
}
// Sitemap of public pages with the build date as lastmod.
const lastmod = new Date().toISOString().slice(0, 10);
writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(metadata)
    .map((route) => `  <url><loc>https://irobotx.io${route}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`,
);
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
      .replace(/\s*<link\s+rel="canonical"[^>]*>/, "")
      .replace(
        "</head>",
        '<meta name="robots" content="noindex,nofollow"/></head>',
      )
      .replace(/<title>.*?<\/title>/, "<title>Client portal | iRobotX</title>"),
  );
}
