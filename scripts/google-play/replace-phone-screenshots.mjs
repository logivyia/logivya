import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageName = "com.logivya.mobile";
const language = "en-US";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const imageType = "phoneScreenshots";
const expectedOldPhoneImageIds = new Set([
  "1578449867653317053",
  "12897189659623227339",
]);
const preservedImageTypes = ["sevenInchScreenshots", "tenInchScreenshots"];
const sourceFiles = [1, 2, 3, 4, 5].map((index) =>
  path.join(repoRoot, `applescreen${index}.jpeg`));

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
  return execFileSync(
    executable,
    args,
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  ).trim();
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

async function listImages(token, editId, type) {
  const payload = await request(
    token,
    editPath(editId, `/listings/${language}/${type}`),
  );
  return Array.isArray(payload?.images) ? payload.images : [];
}

async function deleteAllImages(token, editId, type) {
  await request(token, editPath(editId, `/listings/${language}/${type}`), {
    method: "DELETE",
  });
}

async function uploadImage(token, editId, filePath) {
  const buffer = await readFile(filePath);
  const url = new URL(
    `/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/listings/${language}/${imageType}`,
    apiOrigin,
  );
  url.searchParams.set("uploadType", "media");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
      "X-Goog-User-Project": quotaProject,
    },
    body: buffer,
    signal: AbortSignal.timeout(120_000),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  const image = payload?.image || payload;
  if (!image?.id) throw new Error(`Google Play did not return an image ID for ${filePath}.`);
  return image;
}

function ids(images) {
  return images.map((image) => String(image.id));
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

async function verifySources() {
  for (const filePath of sourceFiles) {
    const file = await stat(filePath);
    if (!file.isFile() || file.size < 1) throw new Error(`Missing screenshot source: ${filePath}`);
  }
}

async function snapshotPreservedImages(token, editId) {
  const entries = await Promise.all(
    preservedImageTypes.map(async (type) => [type, ids(await listImages(token, editId, type))]),
  );
  return Object.fromEntries(entries);
}

async function verifyPreservedImages(token, editId, baseline) {
  for (const type of preservedImageTypes) {
    const currentIds = ids(await listImages(token, editId, type));
    if (!sameIds(currentIds, baseline[type])) {
      throw new Error(`${type} changed unexpectedly.`);
    }
  }
}

async function commitEdit(token, editId) {
  return request(token, editPath(editId, ":commit"), {
    method: "POST",
    body: {},
  });
}

async function verifyCommittedState(token, uploadedIds, preservedBaseline) {
  const verificationEdit = await createEdit(token);
  try {
    const phoneImages = await listImages(token, verificationEdit.id, imageType);
    const finalPhoneIds = ids(phoneImages);
    if (!sameIds(finalPhoneIds, uploadedIds) || finalPhoneIds.length !== sourceFiles.length) {
      throw new Error("Committed phone screenshot verification failed.");
    }
    await verifyPreservedImages(token, verificationEdit.id, preservedBaseline);
    return { finalPhoneIds, preservedBaseline };
  } finally {
    await deleteEdit(token, verificationEdit.id);
  }
}

async function main() {
  await verifySources();
  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;
  try {
    const oldPhoneImages = await listImages(token, edit.id, imageType);
    const oldPhoneIds = ids(oldPhoneImages);
    if (!sameIds(oldPhoneIds, [...expectedOldPhoneImageIds])) {
      throw new Error(`Phone screenshots changed since verification: ${oldPhoneIds.join(", ")}`);
    }
    const preservedBaseline = await snapshotPreservedImages(token, edit.id);

    await deleteAllImages(token, edit.id, imageType);
    const uploadedIds = [];
    for (const filePath of sourceFiles) {
      const uploaded = await uploadImage(token, edit.id, filePath);
      uploadedIds.push(String(uploaded.id));
      console.log(`Uploaded ${path.basename(filePath)} as ${uploaded.id}.`);
    }

    const stagedPhoneIds = ids(await listImages(token, edit.id, imageType));
    if (!sameIds(stagedPhoneIds, uploadedIds) || stagedPhoneIds.length !== sourceFiles.length) {
      throw new Error("Staged phone screenshot verification failed.");
    }
    await verifyPreservedImages(token, edit.id, preservedBaseline);

    await commitEdit(token, edit.id);
    committed = true;
    const verified = await verifyCommittedState(token, uploadedIds, preservedBaseline);
    console.log(JSON.stringify({
      ok: true,
      packageName,
      language,
      removedPhoneImageIds: oldPhoneIds,
      uploadedPhoneImageIds: verified.finalPhoneIds,
      preservedImageIds: verified.preservedBaseline,
      finalPhoneScreenshotCount: verified.finalPhoneIds.length,
    }, null, 2));
  } finally {
    if (!committed) await deleteEdit(token, edit.id);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
