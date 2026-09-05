import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key])
      process.env[key] = parts.join("=").replace(/^["']|["']$/gu, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.production.local"));
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

function readLimit() {
  const value = process.argv
    .find((argument) => argument.startsWith("--limit="))
    ?.split("=")[1];
  const parsed = Number(value ?? 100);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), 500)
    : 100;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = readLimit();
  const { prisma } = await import("../src/server/db");
  const {
    findConnectedPendingTrialCandidates,
    reconcileConnectedPendingTrials,
  } =
    await import("../src/server/billing/trial-service");

  try {
    const candidates = await findConnectedPendingTrialCandidates(limit);

    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "audit",
          count: candidates.length,
          candidates,
        },
        null,
        2,
      ),
    );
    if (!apply) {
      console.log(
        "Audit only. Re-run with --apply after reviewing the candidate list.",
      );
      return;
    }

    const results = await reconcileConnectedPendingTrials(limit);
    console.log(JSON.stringify({ repaired: results.length, results }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
