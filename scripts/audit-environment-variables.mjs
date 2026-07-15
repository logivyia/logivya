import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).toString("utf8").split("\0").filter(Boolean);
const sourceFiles = tracked.filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(file));
const references = new Map();
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  const names = new Set([
    ...[...source.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]),
    ...[...source.matchAll(/process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g)].map((match) => match[1]),
  ]);
  for (const name of names) references.set(name, [...(references.get(name) || []), file]);
}
const exampleSource = await readFile(".env.example", "utf8");
const documented = new Set([...exampleSource.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((match) => match[1]));

function classify(name) {
  const isPublic = /^(?:NEXT_PUBLIC|EXPO_PUBLIC)_/.test(name);
  const secret = !isPublic && /(?:SECRET|PASSWORD|PEPPER|TOKEN|PRIVATE|DATABASE_URL|REDIS_URL|SMTP_PASS|ACCESS_KEY|API_KEY|DSN)/.test(name);
  const buildTime = /^(?:EXPO_PUBLIC|ANDROID_|IOS_|EAS_|GIT_|VERCEL_|SOURCE_COMMIT|RENDER_GIT_COMMIT)/.test(name);
  const testOnly = /(?:_TEST_|TEST_BASE_URL|_PROOF_|SMOKE_BASE_URL|SUPPORT_LOAD_)/.test(name);
  return { public: isPublic, secret, buildTime, runtime: !buildTime, testOnly };
}

const variables = [...references.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => ({
  name,
  documented: documented.has(name),
  ...classify(name),
  files,
}));
const publicSecretShaped = variables.filter((item) => item.public && /(?:SECRET|PASSWORD|PRIVATE|TOKEN)/.test(item.name)).map((item) => item.name);
const report = {
  generatedAt: new Date().toISOString(),
  referencedCount: variables.length,
  documentedCount: documented.size,
  missingFromExample: variables.filter((item) => !item.documented).map((item) => item.name),
  publicSecretShaped,
  variables,
};
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes("--write")) await writeFile(path.resolve("docs/environment-variable-inventory.json"), output);
console.log(output.trim());
if (publicSecretShaped.length) process.exitCode = 1;
