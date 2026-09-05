import { execFileSync } from "node:child_process";
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

function createEdit(token) {
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

function findTrack(tracks, name) {
  return tracks.find((track) => track.track === name) ?? null;
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

function hasCompletedVersion(track, versionCode) {
  return Boolean(
    track?.releases?.some(
      (release) =>
        release.status === "completed" &&
        release.versionCodes?.map(String).includes(versionCode),
    ),
  );
}

function assertProtectedTracksUnchanged(tracks, baseline) {
  if (fingerprint(findTrack(tracks, closedTrack)) !== baseline.closed) {
    throw new Error("Closed test track changed; refusing commit.");
  }
  if (fingerprint(findTrack(tracks, productionTrack)) !== baseline.production) {
    throw new Error("Production track changed; refusing commit.");
  }
}

async function verifyCommittedState(token, versionCode, baseline) {
  const edit = await createEdit(token);
  try {
    const [tracks, bundles] = await Promise.all([
      listTracks(token, edit.id),
      request(token, editPath(edit.id, "/bundles")),
    ]);
    assertProtectedTracksUnchanged(tracks, baseline);
    const internal = findTrack(tracks, internalTrack);
    const bundle = bundles?.bundles?.find(
      (item) => String(item?.versionCode) === versionCode,
    );
    if (!hasCompletedVersion(internal, versionCode)) {
      throw new Error(`Internal release ${versionCode} was not committed as completed.`);
    }
    if (!bundle) throw new Error(`Bundle ${versionCode} is missing after commit.`);
    return { internal, bundle };
  } finally {
    await deleteEdit(token, edit.id).catch(() => undefined);
  }
}

async function main() {
  const versionCode = argument("--version-code");
  const versionName = argument("--version-name");
  const expectedCurrentVersionCode = argument("--expected-current-version-code");
  if (!/^\d+$/.test(versionCode) || !/^\d+$/.test(expectedCurrentVersionCode)) {
    throw new Error("Version codes must be numeric.");
  }

  const token = accessToken();
  const edit = await createEdit(token);
  let committed = false;
  let baseline;
  try {
    const [beforeTracks, bundles] = await Promise.all([
      listTracks(token, edit.id),
      request(token, editPath(edit.id, "/bundles")),
    ]);
    const internal = findTrack(beforeTracks, internalTrack);
    const closed = findTrack(beforeTracks, closedTrack);
    if (!hasCompletedVersion(internal, expectedCurrentVersionCode)) {
      throw new Error(
        `Expected completed internal version ${expectedCurrentVersionCode} was not found.`,
      );
    }
    if (!hasCompletedVersion(closed, versionCode)) {
      throw new Error(
        `Closed test does not contain completed version ${versionCode}; refusing promotion.`,
      );
    }
    if (!bundles?.bundles?.some((item) => String(item?.versionCode) === versionCode)) {
      throw new Error(`Uploaded bundle ${versionCode} was not found.`);
    }

    baseline = {
      closed: fingerprint(closed),
      production: fingerprint(findTrack(beforeTracks, productionTrack)),
    };

    const release = {
      name: `${versionCode} (${versionName}) - Medya gönderme düzeltmesi`,
      versionCodes: [versionCode],
      status: "completed",
      releaseNotes: [
        {
          language: "tr-TR",
          text: "Mesajlarda görsel, video ve belge yükleme güvenilirliği artırıldı. Medya ile birlikte yazılan metin artık aynı WhatsApp mesajında açıklama olarak gönderilir. Yükleme hataları daha anlaşılır hale getirildi.",
        },
        {
          language: "en-US",
          text: "Improved image, video, and document upload reliability. Text entered with media is now sent as a caption in the same WhatsApp message. Upload errors are clearer.",
        },
      ],
    };
    await request(token, editPath(edit.id, `/tracks/${internalTrack}`), {
      method: "PUT",
      body: { track: internalTrack, releases: [release] },
    });

    const stagedTracks = await listTracks(token, edit.id);
    assertProtectedTracksUnchanged(stagedTracks, baseline);
    if (!hasCompletedVersion(findTrack(stagedTracks, internalTrack), versionCode)) {
      throw new Error("Internal release verification failed before commit.");
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
        promotedVersionCode: versionCode,
        versionName,
        targetTrack: internalTrack,
        status: "completed",
        closedTestUnchanged: true,
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
