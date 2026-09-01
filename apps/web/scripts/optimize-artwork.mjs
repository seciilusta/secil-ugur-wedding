/**
 * Venue illustration pipeline.
 *
 * Input : public/artwork/source/venue-illustration-original.jpg   (untouched, as delivered)
 * Output: public/artwork/source/venue-illustration.png            (lossless master, alpha restored, uncropped)
 *         public/artwork/venue-illustration.webp                  (display copy, padding trimmed)
 *         public/artwork/venue-illustration@2x.webp               (high-density display copy)
 *         public/artwork/venue-illustration.json                  (intrinsic size, consumed by Hero)
 *
 * The delivered file is a transparent watercolour illustration that was flattened
 * onto a pure black background somewhere in transit, so it arrives without an alpha
 * channel. Flattening over black is a premultiply, which is exactly invertible:
 *
 *     delivered = original_rgb * alpha        (background contributes 0)
 *
 * so for the empty padding and the soft watercolour edge we can recover
 * alpha = luma/255 and original_rgb = delivered/alpha.
 *
 * That inverse must only be applied to the background. The illustration itself
 * contains genuinely dark, fully opaque pixels (the dark glass structure), which
 * would wrongly become transparent. Those dark pixels are enclosed by the bright
 * watercolour wash, so the background is separated from them by a flood fill that
 * starts at the canvas border: only border-reachable dark pixels are background.
 *
 * No part of the illustration is redrawn, traced, vectorised or regenerated, and
 * no visible pixel is cropped -- only fully empty outer padding is removed.
 *
 * Run with: pnpm --filter web artwork
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "public/artwork/source");
const outputDir = path.join(root, "public/artwork");
const inputFile = path.join(sourceDir, "venue-illustration-original.jpg");

/**
 * The padding is pure black and the wash edge climbs from 0 to well over 100 luma
 * within a handful of pixels, so the flood fill only has to claim near-black
 * pixels. Keeping this low is what protects the dark glass structure.
 */
const FLOOD_CEILING = 14;
/** Width in pixels of the anti-aliased band rebuilt just inside the flood fill. */
const FRINGE_WIDTH = 3;
/** Luma that counts as fully opaque inside the fringe band. */
const FRINGE_OPAQUE_LUMA = 100;
/** Alpha below this is treated as empty padding when measuring the trim box. */
const EMPTY_ALPHA = 3;

/** Upscaled display copies offered through srcset, on top of the native file. */
const DISPLAY_LADDER = [
  { name: "venue-illustration@1.5x.webp", scale: 1.5, quality: 80 },
  { name: "venue-illustration@2x.webp", scale: 2, quality: 74 },
];

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Marks every pixel reachable from the canvas border through pixels darker than
 * FLOOD_CEILING. Iterative 4-way flood fill over a typed-array stack so a large
 * canvas cannot blow the call stack.
 */
function findBorderConnectedBackground(data, width, height, channels) {
  const isBackground = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;

  const push = (x, y) => {
    const p = y * width + x;
    if (isBackground[p]) return;
    if (luma(data[p * channels], data[p * channels + 1], data[p * channels + 2]) >= FLOOD_CEILING) return;
    isBackground[p] = 1;
    stack[top++] = p;
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (top > 0) {
    const p = stack[--top];
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  return isBackground;
}

/** Grows a mask outwards by one 4-connected pixel ring. */
function dilate(mask, width, height) {
  const grown = Uint8Array.from(mask);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (mask[p]) continue;
      if (
        (x > 0 && mask[p - 1]) ||
        (x < width - 1 && mask[p + 1]) ||
        (y > 0 && mask[p - width]) ||
        (y < height - 1 && mask[p + width])
      ) {
        grown[p] = 1;
      }
    }
  }
  return grown;
}

/** Rebuilds a straight-alpha RGBA buffer from the flattened-over-black input. */
function restoreAlpha(data, width, height, channels) {
  const isBackground = findBorderConnectedBackground(data, width, height, channels);

  // The few pixels just inside the flood fill are the anti-aliased wash edge that
  // was blended into black. Rebuilding alpha there avoids a hard dark outline.
  let fringe = isBackground;
  for (let i = 0; i < FRINGE_WIDTH; i += 1) fringe = dilate(fringe, width, height);

  const rgba = Buffer.alloc(width * height * 4);

  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    const r = data[s];
    const g = data[s + 1];
    const b = data[s + 2];

    if (isBackground[p]) {
      rgba[d + 3] = 0;
      continue;
    }

    const alpha = fringe[p]
      ? Math.min(255, Math.round((luma(r, g, b) / FRINGE_OPAQUE_LUMA) * 255))
      : 255;

    if (alpha === 0) {
      rgba[d + 3] = 0;
      continue;
    }

    const gain = 255 / alpha;
    rgba[d] = Math.min(255, Math.round(r * gain));
    rgba[d + 1] = Math.min(255, Math.round(g * gain));
    rgba[d + 2] = Math.min(255, Math.round(b * gain));
    rgba[d + 3] = alpha;
  }

  return rgba;
}

/** Bounding box of everything that is not empty padding. */
function measureArtworkBox(rgba, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] <= EMPTY_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error("Artwork appears to be completely empty.");
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const { data, info } = await sharp(inputFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  console.log(`source            ${width}x${height}, ${channels} channels`);

  const rgba = restoreAlpha(data, width, height, channels);
  const master = sharp(rgba, { raw: { width, height, channels: 4 } });

  await master
    .clone()
    .png({ compressionLevel: 9 })
    .toFile(path.join(sourceDir, "venue-illustration.png"));
  console.log(`master            venue-illustration.png (${width}x${height}, alpha restored, uncropped)`);

  const box = measureArtworkBox(rgba, width, height);
  console.log(
    `trim              removed ${box.top}px top / ${height - box.top - box.height}px bottom / ` +
      `${box.left}px left / ${width - box.left - box.width}px right`,
  );
  console.log(`display size      ${box.width}x${box.height} (aspect ${(box.width / box.height).toFixed(4)})`);

  const trimmed = sharp(rgba, { raw: { width, height, channels: 4 } }).extract(box);

  await trimmed
    .clone()
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(path.join(outputDir, "venue-illustration.webp"));

  // The source resolution is modest, so the larger files are Lanczos resamples
  // with a light sharpen. They add no invented detail — they only keep the dark
  // structural lines from going soft when a high-density screen has to scale the
  // native file up. Quality drops as the size grows so the ladder stays light.
  for (const { name, scale, quality } of DISPLAY_LADDER) {
    await trimmed
      .clone()
      .resize({
        width: Math.round(box.width * scale),
        height: Math.round(box.height * scale),
        kernel: "lanczos3",
        fit: "fill",
      })
      .sharpen({ sigma: 0.6, m1: 0.4, m2: 0.6 })
      .webp({ quality, alphaQuality: 100, effort: 6 })
      .toFile(path.join(outputDir, name));
  }

  await writeFile(
    path.join(outputDir, "venue-illustration.json"),
    `${JSON.stringify(
      {
        width: box.width,
        height: box.height,
        aspectRatio: Number((box.width / box.height).toFixed(4)),
        srcset: ["venue-illustration.webp", ...DISPLAY_LADDER.map((step) => step.name)],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await buildSocialShareImage(trimmed.clone(), box);

  console.log("wrote             venue-illustration{,@1.5x,@2x}.webp, venue-illustration.json, social-share.jpg");
}

/** Open Graph card: the same illustration on ivory, with the essential details. */
async function buildSocialShareImage(illustration, box) {
  const W = 1200;
  const H = 630;
  const artWidth = 660;
  const artHeight = Math.round((artWidth / box.width) * box.height);
  const artTop = H - artHeight;

  const art = await illustration
    .resize({ width: artWidth, height: artHeight, kernel: "lanczos3", fit: "fill" })
    .png()
    .toBuffer();

  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="#C6B08A" stroke-width="1.5"/>
  <line x1="${W / 2 - 40}" y1="76" x2="${W / 2 + 40}" y2="76" stroke="#C6B08A" stroke-width="1"/>
  <g font-family="Bodoni Moda, Didot, Times New Roman, serif" fill="#37332F" text-anchor="middle">
    <text x="${W / 2}" y="146" font-size="76">Seçil &amp; Uğur</text>
  </g>
  <g font-family="Jost, Futura, Helvetica Neue, sans-serif" fill="#4C5544" text-anchor="middle" letter-spacing="6">
    <text x="${W / 2}" y="188" font-size="21">4 EKİM 2026 · PAZAR · 19.00</text>
    <text x="${W / 2}" y="222" font-size="17" fill="#6E6A64">ADEN BOĞAZKÖY TESİSLERİ · ARNAVUTKÖY</text>
  </g>
</svg>`);

  await sharp({ create: { width: W, height: H, channels: 4, background: "#F7F5F1" } })
    .composite([
      { input: art, top: artTop, left: Math.round((W - artWidth) / 2) },
      { input: text, top: 0, left: 0 },
    ])
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toFile(path.join(outputDir, "social-share.jpg"));
}

await main();
