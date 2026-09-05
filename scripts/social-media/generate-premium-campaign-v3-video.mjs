import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const campaignDir = path.join(repoRoot, "packages", "docs", "social-media", "premium-campaign-v3");
const readyDir = path.join(campaignDir, "paylasima-hazir");
const ffmpeg = process.env.LOGIVYA_FFMPEG || "C:\\Users\\burak\\AppData\\Local\\Temp\\logivya-imageio-ffmpeg\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe";
const output = path.join(readyDir, "logivya-premium-seri-v3-shorts-tiktok.mp4");
const images = [
  "logivya-ekibiniz-ayni-ritimde.png",
  "logivya-gonderdiginizi-bilin.png",
  "logivya-akis-kesilmez.png",
  "logivya-sorun-buyumeden.png",
  "logivya-sifreyi-degil-isinizi-hatirlayin.png",
];

const args = ["-y"];
for (const image of images) {
  args.push("-loop", "1", "-t", "9", "-i", path.join(readyDir, image));
}
args.push(
  "-f",
  "lavfi",
  "-i",
  "aevalsrc=0.055*sin(2*PI*55*t)+0.030*sin(2*PI*82.41*t)+0.020*sin(2*PI*110*t)+0.012*sin(2*PI*220*t)*(0.55+0.45*sin(2*PI*0.12*t)):s=48000:d=41",
);

const visualFilters = images.map((_, index) =>
  `[${index}:v]split=2[b${index}][f${index}];` +
  `[b${index}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=36:12,eq=brightness=-0.22:saturation=0.78[bg${index}];` +
  `[f${index}]scale=1000:1250:force_original_aspect_ratio=decrease[fg${index}];` +
  `[bg${index}][fg${index}]overlay=(W-w)/2:(H-h)/2,format=yuv420p,fps=30,setsar=1[v${index}]`,
);
const xfade = [
  "[v0][v1]xfade=transition=fade:duration=1:offset=8[x1]",
  "[x1][v2]xfade=transition=fade:duration=1:offset=16[x2]",
  "[x2][v3]xfade=transition=fade:duration=1:offset=24[x3]",
  "[x3][v4]xfade=transition=fade:duration=1:offset=32[vout]",
];
const audio = "[5:a]lowpass=f=950,aecho=0.8:0.72:480|960:0.20|0.12,afade=t=in:st=0:d=2,afade=t=out:st=38:d=3,volume=0.62[aout]";

args.push(
  "-filter_complex",
  [...visualFilters, ...xfade, audio].join(";"),
  "-map",
  "[vout]",
  "-map",
  "[aout]",
  "-t",
  "41",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "19",
  "-profile:v",
  "high",
  "-level",
  "4.1",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  output,
);

await new Promise((resolve, reject) => {
  const child = spawn(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
});

const manifestPath = path.join(campaignDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.video = {
  file: path.relative(repoRoot, output).replaceAll("\\", "/"),
  format: "Vertical 9:16 MP4",
  dimensions: { width: 1080, height: 1920 },
  durationSeconds: 41,
  audio: "Original royalty-free ambient electronic soundtrack generated for Logivya",
  youtubeTitle: "İletişiminizi Logivya ile Akışa Dönüştürün",
  caption: "Ekibiniz aynı ritimde ilerlesin. Mesajlarınızı görün, web ve mobilde kesintisiz çalışın, desteğe kolayca ulaşın ve hızlıca başlayın.\n\nlogivya.com\ninfo@logivya.com",
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, output, durationSeconds: 41 }, null, 2));
