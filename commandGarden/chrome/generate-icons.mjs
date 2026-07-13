/**
 * One-time script: converts src/assets/icon.svg → icons/*.png at required sizes.
 * Run: npx sharp-cli or `node generate-icons.mjs` (requires sharp).
 * The generated PNGs are checked into the repo so sharp is NOT a build dependency.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, 'src/assets/icon.svg');
const outDir = resolve(__dirname, 'icons');

mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(resolve(outDir, `icon-${size}.png`));
  console.log(`  ✓ icons/icon-${size}.png`);
}

console.log('Icon generation complete.');
