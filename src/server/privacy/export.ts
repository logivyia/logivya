import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";
import { privacyPublicId } from "@/server/privacy/ids";
import { createPrivacyRequest } from "@/server/privacy/requests";
import { PrivacyError } from "@/server/privacy/errors";

const EXPORT_EXPIRY_DAYS = 7;

type ExportStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  encryptionKey: Buffer;
  encryptionKeyVersion: string;
};

function readEncryptionKey(value: string) {
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, "hex");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("PRIVACY_EXPORT_ENCRYPTION_KEY_INVALID");
  return decoded;
}

function exportStorageConfig(): ExportStorageConfig {
  const required = {
    endpoint: process.env.PRIVACY_EXPORT_S3_ENDPOINT,
    region: process.env.PRIVACY_EXPORT_S3_REGION || "auto",
    bucket: process.env.PRIVACY_EXPORT_S3_BUCKET,
    accessKeyId: process.env.PRIVACY_EXPORT_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PRIVACY_EXPORT_S3_SECRET_ACCESS_KEY,
    encryptionKey: process.env.PRIVACY_EXPORT_ENCRYPTION_KEY,
    encryptionKeyVersion: process.env.PRIVACY_EXPORT_KEY_VERSION,
  };
  if (!required.endpoint || !required.bucket || !required.accessKeyId || !required.secretAccessKey || !required.encryptionKey || !required.encryptionKeyVersion) {
    throw new Error("PRIVACY_EXPORT_STORAGE_NOT_CONFIGURED");
  }
  if (!required.endpoint.startsWith("https://")) throw new Error("PRIVACY_EXPORT_ENDPOINT_INVALID");
  return { ...required, encryptionKey: readEncryptionKey(required.encryptionKey) } as ExportStorageConfig;
}

function storageClient(config: ExportStorageConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

function objectKeyFor(job: { companyId: string; userId: string; publicId: string }) {
  const date = new Date().toISOString().slice(0, 10);
  return `privacy-exports/${date}/${hashOpaqueToken(job.companyId).slice(0, 16)}/${hashOpaqueToken(job.userId).slice(0, 16)}/${job.publicId}.json.gz.enc`;
}

function deriveObjectKey(masterKey: Buffer, jobId: string) {
  return createHmac("sha256", masterKey).update(`logivya-privacy-export:${jobId}`).digest();
}

function jsonValue(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function collectExportData(companyId: string, userId: string) {
  const [user, company, membership, consents, requests, supportTickets, accounts, contacts, groups, campaigns, notifications, notificationPreferences, notificationDevices] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, username: true, email: true, emailVerifiedAt: true, phone: true, avatarUrl: true, locale: true, timezone: true, country: true, theme: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, name: true, address: true, city: true, district: true, postalCode: true, taxOffice: true, taxNumber: true, phone: true, email: true, ownerId: true, defaultLanguage: true, defaultTimezone: true, defaultCurrency: true, defaultCountry: true, createdAt: true, updatedAt: true },
    }),
    prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId } },
      select: { role: true, status: true, joinedAt: true, seatActivatedAt: true, createdAt: true, updatedAt: true },
    }),
    prisma.consentRecord.findMany({
      where: { userId, OR: [{ companyId }, { companyId: null }] },
      select: { type: true, purposeCode: true, status: true, version: true, legalTextVersion: true, noticeVersion: true, granted: true, collectionMethod: true, platform: true, appVersion: true, locale: true, collectedAt: true, withdrawnAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dataSubjectRequest.findMany({
      where: { userId, companyId },
      select: { publicId: true, type: true, status: true, reason: true, description: true, responseSummary: true, requestedAt: true, receivedAt: true, deadlineAt: true, completedAt: true, closedAt: true },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.supportTicket.findMany({
      where: { companyId, userId },
      select: {
        publicId: true, subject: true, title: true, type: true, category: true, description: true, status: true, priority: true, source: true, createdAt: true, updatedAt: true,
        messages: { where: { isInternal: false, deletedAt: null }, select: { senderType: true, message: true, createdAt: true, editedAt: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.whatsAppAccount.findMany({
      where: { companyId, userId },
      select: { id: true, label: true, phoneNumber: true, displayName: true, provider: true, status: true, lastConnectedAt: true, lastDisconnectedAt: true, lastSyncedAt: true, lastGroupSyncAt: true, lastContactSyncAt: true, archivedAt: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.contact.findMany({
      where: { companyId, userId },
      select: { accountId: true, externalContactId: true, name: true, pushName: true, notifyName: true, verifiedName: true, displayName: true, displayNameSource: true, phone: true, source: true, isWhatsAppUser: true, isActive: true, lastSeenAt: true, lastSyncedAt: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.whatsAppGroup.findMany({
      where: { companyId, userId },
      select: { accountId: true, externalGroupId: true, name: true, description: true, participantCount: true, canSend: true, isArchived: true, lastSyncedAt: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.messageCampaign.findMany({
      where: { companyId, createdById: userId },
      select: { id: true, title: true, content: true, type: true, status: true, scheduleType: true, scheduledAt: true, recurringRule: true, totalRecipients: true, sentCount: true, failedCount: true, canceledCount: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notification.findMany({
      where: { companyId, userId },
      select: { type: true, category: true, priority: true, title: true, message: true, payload: true, deepLink: true, isRead: true, readAt: true, archivedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notificationPreference.findMany({
      where: { companyId, userId },
      select: { category: true, channel: true, enabled: true, mandatoryLocked: true, digestMode: true, quietHoursStart: true, quietHoursEnd: true, timezone: true, createdAt: true, updatedAt: true },
      orderBy: [{ category: "asc" }, { channel: "asc" }],
    }),
    prisma.notificationDevice.findMany({
      where: { companyId, userId },
      select: { platform: true, locale: true, timezone: true, enabled: true, lastSeenAt: true, invalidatedAt: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    manifest: {
      format: "LOGIVYA_PRIVACY_EXPORT_V1",
      generatedAt: new Date().toISOString(),
      companyId,
      userId,
      legalReviewStatus: "LEGAL_REVIEW_REQUIRED",
      exclusions: ["password hashes", "session tokens", "WhatsApp session credentials", "encryption keys", "internal support notes", "other users' records"],
    },
    profile: user,
    company,
    membership,
    consents,
    privacyRequests: requests,
    supportTickets,
    whatsAppAccounts: accounts,
    contacts,
    groups,
    campaigns,
    notifications,
    notificationPreferences,
    notificationDevices,
  };
}

export async function queuePrivacyExport(input: { companyId: string; userId: string }) {
  const active = await prisma.privacyExportJob.findFirst({
    where: { companyId: input.companyId, userId: input.userId, status: { in: ["QUEUED", "PROCESSING", "READY"] }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (active) throw new PrivacyError("PRIVACY_EXPORT_ALREADY_ACTIVE", 409);

  const request = await createPrivacyRequest({ companyId: input.companyId, userId: input.userId, type: "EXPORT" });
  const downloadToken = randomBytes(32).toString("base64url");
  const job = await prisma.privacyExportJob.create({
    data: {
      publicId: privacyPublicId("EXP"),
      companyId: input.companyId,
      userId: input.userId,
      requestId: request.id,
      scope: { version: 1, subject: "authenticated-user", companyId: input.companyId, userId: input.userId },
      downloadTokenHash: hashOpaqueToken(downloadToken),
      expiresAt: new Date(Date.now() + EXPORT_EXPIRY_DAYS * 86_400_000),
    },
  });
  return { job, downloadToken };
}

export async function processPrivacyExportQueue(limit = 2) {
  const jobs = await prisma.privacyExportJob.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(limit, 5)) });
  const results: Array<{ publicId: string; status: string }> = [];
  for (const job of jobs) {
    const claimed = await prisma.privacyExportJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null } });
    if (claimed.count !== 1) continue;
    try {
      const config = exportStorageConfig();
      const data = await collectExportData(job.companyId, job.userId);
      const compressed = gzipSync(Buffer.from(JSON.stringify(data, jsonValue), "utf8"), { level: 9 });
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", deriveObjectKey(config.encryptionKey, job.id), iv);
      const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const checksumSha256 = createHash("sha256").update(encrypted).digest("hex");
      const objectKey = objectKeyFor(job);
      await storageClient(config).send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: encrypted,
        ContentType: "application/octet-stream",
        Metadata: { format: "logivya-privacy-export-v1", checksum: checksumSha256, keyversion: config.encryptionKeyVersion },
      }));
      await prisma.privacyExportJob.update({
        where: { id: job.id },
        data: { status: "READY", objectKey, encryptionKeyVersion: config.encryptionKeyVersion, encryptionIv: iv.toString("base64"), encryptionAuthTag: authTag.toString("base64"), sizeBytes: encrypted.length, checksumSha256 },
      });
      if (job.requestId) await prisma.dataSubjectRequest.update({ where: { id: job.requestId }, data: { status: "PROCESSING" } });
      results.push({ publicId: job.publicId, status: "READY" });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 200) : "PRIVACY_EXPORT_FAILED";
      await prisma.privacyExportJob.update({ where: { id: job.id }, data: { status: "FAILED", lastError: code } });
      results.push({ publicId: job.publicId, status: "FAILED" });
    }
  }
  return results;
}

async function bodyBytes(body: unknown) {
  if (body && typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error("PRIVACY_EXPORT_BODY_UNREADABLE");
}

export async function downloadPrivacyExport(input: { companyId: string; userId: string; publicId: string; token: string }) {
  const job = await prisma.privacyExportJob.findFirst({ where: { publicId: input.publicId, companyId: input.companyId, userId: input.userId } });
  const suppliedTokenHash = Buffer.from(hashOpaqueToken(input.token));
  const storedTokenHash = Buffer.from(job?.downloadTokenHash ?? "");
  if (!job || !job.downloadTokenHash || suppliedTokenHash.length !== storedTokenHash.length || !timingSafeEqual(suppliedTokenHash, storedTokenHash)) {
    throw new PrivacyError("PRIVACY_EXPORT_NOT_FOUND", 404);
  }
  if (job.status !== "READY" || !job.objectKey || !job.encryptionIv || !job.encryptionAuthTag || !job.expiresAt || job.expiresAt <= new Date()) {
    throw new PrivacyError("PRIVACY_EXPORT_NOT_READY", 409);
  }
  const claimed = await prisma.privacyExportJob.updateMany({ where: { id: job.id, status: "READY", downloadedAt: null }, data: { status: "PROCESSING" } });
  if (claimed.count !== 1) throw new PrivacyError("PRIVACY_EXPORT_ALREADY_DOWNLOADED", 409);

  try {
    const config = exportStorageConfig();
    if (job.encryptionKeyVersion !== config.encryptionKeyVersion) throw new Error("PRIVACY_EXPORT_KEY_VERSION_UNAVAILABLE");
    const response = await storageClient(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: job.objectKey }));
    const encrypted = await bodyBytes(response.Body);
    const checksum = createHash("sha256").update(encrypted).digest("hex");
    if (checksum !== job.checksumSha256) throw new Error("PRIVACY_EXPORT_CHECKSUM_MISMATCH");
    const decipher = createDecipheriv("aes-256-gcm", deriveObjectKey(config.encryptionKey, job.id), Buffer.from(job.encryptionIv, "base64"));
    decipher.setAuthTag(Buffer.from(job.encryptionAuthTag, "base64"));
    const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const data = gunzipSync(compressed);
    await prisma.privacyExportJob.update({ where: { id: job.id }, data: { status: "COMPLETED", downloadedAt: new Date(), downloadTokenHash: null } });
    if (job.requestId) await prisma.dataSubjectRequest.update({ where: { id: job.requestId }, data: { status: "COMPLETED", completedAt: new Date(), closedAt: new Date() } });
    return data;
  } catch (error) {
    await prisma.privacyExportJob.update({ where: { id: job.id }, data: { status: "READY", lastError: error instanceof Error ? error.message.slice(0, 200) : "PRIVACY_EXPORT_DOWNLOAD_FAILED" } });
    throw error;
  }
}

export async function expirePrivacyExports(options: { dryRun: boolean }) {
  const expired = await prisma.privacyExportJob.findMany({
    where: { expiresAt: { lte: new Date() }, status: { in: ["READY", "COMPLETED", "FAILED"] } },
    select: { id: true, objectKey: true },
    take: 100,
  });
  if (options.dryRun) return { candidates: expired.length, deletedObjects: 0 };
  if (process.env.PRIVACY_RETENTION_ENFORCEMENT !== "true") throw new Error("PRIVACY_RETENTION_ENFORCEMENT_DISABLED");
  const config = exportStorageConfig();
  let deletedObjects = 0;
  for (const job of expired) {
    if (job.objectKey) {
      await storageClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: job.objectKey }));
      deletedObjects += 1;
    }
    await prisma.privacyExportJob.update({ where: { id: job.id }, data: { status: "EXPIRED", objectKey: null, downloadTokenHash: null, encryptionIv: null, encryptionAuthTag: null } });
  }
  return { candidates: expired.length, deletedObjects };
}
