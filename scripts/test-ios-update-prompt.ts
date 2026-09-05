import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { availableIosUpdate, compareAppVersions, createIosUpdateChecker, lookupCountry, openIosUpdateStore, LOGIVYA_APP_STORE_ID, LOGIVYA_APP_STORE_URL, LOGIVYA_APP_STORE_NATIVE_URL } from "../apps/mobile/src/services/ios-update-policy";
import { iosUpdateCopy } from "../apps/mobile/src/i18n/ios-update-copy";
import { locales } from "../apps/mobile/src/i18n/config";

async function main() {
const app = { trackId: LOGIVYA_APP_STORE_ID, bundleId: "com.logivya.mobile", version: "1.0.12", minimumOsVersion: "15.1" };
const payload = { results: [app] };
assert.equal(compareAppVersions("1.0.12", "1.0.9"), 1);
assert.equal(compareAppVersions("1.0", "1.0.0"), 0);
assert.equal(compareAppVersions("1.0.11", "1.0.12"), -1);
for (const bad of [null, "", "unknown", "1.0.beta", "1.0.12-beta", "https://bad", "1e9", "999999999999"]) assert.equal(compareAppVersions(bad, "1.0.11"), null);
assert.equal(availableIosUpdate(payload, "1.0.11", "18.5"), "1.0.12");
assert.equal(availableIosUpdate(payload, "1.0.12", "18.5"), null);
assert.equal(availableIosUpdate(payload, "1.0.13", "18.5"), null); // Newer TestFlight builds must never be downgraded.
assert.equal(availableIosUpdate(payload, "unknown", "18.5"), null);
assert.equal(availableIosUpdate(payload, "1.0.11", "15.0"), null);
assert.equal(availableIosUpdate(payload, "1.0.11", "15.1"), "1.0.12");
assert.equal(availableIosUpdate({ results: [{ ...app, trackId: 1 }] }, "1.0.11", "18.5"), null);
assert.equal(availableIosUpdate({ results: [{ ...app, bundleId: "other.app" }] }, "1.0.11", "18.5"), null);
for (const malformed of [null, {}, { results: [] }, { results: [null, "bad"] }, { results: [{ ...app, minimumOsVersion: undefined }] }]) assert.equal(availableIosUpdate(malformed, "1.0.11", "18.5"), null);
assert.equal(lookupCountry("tr-TR"), "TR");
assert.equal(lookupCountry("en_US"), "US");
assert.equal(lookupCountry("zh-Hant-TW"), "TW");
assert.equal(lookupCountry("en"), "US");

let clock = 0;
let calls = 0;
const fakeFetch: typeof fetch = async (url, options) => {
  calls += 1;
  assert.equal(url, `https://itunes.apple.com/lookup?id=${LOGIVYA_APP_STORE_ID}&country=TR&entity=software`);
  assert.equal(options?.credentials, "omit");
  assert.equal(options?.headers, undefined); // No Logivya authorization or user information goes to Apple.
  return new Response(JSON.stringify(payload));
};
const check = createIosUpdateChecker(fakeFetch, () => clock);
assert.deepEqual(await Promise.all([check("1.0.11", "18.5", "TR"), check("1.0.11", "18.5", "TR")]), ["1.0.12", "1.0.12"]);
assert.equal(calls, 1);
await check("1.0.11", "18.5", "TR");
assert.equal(calls, 1);
clock += 6 * 60 * 60_000;
await check("1.0.11", "18.5", "TR");
assert.equal(calls, 2);

for (const failure of [async () => { throw new Error("offline"); }, async () => new Response("error", { status: 500 }), async () => new Response("not json")]) {
  let attempts = 0;
  const failing = createIosUpdateChecker(async () => { attempts++; return failure(); }, () => clock);
  assert.equal(await failing("1.0.11", "18.5", "TR"), null);
  assert.equal(await failing("1.0.11", "18.5", "TR"), null);
  assert.equal(attempts, 1);
  clock += 5 * 60_000;
  await failing("1.0.11", "18.5", "TR");
  assert.equal(attempts, 2);
}
const timeoutCheck = createIosUpdateChecker(async (_url, options) => new Promise((_resolve, reject) => {
  options?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
}), Date.now, 5);
assert.equal(await timeoutCheck("1.0.11", "18.5", "TR"), null);
let syncFailures = 0;
const syncCheck = createIosUpdateChecker(() => { syncFailures++; throw new Error("sync fetch failure"); }, () => clock);
await syncCheck("1.0.11", "18.5", "TR");
clock += 5 * 60_000;
await syncCheck("1.0.11", "18.5", "TR");
assert.equal(syncFailures, 2);

const opened: string[] = [];
assert.equal(await openIosUpdateStore(async (url) => { opened.push(url); }), true);
assert.deepEqual(opened, [LOGIVYA_APP_STORE_NATIVE_URL]);
opened.length = 0;
assert.equal(await openIosUpdateStore(async (url) => { opened.push(url); if (url.startsWith("itms-apps:")) throw new Error("unsupported"); }), true);
assert.deepEqual(opened, [LOGIVYA_APP_STORE_NATIVE_URL, LOGIVYA_APP_STORE_URL]);
assert.equal(await openIosUpdateStore(async () => { throw new Error("unavailable"); }), false);
for (const locale of locales) for (const value of Object.values(iosUpdateCopy[locale])) assert.ok(value.trim());

const component = readFileSync("apps/mobile/src/components/ios-update-prompt.tsx", "utf8");
assert.match(component, /Platform\.OS !== "ios"/);
assert.match(component, /status !== "authenticated"/);
assert.match(component, /onboardingCompleted && lockReady && active/);
assert.match(component, /subscription\.remove\(\)/);
assert.match(component, /if \(!cancelled\) setVersion/);
assert.match(component, /testID="ios-update-later"/);
assert.doesNotMatch(component, /setInterval|clearSession|logout\(/);
console.log("PASS: iOS update prompt — version/identity/iOS checks, newer TestFlight, coalescing, cache TTL, timeout/offline, trusted links, all locales, lifecycle and lock guards.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
