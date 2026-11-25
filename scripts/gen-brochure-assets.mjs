// Generates src/lib/brochure-assets.generated.ts — the brochure route's entire
// static binary footprint as base64 constants, so the deployed function needs
// NO runtime fs reads at all (Vercel file-tracing for node_modules fonts /
// public/ artwork was unreliable and 500'd the route):
//   · Roboto TTFs (pdfmake) → registered into pdfmake's shared virtual fs
//   · dmk-logo.png          → cover chip
//   · hero-banner.jpg       → pre-cropped cover band (the crop the runtime used
//                             to do with sharp — done here at generation time)
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import sharp from "sharp";

const root = process.cwd();
const b64 = (p) => readFileSync(path.join(root, p)).toString("base64");

// 1 · Roboto TTFs (pdfmake's own set)
const fontsDir = path.join(root, "node_modules", "pdfmake", "fonts", "Roboto");
const roboto = {
  "Roboto-Regular.ttf": readFileSync(path.join(fontsDir, "Roboto-Regular.ttf")).toString("base64"),
  "Roboto-Medium.ttf": readFileSync(path.join(fontsDir, "Roboto-Medium.ttf")).toString("base64"),
  "Roboto-Italic.ttf": readFileSync(path.join(fontsDir, "Roboto-Italic.ttf")).toString("base64"),
  "Roboto-MediumItalic.ttf": readFileSync(path.join(fontsDir, "Roboto-MediumItalic.ttf")).toString("base64"),
};

// 2 · logo
const logo = b64("public/dmk-logo.png");

// 3 · hero artwork — same crop the runtime used to do: drop the left 38%
//     (baked-in headline copy), vertically centered to the 595×318 cover band
const heroRaw = readFileSync(path.join(root, "public", "images", "hero-banner.jpg"));
const meta = await sharp(heroRaw).metadata();
const w = meta.width || 1920;
const h = meta.height || 702;
const left = Math.round(w * 0.38);
const cw = w - left;
const ch = Math.min(h, Math.round((cw * 318) / 595.28));
const top = Math.max(0, Math.round((h - ch) / 2));
const heroJpg = await sharp(heroRaw)
  .extract({ left, top, width: cw, height: ch })
  .resize(1190)
  .jpeg({ quality: 80 })
  .toBuffer();
const hero = heroJpg.toString("base64");

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/gen-brochure-assets.mjs
 *
 * The brochure PDF route's static binaries as base64 constants. Everything the
 * brochure engine used to read from disk at runtime (pdfmake Roboto TTFs, the
 * logo, the cover hero artwork) is embedded here, so the deployed function has
 * zero file-tracing / node_modules / public-folder dependencies — the source of
 * the mysterious serverless 500s.
 */
export const ROBOTO_VFS: Record<string, string> = ${JSON.stringify(roboto, null, 2)};

export const LOGO_PNG_BASE64 = "${logo}";

export const HERO_JPEG_BASE64 = "${hero}";
`;

mkdirSync(path.join(root, "src", "lib"), { recursive: true });
writeFileSync(path.join(root, "src", "lib", "brochure-assets.generated.ts"), out);
console.log("brochure-assets.generated.ts written:",
  Object.entries(roboto).map(([k, v]) => `${k} ${(v.length / 1024).toFixed(0)}KB`).join(", "),
  `| logo ${(logo.length / 1024).toFixed(0)}KB | hero ${(hero.length / 1024).toFixed(0)}KB`);
