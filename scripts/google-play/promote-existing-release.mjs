import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const trackNames = {
  internal: "internal",
  closed: "Kapalı Test ",
  production: "production",
};

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1];
}

function optionalArgument(name, fallback) {
  return process.argv.includes(name) ? argument(name) : fallback;
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
  return request(token, editPath(editId), { method: "DELETE" });
}

async function listTracks(token, editId) {
  const payload = await request(token, editPath(editId, "/tracks"));
  return payload.tracks || [];
}

function findTrack(tracks, name) {
  return tracks.find((track) => track.track === name) || { track: name, releases: [] };
}

function normalizeTrack(track) {
  return {
    track: track.track,
    releases: (track.releases || []).map((release) => ({
      name: release.name || null,
      status: release.status || null,
      versionCodes: (release.versionCodes || []).map(String).sort(),
      userFraction: release.userFraction ?? null,
      countryTargeting: release.countryTargeting ?? null,
    })),
  };
}

function fingerprint(track) {
  return JSON.stringify(normalizeTrack(track));
}

function completedVersion(track, versionCode) {
  return (track.releases || []).some(
    (release) => release.status === "completed"
      && (release.versionCodes || []).map(String).includes(versionCode),
  );
}

function assertExpectedTarget(track, expected) {
  if (expected === "empty") {
    if ((track.releases || []).length) throw new Error("TARGET_TRACK_NOT_EMPTY");
    return;
  }
  if (!completedVersion(track, expected)) {
    throw new Error(`TARGET_BASELINE_VERSION_NOT_FOUND:${expected}`);
  }
}

function protectedFingerprints(tracks, targetTrack) {
  return Object.values(trackNames)
    .filter((name) => name !== targetTrack)
    .reduce((result, name) => {
      result[name] = fingerprint(findTrack(tracks, name));
      return result;
    }, {});
}

function assertProtectedTracks(tracks, baseline) {
  for (const [name, expected] of Object.entries(baseline)) {
    if (fingerprint(findTrack(tracks, name)) !== expected) {
      throw new Error(`PROTECTED_TRACK_CHANGED:${JSON.stringify(name)}`);
    }
  }
}

async function verifyCommitted(token, targetTrack, versionCode, baseline, expectedHash) {
  const edit = await createEdit(token);
  try {
    const [tracks, bundles] = await Promise.all([
      listTracks(token, edit.id),
      request(token, editPath(edit.id, "/bundles")),
    ]);
    assertProtectedTracks(tracks, baseline);
    const target = findTrack(tracks, targetTrack);
    if (!completedVersion(target, versionCode)) throw new Error("PROMOTED_RELEASE_NOT_COMPLETED");
    const bundle = (bundles.bundles || []).find((item) => String(item.versionCode) === versionCode);
    if (!bundle || String(bundle.sha256).toLowerCase() !== expectedHash) {
      throw new Error("PROMOTED_BUNDLE_HASH_MISMATCH");
    }
    return { target: normalizeTrack(target), bundle };
  } finally {
    await deleteEdit(token, edit.id).catch(() => undefined);
  }
}

async function main() {
  const targetKey = argument("--target");
  const sourceKey = argument("--source");
  const versionCode = argument("--version-code");
  const versionName = argument("--version-name");
  const expectedTargetVersion = argument("--expected-target-version");
  if (!trackNames[targetKey] || !trackNames[sourceKey] || sourceKey === targetKey) {
    throw new Error("INVALID_TRACK_PROMOTION");
  }
  if (!/^\d+$/u.test(versionCode)) throw new Error("INVALID_VERSION_CODE");
  const approvalVariable = targetKey === "production"
    ? "GOOGLE_PLAY_PRODUCTION_RELEASE_APPROVED"
    : "GOOGLE_PLAY_CLOSED_PROMOTION_APPROVED";
  if (process.env[approvalVariable] !== "YES") {
    throw new Error(`${approvalVariable}=YES is required.`);
  }

  const releaseDirectory = path.join(process.cwd(), "artifacts", "production-release", "android", `v${versionCode}`);
  const receiptPath = optionalArgument("--receipt", path.join(releaseDirectory, "google-play-publish-receipt.json"));
  const notesPath = optionalArgument("--release-notes", path.join(releaseDirectory, "release-notes.json"));
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8").replace(/^\uFEFF/u, ""));
  const releaseNotes = JSON.parse(readFileSync(notesPath, "utf8").replace(/^\uFEFF/u, ""));
  if (receipt.packageName && receipt.packageName !== packageName) throw new Error("RECEIPT_PACKAGE_MISMATCH");
  if (receipt.uploadedVersionCode && String(receipt.uploadedVersionCode) !== versionCode) {
    throw new Error("RECEIPT_VERSION_MISMATCH");
  }
  const expectedHash = String(receipt.candidate?.aabSha256 || receipt.bundleSha256 || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(expectedHash)) throw new Error("EXPECTED_BUNDLE_HASH_MISSING");

  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;
  let baseline;
  let noChange = false;
  try {
    const [tracks, bundles] = await Promise.all([
      listTracks(token, edit.id),
      request(token, editPath(edit.id, "/bundles")),
    ]);
    const sourceTrack = findTrack(tracks, trackNames[sourceKey]);
    const targetTrack = findTrack(tracks, trackNames[targetKey]);
    if (!completedVersion(sourceTrack, versionCode)) {
      throw new Error(`SOURCE_RELEASE_NOT_COMPLETED:${sourceKey}:${versionCode}`);
    }
    const bundle = (bundles.bundles || []).find((item) => String(item.versionCode) === versionCode);
    if (!bundle || String(bundle.sha256).toLowerCase() !== expectedHash) {
      throw new Error("SOURCE_BUNDLE_HASH_MISMATCH");
    }
    baseline = protectedFingerprints(tracks, trackNames[targetKey]);
    if (completedVersion(targetTrack, versionCode)) {
      noChange = true;
      await deleteEdit(token, edit.id);
      committed = true;
    } else {
      assertExpectedTarget(targetTrack, expectedTargetVersion);
      const release = {
        name: `${versionCode} (${versionName}) - Genel kullanıma hazır`,
        versionCodes: [versionCode],
        status: "completed",
        releaseNotes,
      };
      await request(token, editPath(edit.id, `/tracks/${encodeURIComponent(trackNames[targetKey])}`), {
        method: "PUT",
        body: { track: trackNames[targetKey], releases: [release] },
      });
      const stagedTracks = await listTracks(token, edit.id);
      assertProtectedTracks(stagedTracks, baseline);
      if (!completedVersion(findTrack(stagedTracks, trackNames[targetKey]), versionCode)) {
        throw new Error("STAGED_PROMOTION_VERIFICATION_FAILED");
      }
      await request(token, editPath(edit.id, ":commit"), { method: "POST", body: {} });
      committed = true;
    }
  } finally {
    if (!committed) await deleteEdit(token, edit.id).catch(() => undefined);
  }

  const verified = await verifyCommitted(
    token,
    trackNames[targetKey],
    versionCode,
    baseline,
    expectedHash,
  );
  console.log(JSON.stringify({
    ok: true,
    packageName,
    sourceTrack: trackNames[sourceKey],
    targetTrack: trackNames[targetKey],
    versionCode,
    versionName,
    status: "completed",
    fullRollout: targetKey === "production",
    noChange,
    bundleSha256: String(verified.bundle.sha256).toLowerCase(),
    target: verified.target,
    protectedTracksUnchanged: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
