import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8").replace(/^\uFEFF/, "");
const properties = read("apps/mobile/android/gradle.properties");
const gradle = read("apps/mobile/android/app/build.gradle");
const rootGradle = read("apps/mobile/android/build.gradle");
const rules = read("apps/mobile/android/app/proguard-rules.pro");
const app = JSON.parse(read("apps/mobile/app.json")).expo;
const eas = JSON.parse(read("apps/mobile/eas.json"));
const pkg = JSON.parse(read("apps/mobile/package.json"));
const lock = JSON.parse(read("apps/mobile/package-lock.json"));
const buildProperties = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties")[1];

assert.match(properties, /^android.enableMinifyInReleaseBuilds=true\s*$/m);
assert.match(properties, /^android.enableShrinkResourcesInReleaseBuilds=true\s*$/m);
assert.match(properties, /^android.r8.optimizedResourceShrinking=true\s*$/m);
assert.match(rootGradle, /classpath\('com.android.tools.build:gradle:8\.13\.2'\)/);
assert.doesNotMatch(properties, /^android.enableR8.fullMode=false\s*$/m);
assert.match(gradle, /getDefaultProguardFile\("proguard-android-optimize.txt"\)/);
assert.match(gradle, /def enableMinifyInReleaseBuilds = \(findProperty\('android\.enableMinifyInReleaseBuilds'\)/);
assert.match(gradle, /minifyEnabled enableMinifyInReleaseBuilds\b/);
assert.match(gradle, /def enableShrinkResources = findProperty\('android\.enableShrinkResourcesInReleaseBuilds'\)/);
assert.match(gradle, /shrinkResources enableShrinkResources\.toBoolean\(\)/);
assert.match(rootGradle, /constraints\.add\(configuration\.name, "com\.google\.android\.gms:play-services-auth:21\.5\.1"\)/);
assert.doesNotMatch(rules, /^\s*-(?:dontobfuscate|dontoptimize|dontshrink)\b/m);
assert.equal(buildProperties.android.enableMinifyInReleaseBuilds, true);
assert.equal(buildProperties.android.enableShrinkResourcesInReleaseBuilds, true);
assert.match(gradle, new RegExp(`versionCode ${app.android.versionCode}\\b`));
assert.ok(gradle.includes(`versionName "${app.version}"`));
assert.equal(eas.build.production.env.ANDROID_VERSION_CODE, String(app.android.versionCode));
assert.equal(eas.build.production.env.EXPO_PUBLIC_APP_VERSION, app.version);
assert.equal(pkg.version, app.version);
assert.equal(lock.version, app.version);
assert.equal(lock.packages[""].version, app.version);
// Preserve the prepared iOS draft independently of Android release numbering.
assert.equal(eas.build["ios-production"].env.EXPO_PUBLIC_APP_VERSION, "1.0.13");
assert.equal(eas.build["ios-production"].env.IOS_BUILD_NUMBER, "187");

console.log(`PASS: R8 release optimization and version alignment (${fileURLToPath(root)})`);
console.log("Source contract only: requires an optimized release build and device smoke test before production.");
