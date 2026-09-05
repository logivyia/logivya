import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(repoRoot, "packages", "docs", "google-play", "store-assets-v178");
const backgroundPath = path.join(outputDir, "brand-background-portrait.png");

const width = 1080;
const height = 1920;
const screenshotWidth = 900;
const screenshotHeight = 1390;
const screenshotX = Math.round((width - screenshotWidth) / 2);
const screenshotY = 455;

const scenes = [
  {
    file: "phone-01-dashboard.png",
    source: "applescreen1.jpeg",
    title: ["İletişiminizi", "tek yerden yönetin"],
    subtitle: "Hesaplar, gruplar ve kişiler bir bakışta",
  },
  {
    file: "phone-02-categories.png",
    source: "applescreen2.jpeg",
    title: ["Grupları kategorilerle", "düzenleyin"],
    subtitle: "Arayın, filtreleyin ve hedeflerinizi kolayca yönetin",
  },
  {
    file: "phone-03-messaging.png",
    source: "applescreen3.jpeg",
    title: ["Mesaj akışınızı", "planlayın"],
    subtitle: "İzinli kişi ve gruplara güvenli biçimde ulaşın",
  },
  {
    file: "phone-04-compose.png",
    source: "screenap6.jpeg",
    title: ["Şimdi gönderin,", "zamanlayın veya tekrarlayın"],
    subtitle: "Hedefi seçin ve gönderim zamanını siz belirleyin",
  },
  {
    file: "phone-05-support.png",
    source: "applescreen4.jpeg",
    title: ["Destek uygulamanın", "hemen içinde"],
    subtitle: "Sorun bildirin ve taleplerinizi tek yerden takip edin",
  },
  {
    file: "phone-06-subscription.png",
    source: "applescreen5.jpeg",
    title: ["Paketinizi ve kullanımınızı", "takip edin"],
    subtitle: "Abonelik durumunu ve plan ayrıntılarını görüntüleyin",
  },
  {
    file: "phone-07-notifications.png",
    title: ["Bildirimleri size göre", "ayarlayın"],
    subtitle: "Kategori, kanal, özet ve sessiz saat seçenekleri",
    features: [
      ["Kategori ve kanal seçimi", "Uygulama içi, e-posta ve Android bildirimlerini ayrı ayrı yönetin"],
      ["Esnek teslimat", "Anında, günlük özet veya haftalık özet seçeneklerinden birini kullanın"],
      ["Sessiz saatler", "Bildirim almak istemediğiniz zaman aralığını siz belirleyin"],
    ],
  },
  {
    file: "phone-08-security.png",
    title: ["Hesabınız için", "çok katmanlı koruma"],
    subtitle: "Güvenlik yöntemlerinizi dilediğiniz zaman yönetin",
    features: [
      ["İki adımlı doğrulama", "Authenticator uygulaması veya e-posta doğrulamasını etkinleştirin"],
      ["Mobil uygulama kilidi", "Altı haneli PIN ve desteklenen cihaz biyometrisini kullanın"],
      ["Oturum kontrolü", "Güvenilir cihazları ve aktif oturumları tek yerden yönetin"],
    ],
  },
];

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function wrapText(value, maxLength = 47) {
  const lines = [];
  let current = "";
  for (const word of value.split(/\s+/u)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function headlineSvg(scene) {
  const firstLine = escapeXml(scene.title[0]);
  const secondLine = escapeXml(scene.title[1]);
  const subtitle = escapeXml(scene.subtitle);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#000814" flood-opacity="0.55"/>
        </filter>
      </defs>
      <text x="90" y="92" fill="#FF6B00" font-family="Arial, sans-serif" font-size="28" font-weight="800" letter-spacing="8">LOGIVYA</text>
      <rect x="90" y="125" width="74" height="7" rx="3.5" fill="#FF6B00"/>
      <text x="90" y="216" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="58" font-weight="800">${firstLine}</text>
      <text x="90" y="282" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="58" font-weight="800">${secondLine}</text>
      <text x="90" y="350" fill="#B7C0D1" font-family="Arial, sans-serif" font-size="29" font-weight="500">${subtitle}</text>
      <rect x="68" y="433" width="944" height="1434" rx="56" fill="#020617" opacity="0.78" filter="url(#shadow)"/>
      <rect x="78" y="443" width="924" height="1414" rx="48" fill="none" stroke="#334967" stroke-width="3"/>
    </svg>
  `);
}

async function roundedScreenshot(sourcePath) {
  const mask = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${screenshotWidth}" height="${screenshotHeight}">
      <rect width="${screenshotWidth}" height="${screenshotHeight}" rx="42" fill="#fff"/>
    </svg>
  `);
  return sharp(sourcePath)
    .rotate()
    .resize({ width: screenshotWidth, height: screenshotHeight, fit: "cover", position: "top" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function featurePanelSvg(scene) {
  const cards = scene.features.map(([title, description], index) => {
    const y = 40 + index * 390;
    const descriptionLines = wrapText(description)
      .map((line, lineIndex) => `<text x="78" y="${y + 182 + lineIndex * 42}" fill="#B7C0D1" font-family="Arial, sans-serif" font-size="28" font-weight="500">${escapeXml(line)}</text>`)
      .join("");
    return `
      <rect x="28" y="${y}" width="844" height="320" rx="34" fill="#101B2D" stroke="#334967" stroke-width="3"/>
      <circle cx="105" cy="${y + 82}" r="40" fill="#17314A"/>
      <text x="105" y="${y + 96}" text-anchor="middle" fill="#12B981" font-family="Arial, sans-serif" font-size="42" font-weight="800">✓</text>
      <text x="170" y="${y + 77}" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="35" font-weight="800">${escapeXml(title)}</text>
      ${descriptionLines}
    `;
  }).join("");
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${screenshotWidth}" height="${screenshotHeight}">
      ${cards}
    </svg>
  `);
}

async function generate(scene) {
  const panel = scene.source
    ? await roundedScreenshot(path.join(repoRoot, scene.source))
    : featurePanelSvg(scene);
  const outputPath = path.join(outputDir, scene.file);
  await sharp(backgroundPath)
    .resize({ width, height, fit: "cover", position: "centre" })
    .composite([
      { input: headlineSvg(scene), top: 0, left: 0 },
      { input: panel, top: screenshotY, left: screenshotX },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`Invalid screenshot dimensions for ${scene.file}`);
  }
  return {
    file: path.relative(repoRoot, outputPath).replaceAll("\\", "/"),
    source: scene.source ?? "marketing-feature-card",
    width: metadata.width,
    height: metadata.height,
    title: scene.title.join(" "),
  };
}

await mkdir(outputDir, { recursive: true });
const outputs = [];
for (const scene of scenes) outputs.push(await generate(scene));
const manifestPath = path.join(outputDir, "asset-manifest.json");
await writeFile(manifestPath, `${JSON.stringify({ locale: "tr-TR", generatedAt: new Date().toISOString(), outputs }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, outputDir, manifestPath, outputs }, null, 2));
