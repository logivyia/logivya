const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const path = require("node:path");
const mobileRequire = createRequire(path.resolve(__dirname, "../apps/mobile/package.json"));

// Tooling-only compatibility tests: never invokes prebuild or edits iOS projects.
const project = mobileRequire("xcode").project("synthetic-only");
project.hash = { project: { objects: {} } };
assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
assert.equal(mobileRequire("postcss").parse("a { color: red }").first.selector, "a");
assert.deepEqual(mobileRequire("shell-quote").parse('echo "hello world"'), ["echo", "hello world"]);
assert.equal(mobileRequire("protobufjs").parse('syntax = "proto3"; message Example { string name = 1; }').root.lookupType("Example").name, "Example");
assert.deepEqual(mobileRequire("js-yaml").load("name: logivya\nenabled: true\n"), { name: "logivya", enabled: true });
console.log("Mobile patched build-tool compatibility passed: Xcode UUID, PostCSS, shell-quote, protobuf, YAML. No project mutations.");
