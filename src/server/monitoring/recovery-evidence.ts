import "server-only";
import { verify } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });
const backup = z.object({
  backupId: z.string().max(100), startedAt: timestamp, completedAt: timestamp, verifiedAt: timestamp,
  sizeBytes: z.number().int().positive(), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  storageBoundaries: z.array(z.enum(["primary", "secondary"])).length(2),
}).refine((value) => new Set(value.storageBoundaries).size === 2);
const drill = z.object({
  completedAt: timestamp, backupId: z.string().max(100), fileBackupId: z.string().max(100),
  durationSeconds: z.number().int().nonnegative(), remoteDownloadVerified: z.literal(true),
  filesExtractedInTmpfs: z.literal(true), productionContainersUnchanged: z.literal(true),
  outboundMessagingEnabled: z.literal(false),
  copies: z.array(z.object({ boundary: z.enum(["primary", "secondary"]), durationSeconds: z.number().nonnegative(), rowCountsMatch: z.literal(true), migrationCount: z.number().int().nonnegative(), temporaryResourcesRemoved: z.literal(true) })).length(2),
}).refine((value) => new Set(value.copies.map((copy) => copy.boundary)).size === 2);
const job = z.object({ status: z.enum(["RUNNING", "FAILED", "SUCCEEDED"]), startedAt: timestamp, completedAt: timestamp.optional(), errorCode: z.string().max(100).optional() }).nullable();
const schema = z.object({
  schemaVersion: z.literal(1), generatedAt: timestamp,
  retentionLock: z.object({
    checkedAt: timestamp, reviewDueAt: timestamp, method: z.literal("cloudflare-dashboard"),
    retentionDays: z.literal(30), prefix: z.literal("logivya-backups/recovery-v1/production/"),
    buckets: z.array(z.enum(["logivya-production-backups-primary", "logivya-production-backups-secondary"])).length(2),
  }).refine((value) => new Set(value.buckets).size === 2).nullable().optional(),
  database: backup.nullable(), files: backup.nullable(), drill: drill.nullable(),
  databaseJob: job, filesJob: job, drillJob: job, retentionJob: job,
  timers: z.record(z.string(), z.boolean()),
  policy: z.object({ databaseIntervalMinutes: z.literal(60), databaseMaxAgeMinutes: z.literal(90), filesMaxAgeHours: z.literal(26), drillMaxAgeHours: z.literal(26), databaseRpoMinutes: z.literal(90), serviceRtoHours: z.literal(4), pitrEnabled: z.boolean(), independentProvider: z.boolean(), immutableStorageVerified: z.boolean(), keyEscrowVerified: z.boolean(), fullServiceRestoreVerified: z.boolean() }),
});
export type RecoveryReport = z.infer<typeof schema>;
export type RecoveryEvidence = { available: true; report: RecoveryReport } | { available: false; errorCode: string; report: null };
export type RecoveryState = "VERIFIED" | "STALE" | "FAILED" | "UNKNOWN";

export function verifyRecoveryEvidence(raw: string, publicKey: string, now = Date.now()): RecoveryEvidence {
  try {
    if (raw.length > 64 * 1024 || publicKey.length > 4096) throw new Error("EVIDENCE_TOO_LARGE");
    const envelope = z.object({ payload: z.string().max(60000), signature: z.string().max(128) }).parse(JSON.parse(raw));
    const payload = Buffer.from(envelope.payload, "base64");
    if (!verify(null, payload, publicKey, Buffer.from(envelope.signature, "base64"))) throw new Error("EVIDENCE_SIGNATURE_INVALID");
    const report = schema.parse(JSON.parse(payload.toString("utf8")));
    const age = now - Date.parse(report.generatedAt);
    if (age < -60_000 || age > 15 * 60_000) throw new Error("EVIDENCE_STALE");
    const lock = report.retentionLock;
    if (lock && (Date.parse(lock.checkedAt) > now + 60_000 || Date.parse(lock.reviewDueAt) - Date.parse(lock.checkedAt) !== 7 * 86400_000)) throw new Error("EVIDENCE_LOCK_INVALID");
    if (report.policy.immutableStorageVerified && !lock) throw new Error("EVIDENCE_LOCK_MISSING");
    // The report refresh does not renew the provider observation's review deadline.
    if (lock && now >= Date.parse(lock.reviewDueAt)) report.policy.immutableStorageVerified = false;
    for (const value of [report.database, report.files, report.drill]) {
      if (value && Date.parse(value.completedAt) > now + 60_000) throw new Error("EVIDENCE_FUTURE_DATE");
    }
    return { available: true, report };
  } catch (error) {
    const code = error instanceof Error && /^EVIDENCE_[A-Z_]+$/.test(error.message) ? error.message : "EVIDENCE_INVALID";
    return { available: false, errorCode: code, report: null };
  }
}

export async function getRecoveryEvidence(): Promise<RecoveryEvidence> {
  try {
    // These files are a host bind mount, not build inputs. Keep paths literal
    // so output tracing cannot expand a dynamic filename to the whole project.
    const stats = await Promise.all([
      stat(/* turbopackIgnore: true */ "/run/logivya-recovery/report.json"),
      stat(/* turbopackIgnore: true */ "/run/logivya-recovery/public.pem"),
    ]);
    if (stats.some((file) => !file.isFile() || file.size > 64 * 1024)) throw new Error("INVALID_EVIDENCE_FILE");
    const [raw, publicKey] = await Promise.all([
      readFile(/* turbopackIgnore: true */ "/run/logivya-recovery/report.json", "utf8"),
      readFile(/* turbopackIgnore: true */ "/run/logivya-recovery/public.pem", "utf8"),
    ]);
    return verifyRecoveryEvidence(raw, publicKey);
  } catch {
    return { available: false, errorCode: "EVIDENCE_UNAVAILABLE", report: null };
  }
}

export function recoveryState(evidence: RecoveryEvidence, kind: "database" | "files" | "drill", now = Date.now()): RecoveryState {
  if (!evidence.available) return "UNKNOWN";
  const report = evidence.report;
  const timer = kind === "database" ? "postgres-backup" : `recovery-${kind}`;
  if (!report.timers[timer] || report[`${kind}Job`]?.status === "FAILED") return "FAILED";
  const item = report[kind];
  if (!item) return "UNKNOWN";
  const maxAge = kind === "database" ? 90 * 60_000 : 26 * 60 * 60_000;
  const snapshotAt = "startedAt" in item ? item.startedAt : item.completedAt;
  return now - Date.parse(snapshotAt) > maxAge ? "STALE" : "VERIFIED";
}
