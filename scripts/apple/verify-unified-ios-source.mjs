import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { repoRoot } from "./app-store-connect-client.mjs";

// Read-only: this command never creates a build or contacts either store.
const manifest = JSON.parse(readFileSync(path.join(repoRoot, "releases/ios-193/source-manifest.json"), "utf8"));
const eas = JSON.parse(readFileSync(path.join(repoRoot, "apps/mobile/eas.json"), "utf8"));
const failures = [];
// A dependency cache can mask a missing installation hook. Check the files
// invoked by both package lifecycles before spending cloud build credit.
for (const packageFile of ["package.json", "apps/mobile/package.json"]) {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, packageFile), "utf8"));
  for (const [hook, command] of Object.entries(packageJson.scripts || {})) {
    if (!["preinstall", "install", "postinstall"].includes(hook) && !hook.startsWith("eas-build-")) continue;
    for (const match of command.matchAll(/\bnode\s+["']?([^\s"';&]+)/gu)) {
      if (match[1].startsWith("-")) continue;
      const scriptPath = path.resolve(repoRoot, path.dirname(packageFile), match[1]);
      try { readFileSync(scriptPath); }
      catch { failures.push(`Missing ${packageFile} ${hook} script: ${match[1]}`); }
    }
  }
}
const canonicalBytes = (file, contents) => manifest.textExtensions.includes(path.extname(file))
  || manifest.textFileNames.includes(path.basename(file))
  ? Buffer.from(contents.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : contents;
for (const [file, expected] of Object.entries(manifest.files)) {
  try {
    const actual = createHash("sha256").update(canonicalBytes(file, readFileSync(path.join(repoRoot, file)))).digest("hex");
    if (actual !== expected) failures.push(`Changed source: ${file}`);
  } catch {
    failures.push(`Missing source: ${file}`);
  }
}
const nativeInput = (file) => manifest.inputPrefixes.some((prefix) => file.startsWith(prefix))
  && !manifest.excludedPrefixes.some((prefix) => file.startsWith(prefix));
// Include new, non-ignored source files so a later addition cannot silently
// change the frozen release. Ignored local signing material is not source.
const currentFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: repoRoot, encoding: "utf8",
}).split("\0").filter(Boolean);
for (const file of currentFiles) {
  if (nativeInput(file) && !manifest.files[file]) failures.push(`Unfrozen source: ${file}`);
}
const canonical = eas.build["ios-production"];
if (canonical.env.EXPO_PUBLIC_APP_VERSION !== manifest.version
  || canonical.env.IOS_BUILD_NUMBER !== manifest.buildNumber
  || canonical.env.EXPO_PUBLIC_BUILD_MARKER !== manifest.buildMarker
  || canonical.autoIncrement !== false) failures.push("Canonical iOS profile differs from release manifest");
const internal = eas.build["ios-testflight-internal"];
if (internal.extends !== "ios-production" || Object.keys(internal).length !== 1) {
  failures.push("Internal iOS profile must inherit the same frozen candidate without overrides");
}
console.log(JSON.stringify({
  ok: failures.length === 0, version: manifest.version, build: manifest.buildNumber,
  sourceFileCount: Object.keys(manifest.files).length, failures,
  buildCreated: false, uploaded: false, submittedForReview: false,
}, null, 2));
if (failures.length) process.exitCode = 2;
