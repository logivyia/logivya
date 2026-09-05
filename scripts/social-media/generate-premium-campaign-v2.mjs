import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(
  repoRoot,
  "packages",
  "docs",
  "social-media",
  "premium-campaign-v2",
);
const readyDir = path.join(outputDir, "paylasima-hazir");
const logoPath = path.join(repoRoot, "public", "logivya", "logo-transparent-v5.png");
const width = 1080;
const height = 1350;

const slides = [
  {
    file: "logivya-zamaninizi-geri-alin.png",
    background: "background-time.png",
    tag: "AKILLI AKIŞLAR",
    title: ["Zamanınızı", "geri alın."],
    subtitle: [
      "Tekrarlanan işleri planlayın; iletişiminiz",
      "siz işinize odaklanırken düzenli biçimde ilerlesin.",
    ],
    pills: ["PLANLAYIN", "TEKRARLAYIN", "ODAKLANIN"],
    caption:
      "Zamanınızı geri alın. Tekrarlanan iletişim akışlarını planlayın; siz işinize odaklanırken Logivya düzeni sürdürsün.\n\nlogivya.com\ninfo@logivya.com",
  },
  {
    file: "logivya-daginiklik-biter-akis-baslar.png",
    background: "background-clarity.png",
    tag: "KARMAŞADAN NETLİĞE",
    title: ["Dağınıklık biter.", "Akış başlar."],
    subtitle: [
      "Hesaplarınızı, kişilerinizi ve gruplarınızı",
      "tek merkezde düzenli ve güncel tutun.",
    ],
    pills: ["TEK MERKEZ", "GÜNCEL", "SADE"],
    caption:
      "Dağınıklık biter, akış başlar. Hesaplarınızı, kişilerinizi ve gruplarınızı tek merkezde düzenli ve güncel tutun.\n\nlogivya.com\ninfo@logivya.com",
  },
  {
    file: "logivya-dogru-an-etkiyi-buyutur.png",
    background: "background-moment.png",
    tag: "ETKİYİ ZAMANLAYIN",
    title: ["Doğru an,", "etkiyi büyütür."],
    subtitle: [
      "Mesajınızı doğru hedefe şimdi gönderin,",
      "ileri tarihe planlayın veya düzenli tekrarlayın.",
    ],
    pills: ["ŞİMDİ", "ZAMANLA", "TEKRARLA"],
    caption:
      "Doğru an, etkiyi büyütür. Mesajınızı şimdi gönderin, ileri tarihe planlayın veya düzenli olarak tekrarlayın.\n\nlogivya.com\ninfo@logivya.com",
  },
  {
    file: "logivya-buyudukce-sadelesin.png",
    background: "background-scale.png",
    tag: "BÜYÜMEK KARMAŞIK DEĞİL",
    title: ["Büyüdükçe", "sadeleşin."],
    subtitle: [
      "Yeni hesaplar, kişiler ve gruplar eklenirken",
      "düzeninizi ve kontrolünüzü koruyun.",
    ],
    pills: ["DÜZEN", "ÖLÇEK", "KONTROL"],
    caption:
      "Büyüdükçe sadeleşin. Yeni hesaplar, kişiler ve gruplar eklenirken düzeninizi ve kontrolünüzü koruyun.\n\nlogivya.com\ninfo@logivya.com",
  },
  {
    file: "logivya-guven-gorunmeden-calisir.png",
    background: "background-trust.png",
    tag: "SESSİZ GÜÇ",
    title: ["Güven,", "görünmeden çalışır."],
    subtitle: [
      "Çok katmanlı güvenlik, oturum kontrolü ve",
      "biyometriyle iletişiminizi sakin bir güçle koruyun.",
    ],
    pills: ["GİRİŞ", "BİYOMETRİ", "OTURUM"],
    caption:
      "Güven, görünmeden çalışır. Çok katmanlı güvenlik, oturum kontrolü ve biyometriyle iletişiminizi sakin bir güçle koruyun.\n\nlogivya.com\ninfo@logivya.com",
  },
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function titleMarkup(lines) {
  return lines
    .map(
      (line, index) =>
        `<text x="72" y="${350 + index * 82}" fill="#FFFFFF" font-family="Arial, Segoe UI, sans-serif" font-size="72" font-weight="800" letter-spacing="-2">${escapeXml(line)}</text>`,
    )
    .join("");
}

function subtitleMarkup(lines) {
  return lines
    .map(
      (line, index) =>
        `<text x="74" y="${575 + index * 42}" fill="#C8D2E0" font-family="Arial, Segoe UI, sans-serif" font-size="27" font-weight="500">${escapeXml(line)}</text>`,
    )
    .join("");
}

function pillMarkup(items) {
  const y = 1092;
  const gap = 18;
  const available = 936;
  const pillWidth = Math.floor((available - gap * (items.length - 1)) / items.length);
  return items
    .map((item, index) => {
      const x = 72 + index * (pillWidth + gap);
      return `
        <rect x="${x}" y="${y}" width="${pillWidth}" height="82" rx="24" fill="#071629" fill-opacity="0.88" stroke="#355071" stroke-width="2"/>
        <circle cx="${x + 36}" cy="${y + 41}" r="9" fill="#FF6B00"/>
        <text x="${x + 58}" y="${y + 50}" fill="#FFFFFF" font-family="Arial, Segoe UI, sans-serif" font-size="20" font-weight="800" letter-spacing="1">${escapeXml(item)}</text>
      `;
    })
    .join("");
}

function overlaySvg(slide) {
  const tagWidth = Math.max(280, slide.tag.length * 15 + 46);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="leftScrim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#020814" stop-opacity="0.96"/>
          <stop offset="0.58" stop-color="#020814" stop-opacity="0.72"/>
          <stop offset="1" stop-color="#020814" stop-opacity="0.08"/>
        </linearGradient>
        <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#020814" stop-opacity="0.70"/>
          <stop offset="1" stop-color="#020814" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="url(#leftScrim)"/>
      <rect width="1080" height="330" fill="url(#topScrim)"/>
      <rect x="72" y="212" width="${tagWidth}" height="52" rx="18" fill="#FF6B00" fill-opacity="0.14" stroke="#FF6B00" stroke-opacity="0.55"/>
      <text x="94" y="246" fill="#FF8A35" font-family="Arial, Segoe UI, sans-serif" font-size="20" font-weight="800" letter-spacing="2">${escapeXml(slide.tag)}</text>
      ${titleMarkup(slide.title)}
      ${subtitleMarkup(slide.subtitle)}
      ${pillMarkup(slide.pills)}
      <line x1="72" y1="1270" x2="1008" y2="1270" stroke="#5A6C82" stroke-opacity="0.28"/>
      <text x="72" y="1310" fill="#91A3BB" font-family="Arial, Segoe UI, sans-serif" font-size="20" font-weight="650" letter-spacing="1">logivya.com</text>
    </svg>
  `);
}

async function generateSlide(slide) {
  const backgroundPath = path.join(outputDir, slide.background);
  const logo = await sharp(logoPath)
    .resize({ width: 255, fit: "inside" })
    .png()
    .toBuffer();
  const outputPath = path.join(readyDir, slide.file);
  await sharp(backgroundPath)
    .resize({ width, height, fit: "cover", position: "centre" })
    .composite([
      { input: overlaySvg(slide), left: 0, top: 0 },
      { input: logo, left: 72, top: 46 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`Unexpected output dimensions for ${slide.file}.`);
  }
  return {
    file: path.relative(repoRoot, outputPath).replaceAll("\\", "/"),
    width: metadata.width,
    height: metadata.height,
    title: slide.title.join(" "),
    caption: slide.caption,
  };
}

await mkdir(readyDir, { recursive: true });
const outputs = [];
for (const slide of slides) {
  outputs.push(await generateSlide(slide));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  generationMode: "AI-generated backgrounds with deterministic brand typography",
  platformFormat: "Instagram/Facebook portrait 4:5",
  dimensions: { width, height },
  numberingVisible: false,
  outputs,
};
await writeFile(
  path.join(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({ ok: true, outputDir, outputs }, null, 2));
