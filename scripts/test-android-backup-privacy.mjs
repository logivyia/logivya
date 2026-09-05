import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const nativeRoot = "apps/mobile/android/app/src/main";
const manifest = read(`${nativeRoot}/AndroidManifest.xml`);
assert.match(manifest, /android:allowBackup="false"/);
assert.match(manifest, /android:fullBackupContent="@xml\/logivya_backup_rules"/);
assert.match(manifest, /android:dataExtractionRules="@xml\/logivya_data_extraction_rules"/);
assert.match(manifest, /<uses-permission android:name="android.permission.CAMERA" tools:node="remove"\s*\/>/);
assert.match(manifest, /<uses-feature android:name="android.hardware.camera" android:required="false"\s*\/>/);

const legacy = read(`${nativeRoot}/res/xml/logivya_backup_rules.xml`);
const modern = read(`${nativeRoot}/res/xml/logivya_data_extraction_rules.xml`);
const sections = [
  legacy.match(/<full-backup-content>([\s\S]*?)<\/full-backup-content>/)?.[1],
  modern.match(/<cloud-backup[^>]*>([\s\S]*?)<\/cloud-backup>/)?.[1],
  modern.match(/<device-transfer>([\s\S]*?)<\/device-transfer>/)?.[1],
];
for (const section of sections) {
  assert.ok(section, "Every supported backup/transfer mode must be explicit");
  assert.doesNotMatch(section, /<include\b/);
  for (const domain of ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"]) {
    assert.ok(section.includes(`<exclude domain="${domain}" path="."/>`), `${domain} must not migrate device-bound app data`);
  }
}

console.log("PASS: Android backup exclusions and optional camera hardware; camera permission stays removed");
console.log("Scope: source contracts; merged bundle and real-device acceptance are separate checks.");
