import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const mobile = JSON.parse(read("apps/mobile/package.json"));
const lock = JSON.parse(read("apps/mobile/package-lock.json"));
const screens = JSON.parse(read("apps/mobile/node_modules/react-native-screens/package.json"));

// Screens 4.17 removed deprecated Android window-colour code (upstream #3264).
// 4.18 also includes the native-component unmount freeze fix (#3324).
// Keep this narrow, tested override explicit instead of upgrading Expo/RN wholesale.
assert.equal(mobile.dependencies["react-native-screens"], "4.18.0");
assert.equal(lock.packages[""].dependencies["react-native-screens"], "4.18.0");
assert.equal(lock.packages["node_modules/react-native-screens"].version, "4.18.0");
assert.equal(screens.version, "4.18.0");
assert.equal(mobile.dependencies["react-native"], "0.81.5");

const windowTraits = read(
  "apps/mobile/node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/ScreenWindowTraits.kt",
);
for (const legacyApi of [
  /\b(?:window|it)\.(?:statusBarColor|navigationBarColor)\b/,
  /\b(?:get|set)(?:StatusBarColor|NavigationBarColor)\s*\(/,
]) {
  assert.doesNotMatch(windowTraits, legacyApi, "Do not reintroduce deprecated Screens colour APIs");
}

const gradleProperties = read("apps/mobile/android/gradle.properties");
assert.match(gradleProperties, /^edgeToEdgeEnabled=true\s*$/m);
assert.match(gradleProperties, /^newArchEnabled=true\s*$/m);
assert.match(gradleProperties, /^hermesEnabled=true\s*$/m);

const screen = read("apps/mobile/src/components/screen.tsx");
assert.match(screen, /from "react-native-safe-area-context"/);
assert.match(screen, /edges=\{bottomInsetOwned \? \["left", "right"\] : \["left", "right", "bottom"\]\}/);
const navigation = read("apps/mobile/src/components/web-parity-tab-bar.tsx");
assert.match(navigation, /from "react-native-safe-area-context"/);
assert.match(navigation, /edges=\{\["top"\]\}/);
assert.match(navigation, /edges=\{\["top", "bottom"\]\}/);
const marketplaceTabs = read("apps/mobile/src/components/marketplace-bottom-tab-bar.tsx");
assert.match(marketplaceTabs, /useSafeAreaInsets\(\)/);

console.log("PASS: Android edge-to-edge dependency, lockfile and safe-area regression checks");
console.log("Scope: source checks only; this is not an Android device test or a Play pre-launch report.");
