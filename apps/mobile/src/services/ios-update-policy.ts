export const LOGIVYA_APP_STORE_ID = 6792539737;
export const LOGIVYA_APP_STORE_URL = `https://apps.apple.com/app/logivya/id${LOGIVYA_APP_STORE_ID}`;
export const LOGIVYA_APP_STORE_NATIVE_URL = `itms-apps://apps.apple.com/app/id${LOGIVYA_APP_STORE_ID}`;

function versionParts(value: unknown): number[] | null {
  if (typeof value !== "string" || !/^\d{1,9}(\.\d{1,9}){0,3}$/.test(value)) return null;
  return value.split(".").map(Number);
}

export function compareAppVersions(left: unknown, right: unknown): number | null {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function availableIosUpdate(payload: unknown, installedVersion: string, osVersion: string): string | null {
  if (!payload || typeof payload !== "object" || !("results" in payload) || !Array.isArray(payload.results)) return null;
  for (const item of payload.results) {
    if (!item || typeof item !== "object") continue;
    if (item.trackId !== LOGIVYA_APP_STORE_ID || item.bundleId !== "com.logivya.mobile") continue;
    if (compareAppVersions(item.version, installedVersion) !== 1) continue;
    // Never send a user to an update that their current iOS cannot install.
    const compatibility = compareAppVersions(osVersion, item.minimumOsVersion);
    if (compatibility === null || compatibility < 0) continue;
    return item.version as string;
  }
  return null;
}

export function lookupCountry(deviceLocale: string): string {
  const parts = deviceLocale.replace(/_/g, "-").split("-").slice(1);
  return parts.find((part) => /^[a-z]{2}$/i.test(part))?.toUpperCase() ?? "US";
}

export async function openIosUpdateStore(openUrl: (url: string) => Promise<unknown>): Promise<boolean> {
  try {
    try { await openUrl(LOGIVYA_APP_STORE_NATIVE_URL); }
    catch { await openUrl(LOGIVYA_APP_STORE_URL); }
    return true;
  } catch { return false; }
}

/** A single, credential-free Apple lookup with bounded time and coalesced foreground checks. */
export function createIosUpdateChecker(fetcher: typeof fetch = fetch, now = Date.now, timeoutMs = 8_000) {
  let cache: { key: string; until: number; value: string | null } | null = null;
  let pending: { key: string; promise: Promise<string | null> } | null = null;
  return function check(installedVersion: string, osVersion: string, country: string): Promise<string | null> {
    const safeCountry = /^[A-Z]{2}$/.test(country) ? country : "US";
    const key = `${installedVersion}:${osVersion}:${safeCountry}`;
    if (cache?.key === key && cache.until > now()) return Promise.resolve(cache.value);
    if (pending?.key === key) return pending.promise;
    const promise = Promise.resolve().then(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(`https://itunes.apple.com/lookup?id=${LOGIVYA_APP_STORE_ID}&country=${safeCountry}&entity=software`, {
          signal: controller.signal,
          credentials: "omit",
        });
        if (!response.ok) throw new Error("Store lookup unavailable");
        const value = availableIosUpdate(await response.json(), installedVersion, osVersion);
        cache = { key, value, until: now() + 6 * 60 * 60_000 };
        return value;
      } catch {
        // Fail open: this must never delay login or block an offline session.
        cache = { key, value: null, until: now() + 5 * 60_000 };
        return null;
      } finally {
        clearTimeout(timeout);
        if (pending?.key === key) pending = null;
      }
    });
    pending = { key, promise };
    return promise;
  };
}
