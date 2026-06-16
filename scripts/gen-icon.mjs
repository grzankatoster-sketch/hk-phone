// Generuje public/icon.ico z public/hk-phone/icon.svg (16..256 px).
// Uzywane do ikony okna (main.cjs) oraz instalatora NSIS (electron-builder build.win.icon).
// Uruchom: node scripts/gen-icon.mjs
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public", "hk-phone", "icon.svg"));
const sizes = [16, 24, 32, 48, 64, 128, 256];

const pngs = await Promise.all(
  sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer())
);

const ico = await pngToIco(pngs);
writeFileSync(join(root, "public", "icon.ico"), ico);
console.log(`OK -> public/icon.ico (${(ico.length / 1024).toFixed(1)} KB, rozmiary: ${sizes.join(",")})`);
