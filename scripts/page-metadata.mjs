import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const base = readFileSync("dist/index.html", "utf8");
const pages = {
  about: [
    "About us | iRobotX",
    "A Calgary technology company developing intelligent systems across Oil & Gas, Robotics, and FinTech.",
  ],
  demo: [
    "Technology demos | iRobotX",
    "Explore an interactive industrial 3D concept and upcoming technology demonstrations from iRobotX.",
  ],
  contact: [
    "Contact | iRobotX",
    "Contact iRobotX in Calgary about Oil & Gas technology, industrial software, robotics, and financial technology.",
  ],
};
for (const [route, [title, description]] of Object.entries(pages)) {
  const url = `https://irobotx.io/${route}`;
  const html = base
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${description}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${title}`)
    .replace(
      /(<meta property="og:description" content=")[^"]*/,
      `$1${description}`,
    )
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`);
  writeFileSync(`dist/${route}.html`, html);
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
