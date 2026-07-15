import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const roots = ["src", "apps/mobile/src", "packages"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const allowed = new Set([path.normalize("src/server/observability/logger.ts")]);
const pattern = /\bconsole\.(?:log|info|warn|error|debug)\s*\(|\bprocess\.(?:stdout|stderr)\.write\s*\(/g;
const violations = [];

async function walk(relative) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (extensions.has(path.extname(entry.name)) && !allowed.has(path.normalize(child))) {
      const source = await readFile(path.join(root, child), "utf8");
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        violations.push(`${child}:${line} ${match[0].trim()}`);
      }
    }
  }
}

for (const directory of roots) await walk(directory);
if (violations.length) {
  process.stderr.write(`Uncontrolled production logging found:\n${violations.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Production console policy passed: no uncontrolled console or stdout/stderr writes.\n");
