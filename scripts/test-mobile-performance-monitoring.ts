import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const packageJson = JSON.parse(read("apps/mobile/package.json"));
const firebaseJson = JSON.parse(read("apps/mobile/firebase.json"));
const appJson = JSON.parse(read("apps/mobile/app.json"));
const projectGradle = read("apps/mobile/android/build.gradle");
const appGradle = read("apps/mobile/android/app/build.gradle");
const manifest = read("apps/mobile/android/app/src/main/AndroidManifest.xml");
const reactNativeConfig = read("apps/mobile/react-native.config.js");
const performanceService = read("apps/mobile/src/services/performance-monitoring.ts");
const app = read("apps/mobile/App.tsx");
const privacyScreen = read("apps/mobile/src/screens/app/privacy-data-screen.tsx");

assert.equal(packageJson.dependencies["@react-native-firebase/perf"], "24.1.1");
assert.equal(firebaseJson["react-native"].perf_auto_collection_enabled, false);
assert.equal(firebaseJson["react-native"].perf_collection_deactivated, false);
assert.ok(appJson.expo.android.versionCode >= 177);
assert.match(appJson.expo.extra.buildMarker, /^ANDROID_/);
assert.match(projectGradle, /com\.google\.firebase:perf-plugin:2\.0\.2/);
assert.match(appGradle, /apply plugin: "com\.google\.firebase\.firebase-perf"/);
assert.match(manifest, /firebase_performance_collection_enabled" android:value="false"/);
assert.match(reactNativeConfig, /"@react-native-firebase\/perf"[\s\S]*ios: null/);
assert.match(performanceService, /Platform\.OS !== "android"/);
assert.match(performanceService, /diagnosticsEnabled/);
assert.match(performanceService, /startScreenTrace/);
assert.match(performanceService, /startTrace\(traceName\)/);
assert.match(app, /configurePerformanceMonitoring\(diagnosticsEnabled\)/);
assert.match(app, /trackPerformanceScreen\(currentRouteName\)/);
assert.match(privacyScreen, /configurePerformanceMonitoring\(enabled\)/);

console.log("Mobile Android performance monitoring contract passed.");
