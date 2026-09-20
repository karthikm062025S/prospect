import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

// ponytail: sharp is supplied transitively by Next; do not add it to package.json.

const root = fileURLToPath(new URL("..", import.meta.url));
const iconPath = path.join(root, "app", "icon.svg");
const applePath = path.join(root, "app", "apple-icon.png");
const ogPath = path.join(root, "public", "og.png");
const fontPath = path.join(root, "public", "fonts", "InstrumentSerif-Regular.ttf");

const CREAM = "#f5efec";
const INK = "#1f0e14";
const iconSvg = await readFile(iconPath, "utf8");
const fontBase64 = (await readFile(fontPath)).toString("base64");

const appleMark = await sharp(Buffer.from(iconSvg))
  .resize(132, 132, { fit: "contain" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 180,
    height: 180,
    channels: 4,
    background: CREAM,
  },
})
  .composite([{ input: appleMark, left: 24, top: 24 }])
  .png()
  .toFile(applePath);

const markContent = iconSvg
  .match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]
  ?.replace(/<title>[\s\S]*?<\/title>/, "")
  .replaceAll(INK, CREAM);

if (!markContent) throw new Error("Could not read the mark from app/icon.svg");

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <style>
      @font-face {
        font-family: "Instrument Serif";
        src: url("data:font/truetype;base64,${fontBase64}") format("truetype");
        font-weight: 400;
        font-style: normal;
      }
      .brand { font-family: "Instrument Serif"; font-weight: 400; }
    </style>
  </defs>
  <rect width="1200" height="630" fill="${INK}"/>
  <svg x="72" y="183" width="240" height="240" viewBox="0 0 64 64" fill="none">
    ${markContent}
  </svg>
  <text class="brand" x="370" y="292" font-size="120" fill="${CREAM}">Prospect</text>
  <text class="brand" x="374" y="355" font-size="23.5" fill="${CREAM}">The career journey for every Virginia Tech student.</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile(ogPath);

async function verify(relativePath, expectedWidth, expectedHeight) {
  const absolutePath = path.join(root, relativePath);
  const { width, height } = await sharp(absolutePath).metadata();
  console.log(`${relativePath}: ${width}x${height}`);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${relativePath} must be ${expectedWidth}x${expectedHeight}`);
  }
}

await verify(path.join("app", "apple-icon.png"), 180, 180);
await verify(path.join("public", "og.png"), 1200, 630);
