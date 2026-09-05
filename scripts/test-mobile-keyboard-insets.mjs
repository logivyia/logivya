import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../apps/mobile/src/${name}`, import.meta.url), "utf8");
const screen = read("components/screen.tsx");
const navigator = read("navigation/app-navigator.tsx");
const dashboard = read("screens/app/dashboard-screen.tsx");
const tabs = read("components/marketplace-bottom-tab-bar.tsx");

assert.match(navigator, /ScreenBottomInsetContext.Provider value=\{!usePermanentSidebar && freightEnabled\}/);
assert.match(screen, /useContext\(ScreenBottomInsetContext\)/);
assert.match(screen, /bottomInsetOwned \? \["left", "right"\] : \["left", "right", "bottom"\]/);
assert.match(screen, /bottomInsetOwned \? styles.withBottomBar : null/);
assert.match(screen, /withBottomBar:\s*\{\s*paddingBottom: 0/);
assert.match(dashboard, /<KeyboardAvoidingView/);
assert.match(dashboard, /keyboardVerticalOffset=\{headerHeight\}/);
assert.match(dashboard, /onFocus=\{revealSearch\}/);
assert.match(dashboard, /Keyboard.addListener\("keyboardDidShow", revealSearch\)/);
assert.match(dashboard, /ref=\{searchInputRef\}/);
assert.match(dashboard, /searchInputRef.current\?\.isFocused\(\)/);
assert.match(dashboard, /searchCardY.current - 12/);
assert.doesNotMatch(tabs, /numberOfLines=\{1\}/);
assert.match(tabs, /textAlign: "center"/);
assert.doesNotMatch(tabs, /maxWidth: 72/);
console.log("PASS: keyboard reveal, single-owner bottom insets and wrapping tab-label source contracts");
console.log("These checks do not replace physical keyboard/rotation/font-scale testing.");
