import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);
const appJsonPath = path.join(root, "apps/mobile/app.json");
const gradlePath = path.join(root, "apps/mobile/android/app/build.gradle");
const gradlePropertiesPath = path.join(root, "apps/mobile/android/gradle.properties");
const manifestPath = path.join(root, "apps/mobile/android/app/src/main/AndroidManifest.xml");
const accountDeletionPath = path.join(root, "src/app/account-deletion/page.tsx");

function read(file) {
  return readFileSync(file, "utf8");
}

function matchRequired(source, expression, label) {
  const value = source.match(expression)?.[1];
  if (!value) throw new Error(`Could not read ${label}.`);
  return value;
}

function isLocalOrInsecureUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2"].includes(url.hostname);
  } catch {
    return true;
  }
}

const checks = [];
function check(name, passed, evidence) {
  checks.push({ name, status: passed ? "PASSED" : "FAILED", evidence });
}

const appJson = JSON.parse(read(appJsonPath));
const gradle = read(gradlePath);
const gradleProperties = read(gradlePropertiesPath);
const manifest = read(manifestPath);
const app = appJson.expo;
const versionName = String(app.version);
const versionCode = Number(app.android?.versionCode);
const packageName = String(app.android?.package || "");
const gradleVersionCode = Number(matchRequired(gradle, /versionCode\s+(\d+)/, "Gradle versionCode"));
const gradleVersionName = matchRequired(gradle, /versionName\s+"([^"]+)"/, "Gradle versionName");
const gradlePackage = matchRequired(gradle, /applicationId\s+'([^']+)'/, "Gradle applicationId");

const previousAppEnv = process.env.APP_ENV;
process.env.APP_ENV = "production";
const appConfigFactory = require(path.join(root, "apps/mobile/app.config.js"));
const resolvedConfig = appConfigFactory({ config: {} });
if (previousAppEnv === undefined) delete process.env.APP_ENV;
else process.env.APP_ENV = previousAppEnv;

const productionBaseUrl = String(resolvedConfig.extra?.apiBaseUrl || "");
const fallbackUrls = Array.isArray(resolvedConfig.extra?.apiFallbackBaseUrls)
  ? resolvedConfig.extra.apiFallbackBaseUrls.map(String)
  : [];
const releaseId = String(resolvedConfig.extra?.releaseId || "");
const gitCommit = String(resolvedConfig.extra?.gitCommit || "");
const buildDate = String(resolvedConfig.extra?.buildDate || "");
const apiContractVersion = String(resolvedConfig.extra?.apiContractVersion || "");
const expectedReleaseId = `android-v${versionCode}-${versionName}`;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const trackedWorktreeChanges = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim();
const latestPlayVersionCode = process.env.PLAY_LATEST_VERSION_CODE
  ? Number(process.env.PLAY_LATEST_VERSION_CODE)
  : null;

check("Package identifier consistency", packageName === "com.logivya.mobile" && packageName === gradlePackage, `${packageName} / ${gradlePackage}`);
check("Version code consistency", Number.isInteger(versionCode) && versionCode > 0 && versionCode === gradleVersionCode, `${versionCode} / ${gradleVersionCode}`);
check("Version name consistency", versionName === gradleVersionName, `${versionName} / ${gradleVersionName}`);
check("Release identifier consistency", releaseId === expectedReleaseId, `${releaseId} / ${expectedReleaseId}`);
check("Git commit metadata", /^[0-9a-f]{40}$/i.test(gitCommit), gitCommit || "missing");
check("Git commit matches release source", gitCommit.toLowerCase() === sourceCommit.toLowerCase(), `${gitCommit || "missing"} / ${sourceCommit}`);
check(
  "Tracked release source is clean",
  trackedWorktreeChanges.length === 0 || process.env.LOGIVYA_RELEASE_ALLOW_DIRTY === "1",
  trackedWorktreeChanges.length === 0 ? "clean" : "dirty (override enabled only for local validation)",
);
check("Build date metadata", Number.isFinite(Date.parse(buildDate)), buildDate || "missing");
check("API contract metadata", /^\d{4}-\d{2}-\d{2}$/.test(apiContractVersion), apiContractVersion || "missing");
check("Production API uses HTTPS", !isLocalOrInsecureUrl(productionBaseUrl), productionBaseUrl || "missing");
check(
  "Fallback APIs are absent or use HTTPS",
  fallbackUrls.every((url) => !isLocalOrInsecureUrl(url)),
  fallbackUrls.join(", ") || "none (single Hetzner production endpoint)",
);
check("Developer network inspector disabled", /EX_DEV_CLIENT_NETWORK_INSPECTOR=false/.test(gradleProperties), "apps/mobile/android/gradle.properties");
check(
  "Android edge-to-edge enabled",
  /^edgeToEdgeEnabled=true$/m.test(gradleProperties) && /^expo\.edgeToEdgeEnabled=true$/m.test(gradleProperties),
  "apps/mobile/android/gradle.properties",
);
check("Adaptive orientation enabled", app.orientation === "default", String(app.orientation || "missing"));
check(
  "Android manifest has no fixed orientation",
  !/android:screenOrientation=/.test(manifest),
  "AndroidManifest.xml",
);
check(
  "Android theme has no legacy status bar color override",
  !/android:statusBarColor/.test(read(path.join(root, "apps/mobile/android/app/src/main/res/values/styles.xml"))),
  "styles.xml",
);
check("Cleartext traffic disabled", /android:usesCleartextTraffic="false"/.test(manifest), "AndroidManifest.xml");
check("Android backup disabled", /android:allowBackup="false"/.test(manifest), "AndroidManifest.xml");

const removedPermissions = [
  "android.permission.CAMERA",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "com.google.android.gms.permission.AD_ID",
  "android.permission.ACCESS_ADSERVICES_ATTRIBUTION",
  "android.permission.ACCESS_ADSERVICES_AD_ID",
];
for (const permission of removedPermissions) {
  const escaped = permission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const removalDeclaration = new RegExp(`android:name="${escaped}"[^>]*tools:node="remove"`);
  check(`Manifest removes ${permission}`, removalDeclaration.test(manifest), "AndroidManifest.xml");
}

const screenCapturePermission = "android.permission.DETECT_SCREEN_CAPTURE";
const screenCaptureDeclaration = new RegExp(
  `android:name="${screenCapturePermission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*android:minSdkVersion="34"`,
);
check(
  "Android 14 screen capture callback permission",
  screenCaptureDeclaration.test(manifest) && !manifest.includes(`${screenCapturePermission}\" tools:node=\"remove`),
  "required by expo-screen-capture 8 on Android 14+",
);

check("Public account deletion resource", existsSync(accountDeletionPath), "src/app/account-deletion/page.tsx");
check("Firebase Android configuration", existsSync(path.join(root, "apps/mobile/google-services.json")), "apps/mobile/google-services.json");
check("EAS project identifier", /^[0-9a-f-]{36}$/i.test(String(resolvedConfig.extra?.eas?.projectId || "")), String(resolvedConfig.extra?.eas?.projectId || "missing"));

if (latestPlayVersionCode !== null) {
  check(
    "Version code is newer than Google Play",
    Number.isInteger(latestPlayVersionCode) && versionCode > latestPlayVersionCode,
    `candidate=${versionCode}, latestPlay=${latestPlayVersionCode}`,
  );
}

const failed = checks.filter((item) => item.status === "FAILED");
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  candidate: { packageName, versionCode, versionName, releaseId, gitCommit, buildDate, apiContractVersion },
  latestPlayVersionCode,
  status: failed.length === 0 ? "PASSED" : "FAILED",
  checks,
};
const outputPath = path.resolve(process.env.LOGIVYA_RELEASE_PREFLIGHT_OUTPUT || path.join(root, "artifacts/releases", `android-v${versionCode}-preflight.json`));
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

for (const item of checks) console.log(`${item.status} ${item.name}: ${item.evidence}`);
console.log(`Preflight report: ${outputPath}`);
if (failed.length > 0) {
  console.error(`Android release preflight failed with ${failed.length} blocking check(s).`);
  process.exit(2);
}
console.log("Android release preflight passed.");
