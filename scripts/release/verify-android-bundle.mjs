import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith("--")) continue;
  const [key, inlineValue] = token.slice(2).split("=", 2);
  const value = inlineValue ?? (process.argv[index + 1]?.startsWith("--") ? "true" : process.argv[++index]);
  args.set(key, value);
}

const aabPath = path.resolve(args.get("aab") || process.env.LOGIVYA_AAB_PATH || "");
const bundletoolPath = path.resolve(args.get("bundletool") || process.env.BUNDLETOOL_JAR || "");
const expectedCert = normalizeFingerprint(args.get("expected-cert-sha256") || process.env.EXPECTED_UPLOAD_CERT_SHA256 || "");

if (!aabPath || !existsSync(aabPath)) throw new Error("Provide an existing AAB with --aab or LOGIVYA_AAB_PATH.");
if (!bundletoolPath || !existsSync(bundletoolPath)) throw new Error("Provide bundletool with --bundletool or BUNDLETOOL_JAR.");

function normalizeFingerprint(value) {
  return String(value).replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function hashFile(file) {
  const hash = createHash("sha256");
  hash.update(readFileSync(file));
  return hash.digest("hex").toUpperCase();
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  if (result.status !== 0) {
    const diagnostic = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} failed with exit code ${result.status}.${diagnostic ? `\n${diagnostic}` : ""}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function xmlAttribute(source, attribute, label) {
  const value = source.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
  if (!value) throw new Error(`Missing ${label} in merged manifest.`);
  return value;
}

const checks = [];
function check(name, passed, evidence) {
  checks.push({ name, status: passed ? "PASSED" : "FAILED", evidence });
}

const appJson = JSON.parse(readFileSync(path.join(root, "apps/mobile/app.json"), "utf8")).expo;
const expectedPackage = String(appJson.android?.package || "");
const expectedVersionCode = Number(appJson.android?.versionCode);
const expectedVersionName = String(appJson.version || "");

run("java", ["-jar", bundletoolPath, "validate", `--bundle=${aabPath}`]);
const manifest = run("java", ["-jar", bundletoolPath, "dump", "manifest", `--bundle=${aabPath}`, "--module=base"]);
const packageName = xmlAttribute(manifest, "package", "package name");
const versionCode = Number(xmlAttribute(manifest, "android:versionCode", "versionCode"));
const versionName = xmlAttribute(manifest, "android:versionName", "versionName");
const compileSdk = Number(xmlAttribute(manifest, "android:compileSdkVersion", "compileSdkVersion"));
const minSdk = Number(xmlAttribute(manifest, "android:minSdkVersion", "minSdkVersion"));
const targetSdk = Number(xmlAttribute(manifest, "android:targetSdkVersion", "targetSdkVersion"));
const permissions = [...manifest.matchAll(/<uses-permission(?:-sdk-\d+)?[^>]+android:name="([^"]+)"[^>]*\/>/g)].map((match) => match[1]);
const uniquePermissions = [...new Set(permissions)].sort();

const forbiddenPermissions = [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.DETECT_SCREEN_CAPTURE",
  "com.google.android.gms.permission.AD_ID",
  "android.permission.ACCESS_ADSERVICES_ATTRIBUTION",
  "android.permission.ACCESS_ADSERVICES_AD_ID",
];

check("Bundletool validation", true, path.basename(bundletoolPath));
check("Package identifier", packageName === expectedPackage && packageName === "com.logivya.mobile", packageName);
check("Version code", versionCode === expectedVersionCode, `${versionCode} / source ${expectedVersionCode}`);
check("Version name", versionName === expectedVersionName, `${versionName} / source ${expectedVersionName}`);
check("Minimum SDK", minSdk === 24, String(minSdk));
check("Target SDK", targetSdk >= 35, String(targetSdk));
check("Compile SDK", compileSdk >= targetSdk, String(compileSdk));
check("Cleartext traffic disabled", /android:usesCleartextTraffic="false"/.test(manifest), "merged manifest");
check("Application backup disabled", /android:allowBackup="false"/.test(manifest), "merged manifest");
check("Release is not debuggable", !/android:debuggable="true"/.test(manifest), "merged manifest");
for (const permission of forbiddenPermissions) {
  check(`Forbidden permission absent: ${permission}`, !uniquePermissions.includes(permission), "merged manifest");
}

const jarEntries = run("jar", ["tf", aabPath]).split(/\r?\n/).filter(Boolean);
const abis = [...new Set(jarEntries.map((entry) => entry.match(/^base\/lib\/([^/]+)\//)?.[1]).filter(Boolean))].sort();
const requiredAbis = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"];
check("Required Android ABIs", requiredAbis.every((abi) => abis.includes(abi)), abis.join(", "));

const signerOutput = run("jarsigner", ["-verify", "-verbose", "-certs", aabPath]);
check("JAR signature", /jar verified\./i.test(signerOutput), "jarsigner verified");
const certOutput = run("keytool", ["-printcert", "-jarfile", aabPath]);
const actualCert = normalizeFingerprint(certOutput.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1] || "");
check("Upload certificate readable", actualCert.length === 64, actualCert || "missing");
if (expectedCert) check("Upload certificate lineage", actualCert === expectedCert, actualCert || "missing");

const extractionDir = mkdtempSync(path.join(tmpdir(), "logivya-aab-verify-"));
const scanFindings = [];
const localEndpointFiles = new Set();
let productionEndpointEmbedded = false;
try {
  run("jar", ["xf", aabPath], { cwd: extractionDir });
  const patterns = [
    { name: "Private key", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
    { name: "GitHub token", expression: /\b(?:gh[opsu]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g },
    { name: "AWS access key", expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  ];
  const queue = [extractionDir];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      const size = statSync(absolute).size;
      if (size === 0 || size > 40 * 1024 * 1024) continue;
      const content = readFileSync(absolute).toString("utf8");
      const relative = path.relative(extractionDir, absolute).replaceAll("\\", "/");
      if (content.includes("https://www.logivya.com")) productionEndpointEmbedded = true;
      if (/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2)(?::\d+)?/i.test(content)) {
        localEndpointFiles.add(relative);
      }
      for (const pattern of patterns) {
        pattern.expression.lastIndex = 0;
        if (pattern.expression.test(content)) {
          scanFindings.push({ detector: pattern.name, file: relative });
        }
      }
    }
  }
} finally {
  rmSync(extractionDir, { recursive: true, force: true });
}
check("Production API endpoint embedded", productionEndpointEmbedded, "https://www.logivya.com");
check("AAB embedded secret scan", scanFindings.length === 0, scanFindings.length === 0 ? "no findings" : scanFindings.map((item) => `${item.detector}:${item.file}`).join(", "));

const failed = checks.filter((item) => item.status === "FAILED");
const sha256 = hashFile(aabPath);
const bundletoolSha256 = hashFile(bundletoolPath);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASSED" : "FAILED",
  artifact: {
    fileName: path.basename(aabPath),
    sizeBytes: statSync(aabPath).size,
    sha256,
    packageName,
    versionCode,
    versionName,
    minSdk,
    targetSdk,
    compileSdk,
    abis,
    permissions: uniquePermissions,
    uploadCertificateSha256: actualCert,
  },
  tooling: {
    bundletoolFileName: path.basename(bundletoolPath),
    bundletoolSha256,
  },
  source: {
    gitCommit: process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  },
  approvals: {
    owner: process.env.LOGIVYA_OWNER_APPROVAL_REFERENCE || null,
    androidDevice: process.env.LOGIVYA_ANDROID_ACCEPTANCE_REFERENCE || null,
    mobileWeb: process.env.LOGIVYA_MOBILE_WEB_ACCEPTANCE_REFERENCE || null,
    desktopWeb: process.env.LOGIVYA_DESKTOP_WEB_ACCEPTANCE_REFERENCE || null,
    database: process.env.LOGIVYA_DATABASE_ACCEPTANCE_REFERENCE || null,
    workerRedis: process.env.LOGIVYA_WORKER_REDIS_ACCEPTANCE_REFERENCE || null,
    playLineage: process.env.LOGIVYA_PLAY_ACCEPTANCE_REFERENCE || null,
  },
  observations: {
    localDevelopmentEndpointStrings: [...localEndpointFiles].sort(),
    note: "Compiled framework code can contain inactive development URL strings; runtime production URL is enforced by preflight and the embedded production endpoint check.",
  },
  checks,
};

const outputPath = path.resolve(
  args.get("output") || process.env.LOGIVYA_RELEASE_MANIFEST_OUTPUT || path.join(root, "artifacts/releases", `android-v${versionCode}-release-manifest.json`),
);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

for (const item of checks) console.log(`${item.status} ${item.name}: ${item.evidence}`);
console.log(`AAB SHA-256: ${sha256}`);
console.log(`Upload certificate SHA-256: ${actualCert.match(/.{2}/g)?.join(":") || "missing"}`);
console.log(`Release manifest: ${outputPath}`);
if (failed.length > 0) {
  console.error(`Android bundle verification failed with ${failed.length} blocking check(s).`);
  process.exit(2);
}
console.log("Android bundle verification passed.");
