import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import path from "node:path";

const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const internalTrack = "internal";
const closedTrack = "Kapalı Test ";
const productionTrack = "production";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1];
}

function optionalArgument(name) {
  return process.argv.includes(name) ? argument(name) : null;
}

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

async function listTracks(token, editId) {
  const payload = await request(token, editPath(editId, "/tracks"));
  return payload.tracks ?? [];
}

async function listBundles(token, editId) {
  const payload = await request(token, editPath(editId, "/bundles"));
  return payload.bundles ?? [];
}

const resumableChunkSize = 8 * 1024 * 1024;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function resumableOffset(response) {
  const range = response.headers.get("range");
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/i.exec(range.trim());
  if (!match) throw new Error(`Unexpected resumable upload range: ${range}`);
  return Number(match[1]) + 1;
}

async function startResumableBundleUpload(token, editId, size) {
  const url = new URL(
    `/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/bundles`,
    apiOrigin,
  );
  url.searchParams.set("uploadType", "resumable");

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Length": "0",
          "X-Goog-User-Project": quotaProject,
          "X-Upload-Content-Length": String(size),
          "X-Upload-Content-Type": "application/octet-stream",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, response.status));
      const sessionUrl = response.headers.get("location");
      if (!sessionUrl) throw new Error("Google Play did not return a resumable upload URL.");
      return sessionUrl;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await wait(1_000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function queryResumableBundleUpload(token, sessionUrl, size) {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${size}`,
      "X-Goog-User-Project": quotaProject,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  const nextSessionUrl = response.headers.get("location") || sessionUrl;
  if (response.status === 200 || response.status === 201) {
    return {
      completed: true,
      payload: await response.json(),
      sessionUrl: nextSessionUrl,
      offset: size,
    };
  }
  if (response.status === 308) {
    return {
      completed: false,
      payload: null,
      sessionUrl: nextSessionUrl,
      offset: resumableOffset(response),
    };
  }
  const payload = await response.json().catch(() => null);
  throw new Error(errorMessage(payload, response.status));
}

async function recoverResumableBundleUpload(token, sessionUrl, size) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await queryResumableBundleUpload(token, sessionUrl, size);
    } catch (error) {
      lastError = error;
      if (attempt < 5) await wait(1_000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function uploadBundle(token, editId, aabPath) {
  const file = await open(aabPath, "r");
  try {
    const { size } = await file.stat();
    let sessionUrl = await startResumableBundleUpload(token, editId, size);
    let offset = 0;

    while (offset < size) {
      const length = Math.min(resumableChunkSize, size - offset);
      const chunk = Buffer.allocUnsafe(length);
      const { bytesRead } = await file.read(chunk, 0, length, offset);
      if (bytesRead !== length) {
        throw new Error(`Could not read AAB chunk at byte ${offset}.`);
      }
      const end = offset + length - 1;

      try {
        const response = await fetch(sessionUrl, {
          method: "PUT",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "Content-Length": String(length),
            "Content-Range": `bytes ${offset}-${end}/${size}`,
            "Content-Type": "application/octet-stream",
            "X-Goog-User-Project": quotaProject,
          },
          body: chunk,
          redirect: "manual",
          signal: AbortSignal.timeout(120_000),
        });
        sessionUrl = response.headers.get("location") || sessionUrl;
        if (response.status === 200 || response.status === 201) {
          return await response.json();
        }
        if (response.status === 308) {
          offset = resumableOffset(response);
          continue;
        }
        const payload = await response.json().catch(() => null);
        throw new Error(errorMessage(payload, response.status));
      } catch {
        const recovered = await recoverResumableBundleUpload(token, sessionUrl, size);
        sessionUrl = recovered.sessionUrl;
        if (recovered.completed) return recovered.payload;
        offset = recovered.offset;
      }
    }
    const recovered = await recoverResumableBundleUpload(token, sessionUrl, size);
    if (recovered.completed) return recovered.payload;
    throw new Error(`Resumable upload stopped at byte ${recovered.offset} of ${size}.`);
  } finally {
    await file.close();
  }
}

function normalizeTrack(track) {
  if (!track) return null;
  return {
    track: track.track,
    releases: (track.releases ?? []).map((release) => ({
      name: release.name ?? null,
      status: release.status ?? null,
      userFraction: release.userFraction ?? null,
      inAppUpdatePriority: release.inAppUpdatePriority ?? null,
      countryTargeting: release.countryTargeting ?? null,
      versionCodes: (release.versionCodes ?? []).map(String).sort(),
      releaseNotes: (release.releaseNotes ?? [])
        .map((note) => ({ language: note.language, text: note.text }))
        .sort((left, right) => left.language.localeCompare(right.language)),
    })),
  };
}

function trackSnapshot(tracks, trackName) {
  return normalizeTrack(tracks.find((track) => track.track === trackName));
}

function fingerprint(value) {
  return JSON.stringify(value);
}

function assertClosedBaseline(snapshot, expectedVersionCode) {
  if (snapshot?.track !== closedTrack) {
    throw new Error(`Closed track ${JSON.stringify(closedTrack)} was not found.`);
  }
  const release = snapshot.releases.find(
    (item) => item.status === "completed" && item.versionCodes.includes(expectedVersionCode),
  );
  if (!release) {
    throw new Error(
      `Closed test baseline changed: expected completed version ${expectedVersionCode}.`,
    );
  }
}

function assertProtectedTracksUnchanged(tracks, baseline) {
  const closed = trackSnapshot(tracks, closedTrack);
  const production = trackSnapshot(tracks, productionTrack);
  if (fingerprint(closed) !== baseline.closedFingerprint) {
    throw new Error("Closed test track changed; refusing commit.");
  }
  if (fingerprint(production) !== baseline.productionFingerprint) {
    throw new Error("Production track changed; refusing commit.");
  }
}

function releaseNotes() {
  return [
    {
      language: "tr-TR",
      text: "Genel yük, evden eve, parsiyel ve ağır nakliyat akışları geliştirildi. Araç işlemleri tek alanda birleştirildi. Görsel, video ve belge ile birlikte yazılan metin artık aynı mesajda gönderilir.",
    },
    {
      language: "en-US",
      text: "Improved general freight, household moving, partial-load, and heavy-haul flows. Vehicle tools are now unified, and text entered with media is delivered in the same message.",
    },
  ];
}

async function verifyCommittedState(token, expected, baseline) {
  const edit = await createEdit(token);
  try {
    const [tracks, bundles] = await Promise.all([
      listTracks(token, edit.id),
      listBundles(token, edit.id),
    ]);
    assertProtectedTracksUnchanged(tracks, baseline);

    const internal = trackSnapshot(tracks, internalTrack);
    const release = internal?.releases.find(
      (item) => item.status === "completed" && item.versionCodes.includes(expected.versionCode),
    );
    const bundle = bundles.find(
      (item) => String(item.versionCode) === expected.versionCode,
    );
    if (!release) {
      throw new Error(
        `Internal test release ${expected.versionCode} was not committed as completed.`,
      );
    }
    if (!bundle) {
      throw new Error(`Bundle ${expected.versionCode} was not found after commit.`);
    }
    return { internal, release, bundle };
  } finally {
    await deleteEdit(token, edit.id).catch(() => undefined);
  }
}

async function main() {
  const aabPath = path.resolve(argument("--aab"));
  const versionCode = argument("--version-code");
  const versionName = argument("--version-name");
  const expectedClosedVersionCode = argument("--expected-closed-version-code");
  const expectedInternalVersionCode = optionalArgument("--expected-internal-version-code");
  const expectedSha256 = optionalArgument("--expected-sha256");
  const notesPath = optionalArgument("--release-notes");
  const releaseLabel = optionalArgument("--release-label") || "Birleşik lojistik pazarı";
  const notes = notesPath ? JSON.parse(await readFile(path.resolve(notesPath), "utf8")) : releaseNotes();
  if (!Array.isArray(notes) || !notes.length || notes.some(note =>
    typeof note.language !== "string" || typeof note.text !== "string" || !note.text.trim() || note.text.length > 500
  )) throw new Error("Invalid release notes.");
  if (expectedSha256) {
    if (!/^[a-fA-F0-9]{64}$/.test(expectedSha256)) throw new Error("Invalid expected SHA-256.");
    const actualSha256 = createHash("sha256").update(await readFile(aabPath)).digest("hex");
    if (actualSha256 !== expectedSha256.toLowerCase()) throw new Error("AAB hash changed; refusing upload.");
  }
  if (!/^\d+$/.test(versionCode) || !/^\d+$/.test(expectedClosedVersionCode)) {
    throw new Error("Version codes must be numeric.");
  }

  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;
  let baseline;

  try {
    const beforeTracks = await listTracks(token, edit.id);
    const closedSnapshot = trackSnapshot(beforeTracks, closedTrack);
    const productionSnapshot = trackSnapshot(beforeTracks, productionTrack);
    assertClosedBaseline(closedSnapshot, expectedClosedVersionCode);
    const internalSnapshot = trackSnapshot(beforeTracks, internalTrack);
    if (expectedInternalVersionCode && !internalSnapshot?.releases.some(release =>
      release.status === "completed" && release.versionCodes.includes(expectedInternalVersionCode)
    )) throw new Error("Internal test baseline changed; refusing upload.");
    const existingBundles = await listBundles(token, edit.id);
    if (existingBundles.some(bundle => Number(bundle.versionCode) >= Number(versionCode))) {
      throw new Error("Candidate version code is not higher than existing bundles; refusing upload.");
    }
    baseline = {
      closedFingerprint: fingerprint(closedSnapshot),
      productionFingerprint: fingerprint(productionSnapshot),
      closedSnapshot,
      productionSnapshot,
      internalBefore: trackSnapshot(beforeTracks, internalTrack),
    };

    const uploaded = await uploadBundle(token, edit.id, aabPath);
    if (String(uploaded?.versionCode) !== versionCode) {
      throw new Error(
        `Uploaded bundle version code mismatch: expected ${versionCode}, received ${uploaded?.versionCode}`,
      );
    }

    const release = {
      name: `${versionCode} (${versionName}) - ${releaseLabel}`,
      versionCodes: [versionCode],
      status: "completed",
      releaseNotes: notes,
    };
    await request(token, editPath(edit.id, `/tracks/${internalTrack}`), {
      method: "PUT",
      body: { track: internalTrack, releases: [release] },
    });

    const stagedTracks = await listTracks(token, edit.id);
    assertProtectedTracksUnchanged(stagedTracks, baseline);
    const stagedInternal = trackSnapshot(stagedTracks, internalTrack);
    const stagedRelease = stagedInternal?.releases.find((item) =>
      item.versionCodes.includes(versionCode),
    );
    if (!stagedRelease || stagedRelease.status !== "completed") {
      throw new Error("Internal test release verification failed before commit.");
    }

    await request(token, editPath(edit.id, ":commit"), { method: "POST", body: {} });
    committed = true;
  } finally {
    if (!committed) await deleteEdit(token, edit.id).catch(() => undefined);
  }

  const verification = await verifyCommittedState(
    token,
    { versionCode, versionName },
    baseline,
  );
  console.log(
    JSON.stringify(
      {
        packageName,
        aabPath,
        uploadedVersionCode: versionCode,
        versionName,
        targetTrack: internalTrack,
        status: verification.release.status,
        closedTestUnchanged: true,
        closedTestVersionCode: expectedClosedVersionCode,
        productionUnchanged: true,
        bundleSha256: verification.bundle.sha256,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
