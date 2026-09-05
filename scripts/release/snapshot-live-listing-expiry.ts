import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../../src/server/db";

async function main() {
const generatedAt = new Date().toISOString();
const [freight, vehicles, drivers] = await Promise.all([
  prisma.freightListing.findMany({
    where: { source: "WHATSAPP", status: "ACTIVE" },
    select: { id: true, expiresAt: true },
    orderBy: { id: "asc" },
  }),
  prisma.vehicleListing.findMany({
    where: { source: "WHATSAPP", status: "ACTIVE" },
    select: { id: true, expiresAt: true },
    orderBy: { id: "asc" },
  }),
  prisma.driverListing.findMany({
    where: { source: "WHATSAPP", status: "ACTIVE" },
    select: { id: true, expiresAt: true },
    orderBy: { id: "asc" },
  }),
]);

const snapshot = {
  schemaVersion: 1,
  generatedAt,
  purpose: "Pre-migration rollback evidence for WhatsApp listing expiry only; contains no message text or contact data.",
  freight,
  vehicles,
  drivers,
};
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
const checksumSha256 = createHash("sha256").update(serialized).digest("hex");
const outputDirectory = path.resolve("artifacts", "releases", "database-prechange");
const fileName = `whatsapp-listing-expiry-${generatedAt.replace(/[:.]/gu, "-")}.json`;
const outputPath = path.join(outputDirectory, fileName);

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, serialized, { mode: 0o600 });
await prisma.$disconnect();

console.log(JSON.stringify({
  ok: true,
  outputPath,
  checksumSha256,
  counts: { freight: freight.length, vehicles: vehicles.length, drivers: drivers.length },
}, null, 2));
}

main().catch(async (error) => {
  await prisma.$disconnect().catch(() => undefined);
  console.error(error instanceof Error ? error.message : "Snapshot failed.");
  process.exitCode = 1;
});
