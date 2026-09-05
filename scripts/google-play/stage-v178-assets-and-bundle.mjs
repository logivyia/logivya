import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const locale = "tr-TR";
const phoneImageType = "phoneScreenshots";
const closedTrack = "Kapalı Test ";
const expectedCurrentVersionCode = "177";
const stagedVersionCode = "178";
const expectedAabSha256 =
  "64649e65a5ef47a76097125bfc8e68ede9bb3fb7ecdb3cd3bcf3020eb92e48f4";
const aabPath = path.join(
  repoRoot,
  "artifacts",
  "mobile",
  "android",
  "v178",
  "logivya-v178-1.0.147-product-experience.aab",
);
const assetsDir = path.join(
  repoRoot,
  "packages",
  "docs",
  "google-play",
  "store-assets-v178",
);
const screenshotPaths = Array.from({ length: 8 }, (_, index) => {
  const names = [
    "dashboard",
    "categories",
    "messaging",
    "compose",
    "support",
    "subscription",
    "notifications",
    "security",
  ];
  return path.join(
    assetsDir,
    `phone-${String(index + 1).padStart(2, "0")}-${names[index]}.png`,
  );
});
const preservedImageTypes = [
  "sevenInchScreenshots",
  "tenInchScreenshots",
  "featureGraphic",
  "icon",
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

function errorMessage(payload, status) {
  const message =
    payload?.error?.message || payload?.message || "Google Play request failed.";
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
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null);
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

async function listImages(token, editId, imageType) {
  try {
    const payload = await request(
      token,
      editPath(editId, `/listings/${locale}/${imageType}`),
    );
    return Array.isArray(payload?.images) ? payload.images : [];
  } catch (error) {
    if (String(error?.message).includes("HTTP 404")) return [];
    throw error;
  }
}

async function deleteAllImages(token, editId, imageType) {
  await request(token, editPath(editId, `/listings/${locale}/${imageType}`), {
    method: "DELETE",
  });
}

async function uploadImage(token, editId, filePath) {
  const bytes = await readFile(filePath);
  const url = new URL(
    `/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/listings/${locale}/${phoneImageType}`,
    apiOrigin,
  );
  url.searchParams.set("uploadType", "media");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/png",
      "X-Goog-User-Project": quotaProject,
    },
    body: bytes,
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  const image = payload?.image || payload;
  if (!image?.id) {
    throw new Error(`Google Play did not return an image ID for ${filePath}.`);
  }
  return image;
}

async function uploadBundle(token, editId, bytes) {
  const url = new URL(
    `/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/bundles`,
    apiOrigin,
  );
  url.searchParams.set("uploadType", "media");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-Goog-User-Project": quotaProject,
    },
    body: bytes,
    signal: AbortSignal.timeout(300_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
}

function imageIds(images) {
  return images.map((image) => String(image.id));
}

function sameIds(left, right) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

async function validateLocalArtifacts() {
  const aab = await readFile(aabPath);
  const sha256 = createHash("sha256").update(aab).digest("hex");
  if (sha256 !== expectedAabSha256) {
    throw new Error(`AAB SHA-256 mismatch: ${sha256}`);
  }
  for (const filePath of screenshotPaths) {
    const metadata = await sharp(filePath).metadata();
    if (
      metadata.format !== "png" ||
      metadata.width !== 1080 ||
      metadata.height !== 1920
    ) {
      throw new Error(
        `Invalid Play screenshot ${filePath}: ${metadata.format} ${metadata.width}x${metadata.height}`,
      );
    }
  }
  return { aab, sha256 };
}

async function snapshotPreservedImages(token, editId) {
  return Object.fromEntries(
    await Promise.all(
      preservedImageTypes.map(async (type) => [
        type,
        imageIds(await listImages(token, editId, type)),
      ]),
    ),
  );
}

async function verifyPreservedImages(token, editId, baseline) {
  for (const type of preservedImageTypes) {
    const current = imageIds(await listImages(token, editId, type));
    if (!sameIds(current, baseline[type])) {
      throw new Error(`${type} changed unexpectedly.`);
    }
  }
}

async function backupExistingPhoneImages(images) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backupDir = path.join(
    repoRoot,
    "artifacts",
    "google-play",
    `v178-before-${stamp}`,
  );
  await mkdir(backupDir, { recursive: true });
  const files = [];
  for (const [index, image] of images.entries()) {
    const response = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      throw new Error(`Could not back up Play image ${image.id}: HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const fileName = `phone-${String(index + 1).padStart(2, "0")}-${image.id}.bin`;
    await writeFile(path.join(backupDir, fileName), bytes);
    files.push({
      fileName,
      id: String(image.id),
      sourceSha256: image.sha256 || null,
      downloadedSha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
      url: image.url,
    });
  }
  await writeFile(
    path.join(backupDir, "manifest.json"),
    `${JSON.stringify({ packageName, locale, imageType: phoneImageType, files }, null, 2)}\n`,
    "utf8",
  );
  return { backupDir, files };
}

async function commitWithoutInterruptingExistingReview(token, editId) {
  const url = new URL(editPath(editId, ":commit"), apiOrigin);
  url.searchParams.set("changesInReviewBehavior", "ERROR_IF_IN_REVIEW");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": quotaProject,
    },
    body: "{}",
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
}

async function main() {
  const local = await validateLocalArtifacts();
  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;
  let backup;
  let uploadedBundle;
  let uploadedImages;
  let preserved;
  try {
    const [track, bundles, currentPhoneImages] = await Promise.all([
      request(
        token,
        editPath(edit.id, `/tracks/${encodeURIComponent(closedTrack)}`),
      ),
      request(token, editPath(edit.id, "/bundles")),
      listImages(token, edit.id, phoneImageType),
    ]);
    const currentRelease = track?.releases?.find((release) =>
      release?.versionCodes?.map(String).includes(expectedCurrentVersionCode),
    );
    if (!currentRelease || currentRelease.status !== "completed") {
      throw new Error(
        `Version ${expectedCurrentVersionCode} is not completed on ${closedTrack}.`,
      );
    }
    if (
      bundles?.bundles?.some(
        (bundle) => String(bundle.versionCode) === stagedVersionCode,
      )
    ) {
      throw new Error(`Bundle ${stagedVersionCode} is already present in Google Play.`);
    }

    backup = await backupExistingPhoneImages(currentPhoneImages);
    preserved = await snapshotPreservedImages(token, edit.id);

    uploadedBundle = await uploadBundle(token, edit.id, local.aab);
    if (String(uploadedBundle?.versionCode) !== stagedVersionCode) {
      throw new Error(
        `Uploaded bundle mismatch: expected ${stagedVersionCode}, received ${uploadedBundle?.versionCode}.`,
      );
    }

    await deleteAllImages(token, edit.id, phoneImageType);
    uploadedImages = [];
    for (const filePath of screenshotPaths) {
      const image = await uploadImage(token, edit.id, filePath);
      uploadedImages.push({
        fileName: path.basename(filePath),
        id: String(image.id),
        sha256: image.sha256 || null,
      });
      console.log(`Uploaded ${path.basename(filePath)} as ${image.id}.`);
    }

    const stagedPhoneIds = imageIds(
      await listImages(token, edit.id, phoneImageType),
    );
    const uploadedPhoneIds = uploadedImages.map((image) => image.id);
    if (!sameIds(stagedPhoneIds, uploadedPhoneIds)) {
      throw new Error("Staged phone screenshot order or count is incorrect.");
    }
    await verifyPreservedImages(token, edit.id, preserved);

    await request(token, editPath(edit.id, ":validate"), {
      method: "POST",
      body: {},
    });
    await commitWithoutInterruptingExistingReview(token, edit.id);
    committed = true;

    const verificationEdit = await createEdit(token);
    try {
      const [verificationTrack, verificationBundles, finalPhoneImages] =
        await Promise.all([
          request(
            token,
            editPath(
              verificationEdit.id,
              `/tracks/${encodeURIComponent(closedTrack)}`,
            ),
          ),
          request(token, editPath(verificationEdit.id, "/bundles")),
          listImages(token, verificationEdit.id, phoneImageType),
        ]);
      const finalPhoneIds = imageIds(finalPhoneImages);
      if (!sameIds(finalPhoneIds, uploadedPhoneIds)) {
        throw new Error("Committed phone screenshot verification failed.");
      }
      if (
        !verificationBundles?.bundles?.some(
          (bundle) => String(bundle.versionCode) === stagedVersionCode,
        )
      ) {
        throw new Error(`Committed bundle ${stagedVersionCode} was not found.`);
      }
      if (
        verificationTrack?.releases?.some((release) =>
          release?.versionCodes?.map(String).includes(stagedVersionCode),
        )
      ) {
        throw new Error("Version 178 was unexpectedly assigned to the test track.");
      }
      await verifyPreservedImages(token, verificationEdit.id, preserved);

      const summary = {
        ok: true,
        packageName,
        previousClosedTestVersionCode: expectedCurrentVersionCode,
        stagedBundle: {
          versionCode: stagedVersionCode,
          versionName: "1.0.147",
          localSha256: local.sha256,
          playSha256: uploadedBundle.sha256 || null,
          assignedToTrack: false,
        },
        storeAssets: {
          locale,
          imageType: phoneImageType,
          previousImageIds: imageIds(currentPhoneImages),
          uploadedImages,
          preservedImageIds: preserved,
        },
        review: {
          storeAssetsSubmittedAutomatically: true,
          bundleAssignedToTrack: false,
          commitParameters: {
            changesInReviewBehavior: "ERROR_IF_IN_REVIEW",
          },
        },
        backupDir: backup.backupDir,
      };
      const summaryPath = path.join(
        repoRoot,
        "artifacts",
        "google-play",
        "v178-upload-summary.json",
      );
      await mkdir(path.dirname(summaryPath), { recursive: true });
      await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
    } finally {
      await deleteEdit(token, verificationEdit.id).catch(() => undefined);
    }
  } finally {
    if (!committed) await deleteEdit(token, edit.id).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
