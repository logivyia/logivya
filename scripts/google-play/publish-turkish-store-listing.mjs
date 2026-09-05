import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const targetLocales = ["tr-TR"];
const preservedImageTypes = [
  "phoneScreenshots",
  "sevenInchScreenshots",
  "tenInchScreenshots",
];
const listingPath = path.join(
  repoRoot,
  "packages",
  "docs",
  "google-play",
  "store-listing-tr-TR.json",
);

function accessToken() {
  const isWindows = process.platform === "win32";
  const executable = isWindows ? "powershell.exe" : "gcloud";
  const command = ["auth", "application-default", "print-access-token"];
  const args = isWindows
    ? [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(
          process.env.LOCALAPPDATA || "",
          "Google",
          "Cloud SDK",
          "google-cloud-sdk",
          "bin",
          "gcloud.ps1",
        ),
        ...command,
      ]
    : command;
  return execFileSync(executable, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function errorMessage(payload, status) {
  const message = payload?.error?.message || payload?.message || "Google Play request failed.";
  return `${message} (HTTP ${status})`;
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
    signal: AbortSignal.timeout(60_000),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
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
  try {
    return await request(token, editPath(editId, `/listings/${locale}`));
  } catch (error) {
    if (String(error?.message).includes("HTTP 404")) return null;
    throw error;
  }
}

async function writeListing(token, editId, locale, body) {
  return request(token, editPath(editId, `/listings/${locale}`), {
    method: "PUT",
    body,
  });
}

async function listImageIds(token, editId, locale, imageType) {
  try {
    const payload = await request(
      token,
      editPath(editId, `/listings/${locale}/${imageType}`),
    );
    return (payload?.images || []).map((image) => String(image.id));
  } catch (error) {
    if (String(error?.message).includes("HTTP 404")) return [];
    throw error;
  }
}

async function snapshotImages(token, editId) {
  const entries = [];
  for (const locale of targetLocales) {
    for (const imageType of preservedImageTypes) {
      entries.push([
        `${locale}:${imageType}`,
        await listImageIds(token, editId, locale, imageType),
      ]);
    }
  }
  return Object.fromEntries(entries);
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

async function verifyImages(token, editId, expected) {
  for (const locale of targetLocales) {
    for (const imageType of preservedImageTypes) {
      const key = `${locale}:${imageType}`;
      const actual = await listImageIds(token, editId, locale, imageType);
      if (!sameIds(actual, expected[key])) {
        throw new Error(`Store images changed unexpectedly for ${key}.`);
      }
    }
  }
}

function expectedListing(source) {
  const listing = {
    title: source.appName,
    shortDescription: source.shortDescription,
    fullDescription: source.fullDescription,
  };
  if (listing.title.length > 30) throw new Error("Google Play title exceeds 30 characters.");
  if (listing.shortDescription.length > 80) {
    throw new Error("Google Play short description exceeds 80 characters.");
  }
  if (listing.fullDescription.length > 4000) {
    throw new Error("Google Play full description exceeds 4,000 characters.");
  }
  return listing;
}

function assertListing(actual, expected, locale) {
  for (const key of ["title", "shortDescription", "fullDescription"]) {
    if (actual?.[key] !== expected[key]) {
      throw new Error(`Committed ${locale} ${key} does not match the Turkish source.`);
    }
  }
}

async function main() {
  const source = JSON.parse(await readFile(listingPath, "utf8"));
  const expected = expectedListing(source);
  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;

  try {
    const before = Object.fromEntries(
      await Promise.all(
        targetLocales.map(async (locale) => [locale, await readListing(token, edit.id, locale)]),
      ),
    );
    const imageSnapshot = await snapshotImages(token, edit.id);

    for (const locale of targetLocales) {
      await writeListing(token, edit.id, locale, expected);
      assertListing(await readListing(token, edit.id, locale), expected, locale);
    }
    await verifyImages(token, edit.id, imageSnapshot);

    await request(token, editPath(edit.id, ":commit"), { method: "POST", body: {} });
    committed = true;

    const verificationEdit = await createEdit(token);
    try {
      const after = {};
      for (const locale of targetLocales) {
        after[locale] = await readListing(token, verificationEdit.id, locale);
        assertListing(after[locale], expected, locale);
      }
      await verifyImages(token, verificationEdit.id, imageSnapshot);
      console.log(JSON.stringify({
        ok: true,
        packageName,
        updatedLocales: targetLocales,
        before,
        after,
        preservedImages: imageSnapshot,
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
