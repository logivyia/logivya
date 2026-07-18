import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const skipped = /(^|\/)(package-lock\.json|.*\.(png|jpe?g|gif|webp|ico|zip|aab|apk|pdf|docx|woff2?|ttf))$/i;
const findings = [];
const detectors = [
  { name: "Private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "GitHub token", pattern: /\b(?:gh[opsu]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "Google service account key", pattern: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/g },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/g },
];

for (const relative of tracked) {
  const normalized = relative.replaceAll("\\", "/");
  if (normalized === "scripts/release/scan-repository-secrets.mjs") continue;
  if (skipped.test(normalized)) continue;
  let content;
  try {
    content = readFileSync(path.join(root, relative), "utf8");
  } catch {
    continue;
  }
  if (content.includes("\u0000")) continue;
  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const match of content.matchAll(detector.pattern)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({ detector: detector.name, file: normalized, line });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) console.error(`SECRET ${finding.detector}: ${finding.file}:${finding.line}`);
  console.error(`Repository secret scan failed with ${findings.length} finding(s). Values were not printed.`);
  process.exit(2);
}
console.log(`Repository secret scan passed (${tracked.length} tracked files inspected).`);
