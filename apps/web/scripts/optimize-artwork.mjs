/**
 * Canonical venue-artwork pipeline.
 *
 * Source: public/artwork/source/wedding-illustration-master.png
 *
 * The supplied RGBA PNG is the source of truth. Every site asset below is a
 * deterministic crop/scale/composite of that file. The pipeline never redraws,
 * sharpens, recolours, posterizes, traces or otherwise restyles the artwork.
 * WebP outputs are lossless so the source's soft watercolour edges and alpha are
 * preserved after the required layout resampling.
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
const inputFile = path.join(sourceDir, "wedding-illustration-master.png");

const EMPTY_ALPHA = 3;

function measureArtworkBox(data, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] <= EMPTY_ALPHA) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) throw new Error("The canonical venue artwork appears to be empty.");
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function transparentCanvas(width, height, layers, outputName) {
  await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .webp({ lossless: true, alphaQuality: 100, effort: 6 })
    .toFile(path.join(outputDir, outputName));
}

async function resizedArtwork(source, width) {
  return source
    .clone()
    .resize({ width, kernel: "lanczos3", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function buildHeroDesktop(trimmed) {
  const art = await resizedArtwork(trimmed, 1170);
  await transparentCanvas(1600, 1000, [{ input: art, left: 430, top: 210 }], "venue-hero-desktop-master.webp");
}

async function buildHeroMobile(trimmed) {
  const art = await resizedArtwork(trimmed, 900);
  await transparentCanvas(900, 1800, [{ input: art, left: 0, top: 680 }], "venue-hero-mobile-master.webp");
}

async function buildVenueDetail(master) {
  /* A central architectural fragment: roof lantern, glass entrance and path.
     This is deliberately not the full hero silhouette. */
  const detail = master
    .clone()
    .extract({ left: 238, top: 545, width: 650, height: 690 });
  const art = await resizedArtwork(detail, 930);
  await transparentCanvas(1200, 1000, [{ input: art, left: 270, top: 13 }], "venue-detail-master.webp");
}

async function buildSocialShare(trimmed) {
  const W = 1200;
  const H = 630;
  const art = await resizedArtwork(trimmed, 760);
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#F6F2E9"/>
  <g font-family="Didot, Bodoni 72, Times New Roman, serif" fill="#34322E">
    <text x="64" y="224" font-size="86">Seçil</text>
    <text x="172" y="294" font-size="52" fill="#B49A68">&amp;</text>
    <text x="64" y="378" font-size="86">Uğur</text>
  </g>
  <g font-family="Avenir Next, Helvetica Neue, sans-serif" fill="#59604E" letter-spacing="4">
    <text x="66" y="438" font-size="16">4 EKİM 2026 · 18.30</text>
    <text x="66" y="474" font-size="14">ADEN BOĞAZKÖY · CAMLI KÖŞK</text>
  </g>
</svg>`);

  await sharp({ create: { width: W, height: H, channels: 4, background: "#F6F2E9" } })
    .composite([
      { input: text, left: 0, top: 0 },
      { input: art, left: 468, top: 157 },
    ])
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(path.join(outputDir, "social-share.jpg"));
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const metadata = await sharp(inputFile).metadata();
  if (!metadata.hasAlpha || metadata.channels !== 4 || !metadata.width || !metadata.height) {
    throw new Error("The canonical venue artwork must be an RGBA image with a real alpha channel.");
  }

  const { data, info } = await sharp(inputFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = measureArtworkBox(data, info.width, info.height, info.channels);
  const master = sharp(inputFile).ensureAlpha();
  const trimmed = master.clone().extract(box);

  console.log(`master            ${info.width}x${info.height}, RGBA`);
  console.log(`visible artwork   ${box.width}x${box.height} at ${box.left},${box.top}`);

  await Promise.all([
    buildHeroDesktop(trimmed),
    buildHeroMobile(trimmed),
    buildVenueDetail(master),
    buildSocialShare(trimmed),
  ]);

  const manifest = {
    master: "source/wedding-illustration-master.png",
    sourceSize: { width: info.width, height: info.height },
    visibleArtwork: box,
    assets: {
      heroDesktop: { file: "venue-hero-desktop-master.webp", width: 1600, height: 1000 },
      heroMobile: { file: "venue-hero-mobile-master.webp", width: 900, height: 1800 },
      venueDetail: { file: "venue-detail-master.webp", width: 1200, height: 1000 },
      socialShare: { file: "social-share.jpg", width: 1200, height: 630 },
    },
    transforms: ["crop", "scale", "transparent-canvas composition"],
    colourOrStyleAdjustments: false,
  };

  await writeFile(path.join(outputDir, "venue-assets.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("wrote             hero desktop, hero mobile, venue detail, social share, manifest");
}

await main();
