import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const closedTrack = "Kapalı Test ";
const root = process.cwd();
const mobileConfig = JSON.parse(
  readFileSync(path.join(root, "apps/mobile/app.json"), "utf8"),
).expo;
const expectedVersionCode = String(mobileConfig.android.versionCode);
const releaseManifest = JSON.parse(
  readFileSync(
    path.join(root, "artifacts/releases", `android-v${expectedVersionCode}-release-manifest.json`),
    "utf8",
  ),
);
const expectedBundleSha256 = String(releaseManifest.artifact.sha256).toLowerCase();
const locales = ["en-US", "tr-TR"];
const imageTypes = [
  "icon",
  "featureGraphic",
  "phoneScreenshots",
  "sevenInchScreenshots",
  "tenInchScreenshots",
];

function accessToken() {
  const gcloudScript = path.join(
    process.env.LOCALAPPDATA || "",
    "Google",
    "Cloud SDK",
    "google-cloud-sdk",
    "bin",
    "gcloud.ps1",
  );
  return execFileSync(
    process.platform === "win32" ? "powershell.exe" : "gcloud",
    process.platform === "win32"
      ? [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          gcloudScript,
          "auth",
          "application-default",
          "print-access-token",
        ]
      : ["auth", "application-default", "print-access-token"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
}

async function request(token, pathname, options = {}) {
  const response = await fetch(new URL(pathname, apiOrigin), {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Goog-User-Project": quotaProject,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${payload?.error?.message || "Google Play request failed"} (HTTP ${response.status})`,
    );
  }
  return payload;
}

function editPath(editId, suffix = "") {
  return `/androidpublisher/v3/applications/${packageName}/edits/${editId}${suffix}`;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

async function main() {
  const token = accessToken();
  const edit = await request(
    token,
    `/androidpublisher/v3/applications/${packageName}/edits`,
    {
      method: "POST",
      body: {},
    },
  );
  try {
    const [details, tracks, bundles, listings] = await Promise.all([
      request(token, editPath(edit.id, "/details")),
      request(token, editPath(edit.id, "/tracks")),
      request(token, editPath(edit.id, "/bundles")),
      request(token, editPath(edit.id, "/listings")),
    ]);

    requireCondition(
      details.defaultLanguage === "tr-TR",
      "Default language is not tr-TR.",
    );
    const production = tracks.tracks?.find(
      (track) => track.track === "production",
    );
    requireCondition(
      !production?.releases?.length,
      "Production track unexpectedly contains a release.",
    );
    const closed = tracks.tracks?.find((track) => track.track === closedTrack);
    const release = closed?.releases?.find((item) =>
      item.versionCodes?.map(String).includes(expectedVersionCode),
    );
    requireCondition(
      release?.status === "completed",
      `Closed test v${expectedVersionCode} is not completed.`,
    );
    const bundle = bundles.bundles?.find(
      (item) => String(item.versionCode) === expectedVersionCode,
    );
    requireCondition(
      bundle?.sha256 === expectedBundleSha256,
      "Play bundle SHA-256 mismatch.",
    );

    const listingLocales = new Set(
      listings.listings?.map((listing) => listing.language),
    );
    for (const locale of locales) {
      requireCondition(
        listingLocales.has(locale),
        `Missing store listing: ${locale}`,
      );
    }

    const imageCounts = {};
    for (const locale of locales) {
      imageCounts[locale] = {};
      for (const type of imageTypes) {
        const payload = await request(
          token,
          editPath(edit.id, `/listings/${locale}/${type}`),
        );
        imageCounts[locale][type] = payload.images?.length || 0;
      }
      requireCondition(
        imageCounts[locale].icon === 1,
        `${locale} icon is missing.`,
      );
      requireCondition(
        imageCounts[locale].featureGraphic === 1,
        `${locale} feature graphic is missing.`,
      );
      requireCondition(
        imageCounts[locale].phoneScreenshots >= 2,
        `${locale} phone screenshots are incomplete.`,
      );
      requireCondition(
        imageCounts[locale].sevenInchScreenshots >= 2,
        `${locale} 7-inch screenshots are incomplete.`,
      );
      requireCondition(
        imageCounts[locale].tenInchScreenshots >= 2,
        `${locale} 10-inch screenshots are incomplete.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          packageName,
          defaultLanguage: details.defaultLanguage,
          contact: {
            email: details.contactEmail,
            phone: maskPhone(details.contactPhone),
            website: details.contactWebsite,
          },
          productionReleases: production?.releases?.length || 0,
          closedTest: {
            track: closed.track,
            name: release.name,
            status: release.status,
            versionCodes: release.versionCodes,
          },
          bundle: { versionCode: bundle.versionCode, sha256: bundle.sha256 },
          listings: locales,
          imageCounts,
        },
        null,
        2,
      ),
    );
  } finally {
    await request(token, editPath(edit.id), { method: "DELETE" }).catch(
      () => undefined,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
