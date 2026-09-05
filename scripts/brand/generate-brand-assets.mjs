import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const publicBrandDirectory = path.join(repositoryRoot, "public", "logivya");
const mobileDirectory = path.join(repositoryRoot, "apps", "mobile");

const wordmarkPath = path.join(publicBrandDirectory, "logo-transparent-v5.png");
const featherPath = path.join(publicBrandDirectory, "favicon-master.png");
const faviconArtworkPath = path.join(publicBrandDirectory, "favicon-circle-white-master.jpg");
const notificationSourcePath = path.join(mobileDirectory, "assets", "icons", "notification-icon.png");

const faviconSizes = [16, 32, 48, 96, 192, 512];

const notificationDensities = [
  ["drawable-mdpi", 24],
  ["drawable-hdpi", 36],
  ["drawable-xhdpi", 48],
  ["drawable-xxhdpi", 72],
  ["drawable-xxxhdpi", 96],
];

async function generateOpenGraphCard() {
  const wordmark = await sharp(wordmarkPath)
    .resize({ width: 900, withoutEnlargement: true })
    .png()
    .toBuffer();

  const background = Buffer.from(`
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#12264d"/>
          <stop offset="58%" stop-color="#08152c"/>
          <stop offset="100%" stop-color="#040a16"/>
        </radialGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ff7600"/>
          <stop offset="68%" stop-color="#ff3d00"/>
          <stop offset="100%" stop-color="#285cff"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#glow)"/>
      <rect y="621" width="1200" height="9" fill="url(#accent)"/>
    </svg>
  `);

  const card = await sharp(background)
    .composite([{ input: wordmark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await Promise.all([
    sharp(card).toFile(path.join(publicBrandDirectory, "og-image-v3.png")),
    sharp(card).toFile(path.join(publicBrandDirectory, "og-image-v2.png")),
  ]);
}

async function createWhiteNotificationMark() {
  const rotatedFeather = await sharp(featherPath)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: 760, withoutEnlargement: true })
    .rotate(-35, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < rotatedFeather.data.length; offset += rotatedFeather.info.channels) {
    rotatedFeather.data[offset] = 255;
    rotatedFeather.data[offset + 1] = 255;
    rotatedFeather.data[offset + 2] = 255;
  }

  const whiteFeather = await sharp(rotatedFeather.data, { raw: rotatedFeather.info })
    .png()
    .toBuffer();
  const featherMetadata = await sharp(whiteFeather).metadata();
  const left = Math.round((1024 - featherMetadata.width) / 2);
  const top = Math.round((1024 - featherMetadata.height) / 2);

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{ input: whiteFeather, left, top }])
    .png()
    .toBuffer();
}

async function generateNotificationIcons() {
  const master = await createWhiteNotificationMark();
  const resourceRoot = path.join(mobileDirectory, "android", "app", "src", "main", "res");

  await Promise.all([
    sharp(master).png({ compressionLevel: 9 }).toFile(notificationSourcePath),
    ...notificationDensities.map(([directory, size]) =>
      sharp(master)
        .resize(size, size, { fit: "fill" })
        .png({ compressionLevel: 9 })
        .toFile(path.join(resourceRoot, directory, "notification_icon.png")),
    ),
  ]);
}

function createPngIco(images) {
  const directorySize = 6 + images.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = directorySize;
  for (const [index, image] of images.entries()) {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset);
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.buffer.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.buffer.length;
  }

  return Buffer.concat([header, ...images.map((image) => image.buffer)]);
}

async function createFaviconMaster() {
  return sharp(faviconArtworkPath)
    .rotate()
    .resize(512, 512, { fit: "cover", position: "center", kernel: sharp.kernel.lanczos3 })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function generateFavicons() {
  const master = await createFaviconMaster();
  const images = await Promise.all(faviconSizes.map(async (size) => ({
    size,
    buffer: await sharp(master)
      .resize(size, size, { fit: "fill" })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer(),
  })));
  const imageBySize = new Map(images.map((image) => [image.size, image.buffer]));

  await Promise.all([
    ...images.map((image) => sharp(image.buffer).toFile(path.join(repositoryRoot, "public", `favicon-${image.size}x${image.size}.png`))),
    sharp(imageBySize.get(192)).toFile(path.join(repositoryRoot, "public", "android-chrome-192x192.png")),
    sharp(imageBySize.get(512)).toFile(path.join(repositoryRoot, "public", "android-chrome-512x512.png")),
    sharp(master).resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(repositoryRoot, "public", "apple-touch-icon.png")),
  ]);

  const ico = createPngIco(images.filter(({ size }) => size <= 48));
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(path.join(repositoryRoot, "public", "favicon.ico"), ico),
  );
}

await Promise.all([generateOpenGraphCard(), generateNotificationIcons(), generateFavicons()]);
