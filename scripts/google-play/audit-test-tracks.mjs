import { execFileSync } from "node:child_process";
import path from "node:path";

const packageName = "com.logivya.mobile";
const quotaProject = "logivya-a5fc7";
const apiOrigin = "https://androidpublisher.googleapis.com";

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
      ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", gcloudScript, "auth", "application-default", "print-access-token"]
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
  if (!response.ok) throw new Error(`${payload?.error?.message || "Google Play request failed"} (HTTP ${response.status})`);
  return payload;
}

function editPath(editId, suffix = "") {
  return `/androidpublisher/v3/applications/${packageName}/edits/${editId}${suffix}`;
}

async function main() {
  const token = accessToken();
  const edit = await request(token, `/androidpublisher/v3/applications/${packageName}/edits`, { method: "POST", body: {} });
  try {
    const [tracks, bundles, internalTesters] = await Promise.all([
      request(token, editPath(edit.id, "/tracks")),
      request(token, editPath(edit.id, "/bundles")),
      request(token, editPath(edit.id, "/testers/internal")),
    ]);
    const bundleVersions = (bundles.bundles || []).map((bundle) => Number(bundle.versionCode)).filter(Number.isFinite);
    console.log(JSON.stringify({
      packageName,
      maxBundleVersionCode: bundleVersions.length ? Math.max(...bundleVersions) : 0,
      internalTesters: {
        googleGroups: (internalTesters.googleGroups || []).map((email) => {
          const [local = "", domain = ""] = String(email).split("@");
          return domain ? `${local.slice(0, 2)}***@${domain}` : "masked";
        }),
      },
      tracks: (tracks.tracks || []).map((track) => ({
        track: track.track,
        releases: (track.releases || []).map((release) => ({
          name: release.name || null,
          status: release.status || null,
          versionCodes: (release.versionCodes || []).map(String),
        })),
      })),
    }, null, 2));
  } finally {
    await request(token, editPath(edit.id), { method: "DELETE" }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
