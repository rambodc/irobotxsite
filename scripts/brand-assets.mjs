import { mkdirSync, writeFileSync } from "node:fs";
const mark =
  '<circle cx="18" cy="11" r="5"/><path d="M12 24h10l-5 33H7zM34 20h12l8 13 10-13h12L60 39l11 18H59l-7-12-10 12H29l17-20z"/>';
const svg = (body, box = "0 0 80 64") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`;
mkdirSync("public/brand", { recursive: true });
for (const [name, color] of [
  ["blue", "#4898ff"],
  ["white", "#ffffff"],
  ["mono", "#06101f"],
]) {
  writeFileSync(
    `public/brand/ix-${name}.svg`,
    svg(`<g fill="${color}">${mark}</g>`),
  );
  writeFileSync(
    `public/brand/ix-${name}-lockup.svg`,
    svg(
      `<g fill="${color}">${mark}<text x="95" y="47" font-family="Arial,Helvetica,sans-serif" font-size="42" letter-spacing="-2">iRobot<tspan font-weight="700">X</tspan></text></g>`,
      "0 0 260 64",
    ),
  );
}
writeFileSync(
  "public/brand/ix-square.svg",
  svg(
    `<rect width="80" height="80" rx="20" fill="#0b192b"/><g transform="translate(7 12) scale(.83)" fill="#4898ff">${mark}</g>`,
    "0 0 80 80",
  ),
);
writeFileSync(
  "public/brand/ix-circle.svg",
  svg(
    `<circle cx="40" cy="40" r="40" fill="#0b192b"/><g transform="translate(9 14) scale(.78)" fill="#a5d3ff">${mark}</g>`,
    "0 0 80 80",
  ),
);
writeFileSync(
  "public/favicon.svg",
  svg(
    `<rect width="80" height="80" rx="18" fill="#06101f"/><g transform="translate(4 10) scale(.9)" fill="#73b1ff">${mark}</g>`,
    "0 0 80 80",
  ),
);
