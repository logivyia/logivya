import { rm } from "node:fs/promises";
import path from "node:path";
import {
  REQUIRED_ARCHIVE_TABLES,
  createBackupIdentity,
  encryptDatabaseDump,
  inspectEncryptedArchive,
  manifestSignature,
  openDatabaseBackupSnapshot,
  parseArgs,
  requiredEnv,
  uploadBackupCopies,
  writeManifest,
} from "./backup-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const environment = String(args.environment || process.env.BACKUP_ENVIRONMENT || "production").toLowerCase();
const outputDirectory = path.resolve(String(args.output || process.env.BACKUP_OUTPUT_DIR || path.join("artifacts", "backups")));
if (environment === "production" && process.env.CI !== "true" && process.env.BACKUP_ALLOW_LOCAL_PRODUCTION_OUTPUT !== "1") {
  throw new Error("LOCAL_PRODUCTION_BACKUP_OUTPUT_BLOCKED");
}

const { backupId, correlationId, startedAt } = createBackupIdentity(environment);
const archivePath = path.join(outputDirectory, `${backupId}.dump.enc`);
const manifestPath = path.join(outputDirectory, `${backupId}.manifest.json`);
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
const retentionExpiresAt = new Date(startedAt.getTime() + retentionDays * 86_400_000).toISOString();
const statusHistory = [
  { status: "QUEUED", at: startedAt.toISOString() },
  { status: "RUNNING", at: new Date().toISOString() },
];
const connectionString = requiredEnv("DATABASE_URL");
const snapshot = await openDatabaseBackupSnapshot(connectionString);

let manifest;
try {
  manifest = await encryptDatabaseDump({
    connectionString,
    archivePath,
    snapshotId: snapshot.snapshotId,
    manifestBase: {
      manifestVersion: 1,
      backupId,
      correlationId,
      environment,
      backupType: "POSTGRES_LOGICAL",
      archiveFormat: "PG_DUMP_CUSTOM",
      archiveFile: path.basename(archivePath),
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      status: "COMPLETED",
      statusHistory,
      source: snapshot.source,
      retentionExpiresAt,
      storageLocations: [],
      verification: {
        status: "PENDING",
        requiredTables: REQUIRED_ARCHIVE_TABLES,
        checksumVerified: false,
        archiveParsed: false,
        requiredTablesPresent: false,
      },
    },
  });
} finally {
  await snapshot.close();
}
manifest.statusHistory.push({ status: "COMPLETED", at: manifest.completedAt });
manifest.manifestHmac = manifestSignature(manifest);

const verification = await inspectEncryptedArchive(archivePath, manifest);
manifest.status = "VERIFIED";
manifest.verifiedAt = new Date().toISOString();
manifest.verification = { ...manifest.verification, ...verification, status: "VERIFIED", verifiedAt: manifest.verifiedAt };
manifest.statusHistory.push({ status: "VERIFIED", at: manifest.verifiedAt });
await writeManifest(manifestPath, manifest);

if (args.upload) {
  await uploadBackupCopies({ archivePath, manifestPath, manifest, requireSecondary: Boolean(args["require-secondary"]) });
}

console.log(JSON.stringify({
  backupId,
  status: manifest.status,
  sizeBytes: manifest.sizeBytes,
  checksumSha256: manifest.checksumSha256,
  archivePath,
  manifestPath,
  storageLocations: manifest.storageLocations,
  correlationId,
}, null, 2));

if (args["delete-local-after-upload"] && args.upload) {
  await Promise.all([rm(archivePath, { force: true }), rm(manifestPath, { force: true })]);
}
