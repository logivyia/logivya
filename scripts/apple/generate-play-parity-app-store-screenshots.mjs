import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(repoRoot, "packages", "docs", "google-play", "store-assets-v178");
const outputRoot = path.join(
  repoRoot,
  "artifacts",
  "app-store",
  "screenshots",
  "play-parity-v187",
  "tr-TR",
);

const targets = [
  { directory: "iphone-6.5", width: 1284, height: 2778, margin: 52, radius: 42 },
  { directory: "ipad-13", width: 2064, height: 2752, margin: 76, radius: 48 },
];

const sources = (await readdir(sourceRoot))
  .filter((file) => /^phone-\d{2}-.+\.png$/u.test(file))
  .sort((left, right) => left.localeCompare(right));

if (sources.length !== 8) {
  throw new Error(`Expected 8 approved Google Play screenshots, found ${sources.length}.`);
}

const outputs = [];
for (const target of targets) {
  const targetDirectory = path.join(outputRoot, target.directory);
  await mkdir(targetDirectory, { recursive: true });

  for (const [index, sourceName] of sources.entries()) {
    const sourcePath = path.join(sourceRoot, sourceName);
    const outputName = sourceName.replace(/^phone-/u, "");
    const outputPath = path.join(targetDirectory, outputName);
    const availableWidth = target.width - target.margin * 2;
    const availableHeight = target.height - target.margin * 2;

    const foreground = await sharp(sourcePath)
      .resize({ width: availableWidth, height: availableHeight, fit: "contain", withoutEnlargement: false })
      .png()
      .toBuffer();
    const foregroundMetadata = await sharp(foreground).metadata();
    const foregroundWidth = foregroundMetadata.width ?? availableWidth;
    const foregroundHeight = foregroundMetadata.height ?? availableHeight;
    const left = Math.round((target.width - foregroundWidth) / 2);
    const top = Math.round((target.height - foregroundHeight) / 2);
    const mask = Buffer.from(
      `<svg width="${foregroundWidth}" height="${foregroundHeight}"><rect width="${foregroundWidth}" height="${foregroundHeight}" rx="${target.radius}" fill="white"/></svg>`,
    );
    const roundedForeground = await sharp(foreground)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    const background = await sharp(sourcePath)
      .resize(target.width, target.height, { fit: "cover" })
      .blur(42)
      .modulate({ brightness: 0.5, saturation: 1.08 })
      .png()
      .toBuffer();
    const frame = Buffer.from(
      `<svg width="${target.width}" height="${target.height}">
        <rect width="100%" height="100%" fill="#071426" fill-opacity="0.18"/>
        <rect x="${left - 3}" y="${top - 3}" width="${foregroundWidth + 6}" height="${foregroundHeight + 6}" rx="${target.radius + 3}" fill="none" stroke="#314761" stroke-width="6"/>
      </svg>`,
    );

    await sharp(background)
      .composite([
        { input: frame, top: 0, left: 0 },
        { input: roundedForeground, top, left },
      ])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath);

    const file = await readFile(outputPath);
    const metadata = await sharp(file).metadata();
    outputs.push({
      order: index + 1,
      source: path.relative(repoRoot, sourcePath).replaceAll("\\", "/"),
      file: path.relative(repoRoot, outputPath).replaceAll("\\", "/"),
      width: metadata.width,
      height: metadata.height,
      sha256: createHash("sha256").update(file).digest("hex"),
    });
  }
}

const manifestPath = path.join(outputRoot, "asset-manifest.json");
await writeFile(
  manifestPath,
  `${JSON.stringify({
    sourceSet: "google-play-store-assets-v178",
    release: "ios-v175-1.0.5",
    generatedAt: new Date().toISOString(),
    strategy: "deterministic-resize-with-safe-area; no generative text or content changes",
    outputs,
  }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ ok: true, outputRoot, manifestPath, count: outputs.length }, null, 2));
