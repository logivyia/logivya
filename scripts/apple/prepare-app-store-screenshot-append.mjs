import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { repoRoot } from "./app-store-connect-client.mjs";

const sourceFiles = [6, 7, 8, 9].map((index) => ({
  index,
  filePath: path.join(repoRoot, `screenap${index}.jpeg`),
}));

const targets = [
  { directory: "iphone-6.5", width: 1284, height: 2778 },
  { directory: "iphone-6.9", width: 1320, height: 2868 },
  { directory: "ipad-13", width: 2064, height: 2752 },
];

const screenshotRoot = path.join(
  repoRoot,
  "artifacts",
  "app-store",
  "screenshots",
  "tr-TR",
);

async function verifySources() {
  for (const source of sourceFiles) {
    const file = await stat(source.filePath);
    if (!file.isFile() || file.size < 1) {
      throw new Error(`Missing screenshot source: ${source.filePath}`);
    }
    const metadata = await sharp(source.filePath).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 320 || metadata.height < 320) {
      throw new Error(`Invalid screenshot dimensions: ${source.filePath}`);
    }
  }
}

async function renderTarget(target) {
  const directory = path.join(screenshotRoot, target.directory);
  await mkdir(directory, { recursive: true });
  const outputs = [];

  for (const source of sourceFiles) {
    const outputPath = path.join(directory, `${String(source.index).padStart(2, "0")}.png`);
    await sharp(source.filePath)
      .rotate()
      .resize(target.width, target.height, {
        fit: "contain",
        background: { r: 7, g: 20, b: 38, alpha: 1 },
      })
      .flatten({ background: { r: 7, g: 20, b: 38 } })
      .toColourspace("srgb")
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath);

    const metadata = await sharp(outputPath).metadata();
    if (
      metadata.width !== target.width
      || metadata.height !== target.height
      || metadata.channels !== 3
      || metadata.hasAlpha
    ) {
      throw new Error(`Generated screenshot validation failed: ${outputPath}`);
    }
    outputs.push(outputPath);
  }

  return outputs;
}

async function main() {
  await verifySources();
  const result = [];
  for (const target of targets) {
    result.push({
      target: target.directory,
      width: target.width,
      height: target.height,
      files: await renderTarget(target),
    });
  }
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
