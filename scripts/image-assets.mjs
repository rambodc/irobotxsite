import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import "./brand-assets.mjs";
mkdirSync("public/images", { recursive: true });
for (const { name } of JSON.parse(
  readFileSync("assets/artwork/prompts.json", "utf8"),
)) {
  for (const width of [640, 1024, 1536]) {
    await sharp(`assets/artwork/${name}.png`)
      .resize({ width })
      .webp({ quality: 82 })
      .toFile(`public/images/${name}-${width}.webp`);
    await sharp(`assets/artwork/${name}.png`)
      .resize({ width })
      .avif({ quality: 58, effort: 4 })
      .toFile(`public/images/${name}-${width}.avif`);
  }
}
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
// Code-native social card: the original artwork stays unmodified; type and logo are composed separately.
const art = readFileSync("assets/artwork/oilfield.png").toString("base64");
const mark = readFileSync("public/brand/ix-blue.svg").toString("base64");
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="shade"><stop stop-color="#03101f" stop-opacity=".97"/><stop offset="1" stop-color="#03101f" stop-opacity=".25"/></linearGradient></defs><image href="data:image/png;base64,${art}" width="1200" height="800" y="-85"/><rect width="1200" height="630" fill="url(#shade)"/><image href="data:image/svg+xml;base64,${mark}" x="60" y="45" width="80" height="64"/><g font-family="Arial,Helvetica,sans-serif"><text x="154" y="91" fill="white" font-size="39">iRobotX</text><text x="64" y="218" fill="#a5d3ff" font-size="16" letter-spacing="3">CUSTOM PLATFORMS. CONNECTED OPERATIONS.</text><g fill="white" font-size="62" font-weight="600" letter-spacing="-2"><text x="60" y="310">AI-powered software</text><text x="60" y="383">for connected</text><text x="60" y="456" fill="#a5d3ff">Oil &amp; Gas operations.</text></g><text x="64" y="561" fill="#b0c5de" font-size="19">Oil &amp; Gas · Robotics · FinTech</text><text x="1010" y="561" fill="#b0c5de" font-size="17">irobotx.io</text></g></svg>`;
await sharp(Buffer.from(card)).png().toFile("public/og.png");
