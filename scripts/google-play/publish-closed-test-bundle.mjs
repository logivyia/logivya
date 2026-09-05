import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";
const closedTrack = "Kapalı Test ";
const internalTrack = "internal";
const productionTrack = "production";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1];
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
  return request(
    token,
    `/androidpublisher/v3/applications/${packageName}/edits`,
    {
      method: "POST",
      body: {},
    },
  );
}

async function deleteEdit(token, editId) {
  await request(token, editPath(editId), { method: "DELETE" });
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

function releaseNotes() {
  return [
    {
      language: "tr-TR",
      text: "Mesajlarda görsel, video ve belge yükleme güvenilirliği artırıldı. Medya ile birlikte yazılan metin artık aynı WhatsApp mesajında açıklama olarak gönderilir. Yükleme hataları daha anlaşılır hale getirildi.",
    },
    {
      language: "en-US",
      text: "Improved image, video, and document upload reliability. Text entered with media is now delivered as the caption in the same WhatsApp message, with clearer upload error handling.",
    },
  ];
}

function normalizeTrack(track) {
  if (!track) return null;
  return {
    track: track.track,
    releases: (track.releases ?? []).map((release) => ({
      name: release.name ?? null,
      status: release.status ?? null,
      versionCodes: (release.versionCodes ?? []).map(String).sort(),
      userFraction: release.userFraction ?? null,
      countryTargeting: release.countryTargeting ?? null,
    })),
  };
}

function fingerprint(track) {
  return JSON.stringify(normalizeTrack(track));
}

async function listTracks(token, editId) {
  const payload = await request(token, editPath(editId, "/tracks"));
  return payload.tracks ?? [];
}

function findTrack(tracks, name) {
  return tracks.find((track) => track.track === name) ?? null;
}

function assertProtectedTracksUnchanged(tracks, baseline) {
  if (fingerprint(findTrack(tracks, internalTrack)) !== baseline.internalFingerprint) {
    throw new Error("Internal test track changed; refusing commit.");
  }
  if (fingerprint(findTrack(tracks, productionTrack)) !== baseline.productionFingerprint) {
    throw new Error("Production track changed; refusing commit.");
  }
}

async function verifyCommittedState(token, expectedVersionCode, baseline) {
  const edit = await createEdit(token);
  try {
    const [tracks, bundles] = await Promise.all([
      listTracks(token, edit.id),
      request(token, editPath(edit.id, "/bundles")),
    ]);
    assertProtectedTracksUnchanged(tracks, baseline);
    const track = findTrack(tracks, closedTrack);
    const release = track?.releases?.find((item) =>
      item?.versionCodes?.map(String).includes(expectedVersionCode),
    );
    const bundle = bundles?.bundles?.find(
      (item) => String(item?.versionCode) === expectedVersionCode,
    );
    if (!release || release.status !== "completed") {
      throw new Error(
        `Closed test release ${expectedVersionCode} was not committed as completed.`,
      );
    }
    if (!bundle)
      throw new Error(
        `Bundle ${expectedVersionCode} was not found after commit.`,
      );
    return { track: track.track, release, bundle };
  } finally {
    await deleteEdit(token, edit.id).catch(() => undefined);
  }
}

async function main() {
  const aabPath = path.resolve(argument("--aab"));
  const versionCode = argument("--version-code");
  const versionName = argument("--version-name");
  const expectedCurrentVersionCode = argument("--expected-current-version-code");
  if (!/^\d+$/.test(versionCode))
    throw new Error("Version code must be numeric.");
  if (!/^\d+$/.test(expectedCurrentVersionCode))
    throw new Error("Expected current version code must be numeric.");

  const bytes = await readFile(aabPath);
  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;
  let baseline;
  try {
    const beforeTracks = await listTracks(token, edit.id);
    const currentTrack = findTrack(beforeTracks, closedTrack);
    if (currentTrack.track !== closedTrack) {
      throw new Error(
        `Unexpected closed track: ${JSON.stringify(currentTrack.track)}`,
      );
    }
    if (!currentTrack.releases?.some((release) =>
      release.status === "completed"
      && release.versionCodes?.map(String).includes(expectedCurrentVersionCode)
    )) {
      throw new Error(
        `Expected completed closed-test version ${expectedCurrentVersionCode} was not found.`,
      );
    }
    baseline = {
      internalFingerprint: fingerprint(findTrack(beforeTracks, internalTrack)),
      productionFingerprint: fingerprint(findTrack(beforeTracks, productionTrack)),
    };

    const uploaded = await uploadBundle(token, edit.id, bytes);
    if (String(uploaded?.versionCode) !== versionCode) {
      throw new Error(
        `Uploaded bundle version code mismatch: expected ${versionCode}, received ${uploaded?.versionCode}`,
      );
    }

    const release = {
      name: `${versionCode} (${versionName})`,
      versionCodes: [versionCode],
      status: "completed",
      releaseNotes: releaseNotes(),
    };
    await request(
      token,
      editPath(edit.id, `/tracks/${encodeURIComponent(closedTrack)}`),
      {
        method: "PUT",
        body: { track: closedTrack, releases: [release] },
      },
    );

    const stagedTracks = await listTracks(token, edit.id);
    assertProtectedTracksUnchanged(stagedTracks, baseline);
    const staged = findTrack(stagedTracks, closedTrack);
    if (
      staged.track !== closedTrack ||
      !staged.releases?.some((item) =>
        item.versionCodes?.map(String).includes(versionCode),
      )
    ) {
      throw new Error("Closed test release verification failed before commit.");
    }

    await request(token, editPath(edit.id, ":commit"), {
      method: "POST",
      body: {},
    });
    committed = true;
  } finally {
    if (!committed) await deleteEdit(token, edit.id).catch(() => undefined);
  }

  const verification = await verifyCommittedState(token, versionCode, baseline);
  console.log(
    JSON.stringify(
      {
        packageName,
        aabPath,
        uploadedVersionCode: versionCode,
        track: verification.track,
        status: verification.release.status,
        internalTestUnchanged: true,
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
