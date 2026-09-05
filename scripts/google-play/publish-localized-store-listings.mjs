import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const sourceLocale = "en-US";
const defaultLocale = "tr-TR";
const imageTypes = [
  "icon",
  "featureGraphic",
  "phoneScreenshots",
  "sevenInchScreenshots",
  "tenInchScreenshots",
];
const imageSourceFiles = {
  icon: ["packages/docs/google-play/store-assets-v136/app-icon-512.png"],
  featureGraphic: ["packages/docs/google-play/store-assets-v136/feature-graphic-1024x500.png"],
  phoneScreenshots: [
    "applescreen1.jpeg",
    "applescreen2.jpeg",
    "applescreen3.jpeg",
    "applescreen4.jpeg",
    "applescreen5.jpeg",
    "screenap6.jpeg",
    "screenap8.jpeg",
    "screenap9.jpeg",
  ],
  sevenInchScreenshots: [
    "packages/docs/google-play/store-assets-v136/tablet7-01-login.png",
    "packages/docs/google-play/store-assets-v136/tablet7-02-register.png",
  ],
  tenInchScreenshots: [
    "packages/docs/google-play/store-assets-v136/tablet10-01-login.png",
    "packages/docs/google-play/store-assets-v136/tablet10-02-register.png",
  ],
};
const listingFiles = {
  "en-US": "store-listing-en-US.json",
  "tr-TR": "store-listing-tr-TR.json",
};

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

function message(payload, status) {
  return `${payload?.error?.message || payload?.message || "Google Play request failed"} (HTTP ${status})`;
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
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(message(payload, response.status));
  return payload;
}

function editPath(editId, suffix = "") {
  return `/androidpublisher/v3/applications/${packageName}/edits/${editId}${suffix}`;
}

async function createEdit(token) {
  return request(token, `/androidpublisher/v3/applications/${packageName}/edits`, {
    method: "POST",
    body: {},
  });
}

async function deleteEdit(token, editId) {
  await request(token, editPath(editId), { method: "DELETE" });
}

async function readListing(token, editId, locale) {
  return request(token, editPath(editId, `/listings/${locale}`));
}

async function readImages(token, editId, locale, type) {
  const payload = await request(token, editPath(editId, `/listings/${locale}/${type}`));
  return Array.isArray(payload?.images) ? payload.images : [];
}

async function uploadImage(token, editId, locale, type, sourceFile) {
  const absolutePath = path.join(repoRoot, sourceFile);
  const bytes = await readFile(absolutePath);
  const uploadUrl = new URL(
    `/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/listings/${locale}/${type}`,
    apiOrigin,
  );
  uploadUrl.searchParams.set("uploadType", "media");
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": /\.jpe?g$/i.test(sourceFile) ? "image/jpeg" : "image/png",
      "X-Goog-User-Project": quotaProject,
    },
    body: bytes,
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(message(payload, response.status));
  return payload?.image || payload;
}

function listingBody(source) {
  const body = {
    title: String(source.appName),
    shortDescription: String(source.shortDescription),
    fullDescription: String(source.fullDescription),
  };
  if (body.title.length > 30) throw new Error(`${source.locale} title exceeds 30 characters.`);
  if (body.shortDescription.length > 80) throw new Error(`${source.locale} short description exceeds 80 characters.`);
  if (body.fullDescription.length > 4000) throw new Error(`${source.locale} full description exceeds 4,000 characters.`);
  return body;
}

function assertListing(actual, expected, locale) {
  for (const field of ["title", "shortDescription", "fullDescription"]) {
    if (actual?.[field] !== expected[field]) throw new Error(`${locale} ${field} verification failed.`);
  }
}

async function loadListings() {
  const directory = path.join(repoRoot, "packages", "docs", "google-play");
  const entries = await Promise.all(
    Object.entries(listingFiles).map(async ([locale, filename]) => {
      const parsed = JSON.parse(await readFile(path.join(directory, filename), "utf8"));
      if (parsed.locale !== locale) throw new Error(`${filename} locale mismatch.`);
      return [locale, listingBody(parsed)];
    }),
  );
  return Object.fromEntries(entries);
}

async function imageCounts(token, editId, locale) {
  const entries = await Promise.all(
    imageTypes.map(async (type) => [type, (await readImages(token, editId, locale, type)).length]),
  );
  return Object.fromEntries(entries);
}

function assertMatchingCounts(source, target) {
  for (const type of imageTypes) {
    if (!source[type]) throw new Error(`Required ${sourceLocale} image type is empty: ${type}.`);
    if (source[type] !== target[type]) {
      throw new Error(`${defaultLocale} ${type} count ${target[type]} does not match ${source[type]}.`);
    }
  }
}

async function main() {
  const listings = await loadListings();
  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;
  try {
    const details = await request(token, editPath(edit.id, "/details"));
    const sourceCountsBefore = await imageCounts(token, edit.id, sourceLocale);
    for (const type of imageTypes) {
      if (sourceCountsBefore[type] !== imageSourceFiles[type].length) {
        throw new Error(`${sourceLocale} ${type} count changed: expected ${imageSourceFiles[type].length}, received ${sourceCountsBefore[type]}.`);
      }
    }
    const targetCountsBefore = await imageCounts(token, edit.id, defaultLocale);
    for (const type of imageTypes) {
      if (targetCountsBefore[type] === 0) {
        for (const sourceFile of imageSourceFiles[type]) {
          await uploadImage(token, edit.id, defaultLocale, type, sourceFile);
        }
      }
    }

    for (const [locale, body] of Object.entries(listings)) {
      await request(token, editPath(edit.id, `/listings/${locale}`), { method: "PUT", body });
      assertListing(await readListing(token, edit.id, locale), body, locale);
    }

    await request(token, editPath(edit.id, "/details"), {
      method: "PUT",
      body: { ...details, defaultLanguage: defaultLocale },
    });
    const stagedDetails = await request(token, editPath(edit.id, "/details"));
    if (stagedDetails.defaultLanguage !== defaultLocale) throw new Error("Default language was not staged.");
    const sourceCounts = await imageCounts(token, edit.id, sourceLocale);
    const targetCounts = await imageCounts(token, edit.id, defaultLocale);
    assertMatchingCounts(sourceCounts, targetCounts);

    await request(token, editPath(edit.id, ":commit"), { method: "POST", body: {} });
    committed = true;

    const verificationEdit = await createEdit(token);
    try {
      const verifiedDetails = await request(token, editPath(verificationEdit.id, "/details"));
      if (verifiedDetails.defaultLanguage !== defaultLocale) throw new Error("Committed default language verification failed.");
      for (const [locale, body] of Object.entries(listings)) {
        assertListing(await readListing(token, verificationEdit.id, locale), body, locale);
      }
      const verifiedSourceCounts = await imageCounts(token, verificationEdit.id, sourceLocale);
      const verifiedTargetCounts = await imageCounts(token, verificationEdit.id, defaultLocale);
      assertMatchingCounts(verifiedSourceCounts, verifiedTargetCounts);
      console.log(JSON.stringify({
        ok: true,
        packageName,
        defaultLanguage: verifiedDetails.defaultLanguage,
        locales: Object.keys(listings),
        contactEmail: verifiedDetails.contactEmail,
        contactPhone: verifiedDetails.contactPhone ? `${verifiedDetails.contactPhone.slice(0, 4)}****${verifiedDetails.contactPhone.slice(-2)}` : null,
        imageCounts: { [sourceLocale]: verifiedSourceCounts, [defaultLocale]: verifiedTargetCounts },
      }, null, 2));
    } finally {
      await deleteEdit(token, verificationEdit.id);
    }
  } finally {
    if (!committed) await deleteEdit(token, edit.id).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
