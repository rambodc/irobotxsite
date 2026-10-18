import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import "./brand-assets.mjs";
for (const name of [
  "ix-blue",
  "ix-white",
  "ix-mono",
  "ix-square",
  "ix-circle",
  "ix-blue-lockup",
  "ix-white-lockup",
  "ix-mono-lockup",
]) {
  for (const width of [128, 512])
    await sharp(`public/brand/${name}.svg`)
      .resize({ width })
      .png()
      .toFile(`public/brand/${name}-${width}.png`);
}
await sharp("public/favicon.svg")
  .resize(180, 180)
  .png()
  .toFile("public/apple-touch-icon.png");
const frames = await Promise.all(
  [16, 32, 48].map((size) =>
    sharp("public/favicon.svg").resize(size, size).png().toBuffer(),
  ),
);
const ico = Buffer.alloc(6 + 16 * frames.length);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(frames.length, 4);
let offset = ico.length;
frames.forEach((frame, i) => {
  const p = 6 + 16 * i;
  ico[p] = [16, 32, 48][i];
  ico[p + 1] = ico[p];
  ico.writeUInt16LE(1, p + 4);
  ico.writeUInt16LE(32, p + 6);
  ico.writeUInt32LE(frame.length, p + 8);
  ico.writeUInt32LE(offset, p + 12);
  offset += frame.length;
});
writeFileSync("public/favicon.ico", Buffer.concat([ico, ...frames]));
// Code-native social card composed from the homepage particle still (public/images/home-still-1536.webp).
const art = (await sharp("public/images/home-still-1536.webp").resize(1200, 750).png().toBuffer()).toString("base64");
const mark = readFileSync("public/brand/ix-blue.svg").toString("base64");
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="shade"><stop stop-color="#03060d" stop-opacity=".96"/><stop offset=".55" stop-color="#03060d" stop-opacity=".55"/><stop offset="1" stop-color="#03060d" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="630" fill="#03060d"/><image href="data:image/png;base64,${art}" x="150" y="-70" width="1200" height="750"/><rect width="1200" height="630" fill="url(#shade)"/><image href="data:image/svg+xml;base64,${mark}" x="60" y="48" width="70" height="56"/><g font-family="Inter,Arial,Helvetica,sans-serif"><text x="146" y="90" fill="white" font-size="36" font-weight="600">iRobotX</text><text x="62" y="214" fill="#b8dcff" font-size="16" letter-spacing="4">ONE SYSTEM. EVERY INDUSTRY.</text><g fill="white" font-size="60" font-weight="600" letter-spacing="-2"><text x="58" y="300">Technology for the</text><text x="58" y="370">industries of</text><text x="58" y="440" fill="#a9cfff">tomorrow.</text></g><text x="62" y="560" fill="#ffa552" font-size="19">Robotics · FinTech · Oil &amp; Gas · Entertainment</text><text x="1010" y="560" fill="#9fb2c8" font-size="17">irobotx.io</text></g></svg>`;
await sharp(Buffer.from(card)).png().toFile("public/og.png");
