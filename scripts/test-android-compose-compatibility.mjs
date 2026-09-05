import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const gradle = read("apps/mobile/android/build.gradle");
const properties = read("apps/mobile/android/gradle.properties");
const app = read("apps/mobile/android/app/build.gradle");

assert.match(gradle, /subproject\.dependencies\.constraints\.add\(configuration\.name, "androidx\.compose\.runtime:\$\{artifact\}:1\.9\.5"\)/);
for (const artifact of ["runtime", "runtime-android", "runtime-saveable", "runtime-saveable-android"]) {
  assert.ok(gradle.includes(`"${artifact}"`), `${artifact} must stay aligned`);
}
assert.doesNotMatch(gradle, /resolutionStrategy\.(?:force|eachDependency)/);
assert.doesNotMatch(properties, /^android\.lint\.useK2Uast=false\s*$/m);
for (const source of [gradle, app]) {
  assert.doesNotMatch(source, /abortOnError\s*(?:=\s*)?false/);
  assert.doesNotMatch(source, /disable\s*(?:\(|[+=])?[^\n]*ComposableCoroutineCreation/);
}

console.log("PASS: Compose runtime compatibility constraints; no lint suppression or dependency force");
console.log("Scope: source guard only; full Android lint, bundle and device acceptance are still required.");
