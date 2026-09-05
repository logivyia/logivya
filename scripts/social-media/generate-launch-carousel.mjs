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
  "launch-carousel-v1",
);
const logoPath = path.join(
  repoRoot,
  "public",
  "logivya",
  "logo-transparent-v5.png",
);
const width = 1080;
const height = 1350;

const slides = [
  {
    file: "01-logivya-iletisim-merkezi.png",
    background: "background-01.png",
    tag: "İLETİŞİMİN YENİ MERKEZİ",
    title: ["Tüm iletişim akışınız.", "Tek platform."],
    subtitle: [
      "WhatsApp hesaplarınızı, gruplarınızı, mesajlarınızı",
      "ve bildirimlerinizi sade bir deneyimde yönetin.",
    ],
    pills: ["BAĞLAYIN", "DÜZENLEYİN", "PLANLAYIN"],
    layout: "cover",
  },
  {
    file: "02-logivya-hesap-kisi-grup.png",
    background: "background-02.png",
    tag: "BAĞLAYIN VE GÜNCEL TUTUN",
    title: ["Hesaplar, kişiler", "ve gruplar hep güncel."],
    subtitle: [
      "WhatsApp hesabınızı bağlayın. Yeni kişi ve grupları",
      "bağlantıyı kesmeden yenileyin.",
    ],
    bullets: [
      "Bağlantı durumunu tek ekrandan izleyin",
      "Yeni kişi ve grupları anında yenileyin",
      "Yetkili hesaplarınızı tek yerde görün",
    ],
    layout: "bullets",
  },
  {
    file: "03-logivya-kategori-mesaj-planlama.png",
    background: "background-03.png",
    tag: "DÜZENLEYİN VE PLANLAYIN",
    title: ["Doğru mesaj.", "Doğru hedef.", "Doğru zaman."],
    subtitle: [
      "Grupları kategorilere ayırın; mesajınızı şimdi gönderin,",
      "zamanlayın veya düzenli olarak tekrarlayın.",
    ],
    pills: ["KATEGORİLER", "ZAMANLAMA", "TEKRAR"],
    layout: "pills",
  },
  {
    file: "04-logivya-bildirim-kontrolu.png",
    background: "background-04.png",
    tag: "BİLDİRİMLER SİZE UYSUN",
    title: ["Kontrol sizde.", "Gürültü değil."],
    subtitle: [
      "Kategoriyi, kanalı ve teslimat zamanını siz seçin.",
      "İşinize odaklanırken önemli gelişmeleri kaçırmayın.",
    ],
    pills: ["ANLIK", "GÜNLÜK ÖZET", "SESSİZ SAATLER"],
    layout: "pills",
  },
  {
    file: "05-logivya-guvenlik.png",
    background: "background-05.png",
    tag: "GÜVENLE YÖNETİN",
    title: ["İletişiminiz için", "çok katmanlı koruma."],
    subtitle: [
      "Google veya Apple ile giriş, iki adımlı doğrulama,",
      "PIN, biyometri ve oturum kontrolü.",
    ],
    bullets: [
      "Güvenlik yöntemlerinizi dilediğiniz zaman yönetin",
      "Uygulama kilidi ve biyometriyle erişimi koruyun",
      "Geri bildirim ve desteğe uygulama içinden ulaşın",
    ],
    cta: "LOGIVYA İLE BAŞLAYIN",
    layout: "security",
  },
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function titleMarkup(lines, startY, fontSize, lineHeight) {
  return lines
    .map(
      (line, index) =>
        `<text x="72" y="${startY + index * lineHeight}" fill="#FFFFFF" font-family="Arial, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-2">${escapeXml(line)}</text>`,
    )
    .join("");
}

function subtitleMarkup(lines, startY) {
  return lines
    .map(
      (line, index) =>
        `<text x="74" y="${startY + index * 40}" fill="#C5CFDE" font-family="Arial, Segoe UI, sans-serif" font-size="27" font-weight="500">${escapeXml(line)}</text>`,
    )
    .join("");
}

function pillMarkup(items, y) {
  const gap = 18;
  const available = 936;
  const pillWidth = Math.floor((available - gap * (items.length - 1)) / items.length);
  return items
    .map((item, index) => {
      const x = 72 + index * (pillWidth + gap);
      return `
        <rect x="${x}" y="${y}" width="${pillWidth}" height="84" rx="24" fill="#08182B" fill-opacity="0.88" stroke="#355071" stroke-width="2"/>
        <circle cx="${x + 36}" cy="${y + 42}" r="9" fill="#FF6B00"/>
        <text x="${x + 58}" y="${y + 51}" fill="#FFFFFF" font-family="Arial, Segoe UI, sans-serif" font-size="21" font-weight="800" letter-spacing="1">${escapeXml(item)}</text>
      `;
    })
    .join("");
}

function bulletMarkup(items, startY, width = 650) {
  return items
    .map((item, index) => {
      const y = startY + index * 104;
      return `
        <rect x="72" y="${y}" width="${width}" height="84" rx="24" fill="#07172A" fill-opacity="0.9" stroke="#304A68" stroke-width="2"/>
        <circle cx="112" cy="${y + 42}" r="18" fill="#173451"/>
        <path d="M104 ${y + 42} l6 7 l12 -15" fill="none" stroke="#FF7A19" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="148" y="${y + 51}" fill="#FFFFFF" font-family="Arial, Segoe UI, sans-serif" font-size="24" font-weight="650">${escapeXml(item)}</text>
      `;
    })
    .join("");
}

function overlaySvg(slide) {
  const cover = slide.layout === "cover";
  const titleY = cover ? 372 : 330;
  const titleSize = cover ? 74 : slide.title.length === 3 ? 64 : 66;
  const lineHeight = cover ? 86 : 76;
  const subtitleY = titleY + slide.title.length * lineHeight + 42;
  const content =
    slide.layout === "bullets"
      ? bulletMarkup(slide.bullets, 770, 660)
      : slide.layout === "security"
        ? `${bulletMarkup(slide.bullets, 690, 700)}
           <rect x="72" y="1090" width="440" height="92" rx="28" fill="#FF6B00"/>
           <text x="292" y="1148" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Segoe UI, sans-serif" font-size="24" font-weight="800" letter-spacing="1">${escapeXml(slide.cta)}</text>`
        : pillMarkup(slide.pills, cover ? 1088 : 1098);

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#020814" stop-opacity="0.94"/>
          <stop offset="0.52" stop-color="#031020" stop-opacity="0.62"/>
          <stop offset="1" stop-color="#031020" stop-opacity="0.10"/>
        </linearGradient>
        <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#020814" stop-opacity="0.72"/>
          <stop offset="1" stop-color="#020814" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="url(#scrim)"/>
      <rect width="1080" height="300" fill="url(#topShade)"/>
      <rect x="72" y="212" width="${Math.max(300, slide.tag.length * 15 + 44)}" height="52" rx="18" fill="#FF6B00" fill-opacity="0.14" stroke="#FF6B00" stroke-opacity="0.55"/>
      <text x="94" y="246" fill="#FF8A35" font-family="Arial, Segoe UI, sans-serif" font-size="20" font-weight="800" letter-spacing="2">${escapeXml(slide.tag)}</text>
      ${titleMarkup(slide.title, titleY, titleSize, lineHeight)}
      ${subtitleMarkup(slide.subtitle, subtitleY)}
      ${content}
      <line x1="72" y1="1270" x2="1008" y2="1270" stroke="#5A6C82" stroke-opacity="0.28"/>
      <text x="72" y="1310" fill="#8FA1B9" font-family="Arial, Segoe UI, sans-serif" font-size="20" font-weight="600" letter-spacing="1">logivya.com</text>
    </svg>
  `);
}

async function generateSlide(slide) {
  const backgroundPath = path.join(outputDir, slide.background);
  const logo = await sharp(logoPath)
    .resize({ width: 255, fit: "inside" })
    .png()
    .toBuffer();
  const outputPath = path.join(outputDir, slide.file);
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
  };
}

await mkdir(outputDir, { recursive: true });
const outputs = [];
for (const slide of slides) {
  outputs.push(await generateSlide(slide));
}
const manifest = {
  generatedAt: new Date().toISOString(),
  platformFormat: "Instagram/Facebook portrait 4:5",
  dimensions: { width, height },
  outputs,
};
await writeFile(
  path.join(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({ ok: true, outputDir, outputs }, null, 2));
