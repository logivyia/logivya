/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import makeWASocket, { Browsers, DisconnectReason, WAMessageStatus, WAMessageStubType, fetchLatestBaileysVersion, fetchLatestWaWebVersion, getPlatformId, useMultiFileAuthState, type Contact as BaileysContact, type WAMessage, type WAMessageKey, type WASocket } from "@whiskeysockets/baileys";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import QRCode from "qrcode";
import { canonicalAuditAction, normalizeCorrelationId, sanitizeLogMetadata, sanitizeLogText } from "@logivya/logging";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { captureApprovedWhatsAppMessage, markWhatsAppSourceMessageDeleted, type CapturedAttachment } from "@/server/whatsapp-ingestion/capture";
import { recommendLogisticsWhatsAppGroup } from "@/server/whatsapp-ingestion/group-recommendation";
import { resolveApprovedPendingReception } from "@/server/whatsapp-ingestion/pending-delivery-policy";
import { updateMessageCampaignDeliveryAggregate } from "@/server/messages/delivery-state";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { computeWhatsAppHealthScore } from "@/server/whatsapp/connection-health";
import { canExposePhonePairingCode } from "@/server/whatsapp/pairing-code-state";
import { hasActivePhonePairing, isPhonePairingActive } from "@/server/whatsapp/pairing-guard";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import { inferPhoneCountry } from "@/lib/phone/normalize";
import { safelyEvaluateTrialAfterConnection } from "@/server/billing/trial-service";
import { normalizeProviderContact, persistWhatsAppContacts, resetWhatsAppContactDirectoryIfIdentityChanged, type ProviderContactRecord } from "@/server/whatsapp/contacts";
import { collectGroupParticipantContacts } from "@/server/whatsapp/group-participant-contacts";
import {
  normalizeWhatsAppGroupMetadata,
  type RuntimeWhatsAppGroupMetadata,
} from "@/server/whatsapp/group-sync-normalization";
import {
  backupWhatsAppSessionToDatabase,
  clearWhatsAppSession,
  ensureWhatsAppSessionRoot,
  hasRestorableWhatsAppCredentials,
  restoreWhatsAppSessionFromDatabase,
  whatsappSessionDirectory,
} from "@/lib/whatsapp/session-manager";
import type { CreateFreshQrSessionOptions, DeleteContactMessageInput, DeleteGroupMessageInput, DeleteResult, GroupResult, RequestPairingCodeOptions, SendContactMessageInput, SendGroupMessageInput, SendResult, SessionResult, WhatsAppProvider } from "@/server/whatsapp/provider";
import { assertWhatsAppMediaUploadResult, buildWhatsAppOutboundPayload } from "@/server/whatsapp/outbound-payload";

type SessionMode = "PAIR_QR" | "PAIR_PHONE" | "RESTORE" | "RECONNECT";
type BaileysContactRecord = Partial<BaileysContact> & { id?: string; phoneNumber?: string | null };
type LidPnMapping = { lid: string; pn: string };
type RuntimeSignalKeyStore = {
  get(type: string, ids: string[]): Promise<Record<string, unknown>>;
  set(data: Record<string, Record<string, unknown | null>>): Promise<void>;
};
type LidMappingEvent = Partial<LidPnMapping> & { mappings?: LidPnMapping[] };
type WhatsAppWebVersion = [number, number, number];
type WhatsAppVersionInfo = {
  version: WhatsAppWebVersion;
  source: "configured" | "wa-web" | "baileys-default";
  isLatest: boolean;
  cached?: boolean;
  fallbackReason?: string;
};

const sockets = new Map<string, WASocket>();
const intentionallyStoppedSockets = new WeakSet<WASocket>();
const sessionModes = new Map<string, SessionMode>();
const sessionRestarts = new Map<string, Promise<WASocket>>();
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const qrTransientRetries = new Map<string, number>();
const pairingTransientRetries = new Map<string, number>();
const pairingRegisteredReconnects = new Map<string, number>();
const pairingRegisteredOpenWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();
const pairingRetryScheduledAt = new Map<string, number>();
const pairingSocketRepairFlights = new Map<string, Promise<void>>();
const qrRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const sessionGenerations = new Map<string, number>();
const qrRequestCorrelationIds = new Map<string, string>();
const pairingRequestFlights = new Map<string, Promise<{ code: string; expiresAt: Date }>>();
const authMutationTails = new Map<string, Promise<void>>();
const WHATSAPP_WEB_VERSION_CACHE_TTL_MS = Number(process.env.WHATSAPP_WEB_VERSION_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
let whatsAppVersionCache: { info: WhatsAppVersionInfo; expiresAt: number } | undefined;
let whatsAppVersionFlight: Promise<WhatsAppVersionInfo> | undefined;
const contactSnapshots = new Map<string, Map<string, ProviderContactRecord>>();
const contactPhoneJidsByLid = new Map<string, Map<string, string>>();
const contactPersistenceTails = new Map<string, Promise<void>>();
const contactMappingPersistenceTails = new Map<string, Promise<void>>();
const contactMappingBackupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SOCKET_INITIALIZATION_TIMEOUT_MS = Number(process.env.WHATSAPP_SOCKET_INITIALIZATION_TIMEOUT_MS || 30_000);
const SOCKET_CONNECT_TIMEOUT_MS = Number(process.env.WHATSAPP_CONNECT_TIMEOUT_MS || 60_000);
const SOCKET_QUERY_TIMEOUT_MS = Number(process.env.WHATSAPP_QUERY_TIMEOUT_MS || 120_000);
const PAIRING_SOCKET_BOOTSTRAP_MS = Number(process.env.WHATSAPP_PAIRING_SOCKET_BOOTSTRAP_MS || 5_000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.WHATSAPP_HEARTBEAT_INTERVAL_MS || 30_000);
const QR_TRANSIENT_RETRY_LIMIT = Number(process.env.WHATSAPP_QR_TRANSIENT_RETRY_LIMIT || 3);
const PAIRING_TRANSIENT_RETRY_LIMIT = Number(process.env.WHATSAPP_PAIRING_TRANSIENT_RETRY_LIMIT || 5);
const PAIRING_REGISTERED_RECONNECT_LIMIT = Number(process.env.WHATSAPP_PAIRING_REGISTERED_RECONNECT_LIMIT || 3);
const PAIRING_REGISTERED_OPEN_GRACE_MS = Number(process.env.WHATSAPP_PAIRING_REGISTERED_OPEN_GRACE_MS || 8_000);
const PAIRING_CODE_TTL_MS = Number(process.env.WHATSAPP_PAIRING_CODE_TTL_MS || 5 * 60_000);
const PAIRING_CODE_REFRESH_MIN_TTL_MS = Number(process.env.WHATSAPP_PAIRING_CODE_MIN_TTL_MS || 120_000);
const PHONE_PAIRING_QR_REF_TIMEOUT_MS = Number(process.env.WHATSAPP_PHONE_PAIRING_QR_REF_TIMEOUT_MS || 60_000);
const CONTACT_BOOTSTRAP_ACTIVE_DELIVERY_WINDOW_MS = Number(process.env.WHATSAPP_CONTACT_BOOTSTRAP_ACTIVE_DELIVERY_WINDOW_MS || 5 * 60_000);
const CONTACT_HISTORY_FALLBACK_MIN_NAMED = Number(process.env.WHATSAPP_CONTACT_HISTORY_FALLBACK_MIN_NAMED || 25);
const CONTACT_EVENT_BUFFER_WAIT_MS = Number(process.env.WHATSAPP_CONTACT_EVENT_BUFFER_WAIT_MS || 25_000);
const CONTACT_OPEN_SYNC_STALE_MS = Number(process.env.WHATSAPP_CONTACT_OPEN_SYNC_STALE_MS || 6 * 60 * 60_000);
const GROUP_OPEN_SYNC_STALE_MS = Number(process.env.WHATSAPP_GROUP_OPEN_SYNC_STALE_MS || 30 * 60_000);
const OPEN_SYNC_JOB_DEDUP_WINDOW_MS = Number(process.env.WHATSAPP_OPEN_SYNC_JOB_DEDUP_WINDOW_MS || 15 * 60_000);
const MESSAGE_RETRY_LIMIT = (() => {
  const configured = Number(process.env.WHATSAPP_MESSAGE_RETRY_LIMIT || 1);
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 1;
})();
const GROUP_SYNC_WRITE_CONCURRENCY = (() => {
  const configured = Number(process.env.WHATSAPP_GROUP_SYNC_WRITE_CONCURRENCY || 10);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 10;
})();
const WHATSAPP_STATUS_BROADCAST_JID = "status@broadcast";
const shouldIgnoreWhatsAppJid = (jid: string) => jid === WHATSAPP_STATUS_BROADCAST_JID;
const CONTACT_APP_STATE_COLLECTIONS = ["critical_unblock_low", "regular"] as const;
const CONTACT_SYNC_IMPLEMENTATION = "CONTACT_DIRECTORY_V15_NON_DESTRUCTIVE_RECONCILIATION";
const PAIRING_CODE_REISSUE_RETRY_MS = Number(process.env.WHATSAPP_PAIRING_CODE_REISSUE_RETRY_MS || process.env.WHATSAPP_PAIRING_PRESERVED_CODE_RETRY_MS || 10_000);
const PAIRING_RETRY_SCHEDULED_ERROR = "WHATSAPP_PAIRING_RETRY_SCHEDULED";
const PAIRING_CODE_SOCKET_CLOSED_ERROR = "WHATSAPP_PAIRING_CODE_SOCKET_CLOSED_RETRY_REQUIRED";
const SESSION_SUPERSEDED_ERROR = "WHATSAPP_SESSION_SUPERSEDED";
const OUTBOUND_MEDIA_ACK_WAIT_MS = Number(process.env.WHATSAPP_MEDIA_ACK_WAIT_MS || 5_000);
const OUTBOUND_ACK_CACHE_TTL_MS = 10 * 60_000;
type ObservedOutboundAcknowledgement = SendResult["acknowledgement"] | "ERROR";
type OutboundAcknowledgementRecord = { acknowledgement: ObservedOutboundAcknowledgement; observedAt: number };
const outboundAcknowledgements = new Map<string, OutboundAcknowledgementRecord>();
const outboundAcknowledgementWaiters = new Map<string, Set<(record: OutboundAcknowledgementRecord) => void>>();
const PAIRING_PROVIDER_REJECTED_ERROR = "WHATSAPP_PAIRING_PROVIDER_REJECTED";
const MISSING_CREDENTIALS_GRACE_ATTEMPTS = Number(process.env.WHATSAPP_MISSING_CREDENTIALS_GRACE_ATTEMPTS || 6);
const RECONNECT_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 120_000] as const;
const WHATSAPP_PAIRING_COUNTRY_CODE = (process.env.WHATSAPP_PAIRING_COUNTRY_CODE || process.env.WHATSAPP_COUNTRY_CODE || "TR").toUpperCase();
const WHATSAPP_PAIRING_BROWSER_NAME = process.env.WHATSAPP_PAIRING_BROWSER_NAME || "Chrome";
const WHATSAPP_PAIRING_BROWSER_OS = (process.env.WHATSAPP_PAIRING_BROWSER_OS || "ubuntu").toLowerCase();

function outboundAcknowledgementKey(accountId: string, messageId: string) {
  return `${accountId}:${messageId}`;
}

function acknowledgementRank(value: ObservedOutboundAcknowledgement) {
  if (value === "ERROR") return 5;
  if (value === "READ") return 4;
  if (value === "DELIVERED") return 3;
  if (value === "SERVER_ACK") return 2;
  return 1;
}

async function persistOutboundDeliveryAcknowledgement(accountId: string, messageId: string, source: string) {
  const recipients = await prisma.messageRecipient.findMany({
    where: {
      accountId,
      externalMessageId: messageId,
      status: { in: ["SENDING", "SENT", "DELIVERED"] },
    },
    select: { id: true, campaignId: true, status: true },
  });
  const pending = recipients.filter((recipient) => recipient.status !== "DELIVERED");
  if (!pending.length) return;
  await prisma.messageRecipient.updateMany({
    where: { id: { in: pending.map((recipient) => recipient.id) } },
    data: { status: "DELIVERED" },
  });
  for (const campaignId of new Set(pending.map((recipient) => recipient.campaignId))) {
    await updateMessageCampaignDeliveryAggregate(campaignId, { workerId: "whatsapp-receipt" });
  }
  logger.info("message.baileys.delivery_ack.persisted", {
    accountId,
    externalMessageId: messageId,
    source,
    recipientCount: pending.length,
  });
}

function scheduleOutboundDeliveryPersistence(accountId: string, messageId: string, source: string) {
  for (const delayMs of [0, 2_000, 10_000]) {
    const timer = setTimeout(() => {
      void persistOutboundDeliveryAcknowledgement(accountId, messageId, source).catch((error) =>
        logger.error("message.baileys.delivery_ack.persist_failed", error, {
          accountId,
          externalMessageId: messageId,
          source,
          delayMs,
        }),
      );
    }, delayMs);
    timer.unref?.();
  }
}

function recordOutboundAcknowledgement(
  accountId: string,
  messageId: string,
  acknowledgement: ObservedOutboundAcknowledgement,
  source: string,
) {
  const cacheKey = outboundAcknowledgementKey(accountId, messageId);
  const current = outboundAcknowledgements.get(cacheKey);
  if (current && acknowledgementRank(current.acknowledgement) >= acknowledgementRank(acknowledgement)) return;
  const record = { acknowledgement, observedAt: Date.now() };
  outboundAcknowledgements.set(cacheKey, record);
  for (const waiter of outboundAcknowledgementWaiters.get(cacheKey) ?? []) waiter(record);
  outboundAcknowledgementWaiters.delete(cacheKey);
  if (acknowledgement === "DELIVERED" || acknowledgement === "READ") {
    scheduleOutboundDeliveryPersistence(accountId, messageId, source);
  }
  if (outboundAcknowledgements.size > 2_000) {
    const expiresBefore = Date.now() - OUTBOUND_ACK_CACHE_TTL_MS;
    for (const [key, candidate] of outboundAcknowledgements) {
      if (candidate.observedAt < expiresBefore) outboundAcknowledgements.delete(key);
    }
  }
}

function acknowledgementFromBaileysStatus(status: number | null | undefined): ObservedOutboundAcknowledgement | null {
  if (status === WAMessageStatus.ERROR) return "ERROR";
  if (status === WAMessageStatus.PLAYED || status === WAMessageStatus.READ) return "READ";
  if (status === WAMessageStatus.DELIVERY_ACK) return "DELIVERED";
  if (status === WAMessageStatus.SERVER_ACK) return "SERVER_ACK";
  return null;
}

function waitForOutboundAcknowledgement(accountId: string, messageId: string, timeoutMs: number) {
  const cacheKey = outboundAcknowledgementKey(accountId, messageId);
  const cached = outboundAcknowledgements.get(cacheKey);
  if (cached) return Promise.resolve(cached.acknowledgement);
  return new Promise<ObservedOutboundAcknowledgement>((resolve) => {
    const waiters = outboundAcknowledgementWaiters.get(cacheKey) ?? new Set();
    const waiter = (record: OutboundAcknowledgementRecord) => {
      clearTimeout(timer);
      resolve(record.acknowledgement);
    };
    waiters.add(waiter);
    outboundAcknowledgementWaiters.set(cacheKey, waiters);
    const timer = setTimeout(() => {
      waiters.delete(waiter);
      if (!waiters.size) outboundAcknowledgementWaiters.delete(cacheKey);
      resolve(outboundAcknowledgements.get(cacheKey)?.acknowledgement ?? "PENDING");
    }, timeoutMs);
    timer.unref?.();
  });
}

function whatsappInboundContent(message: WAMessage) {
  const root = message.message as unknown as Record<string, unknown> | null | undefined;
  if (!root) return null;
  const nestedMessage = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const nested = (value as Record<string, unknown>).message;
    return nested && typeof nested === "object" ? nested as Record<string, unknown> : null;
  };
  return nestedMessage(root.ephemeralMessage)
    ?? nestedMessage(root.viewOnceMessage)
    ?? nestedMessage(root.viewOnceMessageV2)
    ?? root;
}

function whatsappInboundText(message: WAMessage) {
  const content = whatsappInboundContent(message);
  if (!content) return "";
  if (typeof content.conversation === "string") return content.conversation;
  for (const key of ["extendedTextMessage", "imageMessage", "videoMessage", "documentMessage"] as const) {
    const value = content[key];
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.caption === "string") return record.caption;
  }
  return "";
}

function whatsappInboundDescriptor(message: WAMessage) {
  const content = whatsappInboundContent(message);
  const attachments: CapturedAttachment[] = [];
  if (!content) return { messageType: "UNKNOWN", attachments };
  const mediaTypes = [
    ["imageMessage", "IMAGE"],
    ["videoMessage", "VIDEO"],
    ["documentMessage", "DOCUMENT"],
  ] as const;
  for (const [key, kind] of mediaTypes) {
    const value = content[key];
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    attachments.push({
      providerAttachmentId: message.key.id,
      kind,
      mimeType: typeof record.mimetype === "string" ? record.mimetype : null,
      fileName: typeof record.fileName === "string" ? record.fileName : null,
      fileSize: numericMessageValue(record.fileLength),
      caption: typeof record.caption === "string" ? record.caption : null,
    });
    return { messageType: kind, attachments };
  }
  const location = content.locationMessage;
  if (location && typeof location === "object") {
    const record = location as Record<string, unknown>;
    attachments.push({
      providerAttachmentId: message.key.id,
      kind: "LOCATION",
      latitude: numericMessageValue(record.degreesLatitude),
      longitude: numericMessageValue(record.degreesLongitude),
    });
    return { messageType: "LOCATION", attachments };
  }
  return { messageType: typeof content.extendedTextMessage === "object" ? "EXTENDED_TEXT" : "TEXT", attachments };
}

function numericMessageValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber?: unknown }).toNumber === "function") {
    const parsed = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function whatsappMessageTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1_000);
  if (typeof value === "bigint") return new Date(Number(value) * 1_000);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber?: unknown }).toNumber === "function") {
    return new Date((value as { toNumber(): number }).toNumber() * 1_000);
  }
  return new Date();
}

function shouldCaptureWhatsAppUpsert(type: "append" | "notify", sourceTimestamp: Date) {
  if (type === "notify") return true;
  const configured = Number(process.env.WHATSAPP_INGESTION_APPEND_MAX_AGE_MS || 21_600_000);
  const maximumAgeMs = Number.isFinite(configured) ? Math.min(86_400_000, Math.max(60_000, configured)) : 21_600_000;
  const ageMs = Date.now() - sourceTimestamp.getTime();
  return ageMs >= -60_000 && ageMs <= maximumAgeMs;
}

function resolveWhatsAppBrowser() {
  if (WHATSAPP_PAIRING_BROWSER_OS === "macos") return Browsers.macOS(WHATSAPP_PAIRING_BROWSER_NAME);
  if (WHATSAPP_PAIRING_BROWSER_OS === "windows") return Browsers.windows(WHATSAPP_PAIRING_BROWSER_NAME);
  return Browsers.ubuntu(WHATSAPP_PAIRING_BROWSER_NAME);
}

const WHATSAPP_BROWSER = resolveWhatsAppBrowser();
const WHATSAPP_COMPANION_PLATFORM_ID = getPlatformId(WHATSAPP_BROWSER[1]);
const WHATSAPP_COMPANION_PLATFORM_DISPLAY = `${WHATSAPP_BROWSER[1]} (${WHATSAPP_BROWSER[0]})`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLidJid(value: string | null | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate?.endsWith("@lid")) return null;
  const user = candidate.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
  return user ? `${user}@lid` : null;
}

function normalizePhoneJid(value: string | null | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate?.endsWith("@s.whatsapp.net")) return null;
  const user = candidate.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
  return user ? `${user}@s.whatsapp.net` : null;
}

function normalizeLidPnMappings(mappings: LidPnMapping[]) {
  const byLid = new Map<string, LidPnMapping>();
  for (const mapping of mappings) {
    const lid = normalizeLidJid(mapping.lid);
    const pn = normalizePhoneJid(mapping.pn);
    if (lid && pn) byLid.set(lid, { lid, pn });
  }
  return [...byLid.values()];
}

function scheduleContactMappingBackup(accountId: string, source: string) {
  const current = contactMappingBackupTimers.get(accountId);
  if (current) clearTimeout(current);
  const timer = setTimeout(() => {
    contactMappingBackupTimers.delete(accountId);
    void backupWhatsAppSessionToDatabase(accountId, `contact.lid_mapping.${source}`).catch((error) =>
      logger.error("whatsapp.contacts.lid_mapping_backup_failed", error, { accountId, source }),
    );
  }, 5_000);
  contactMappingBackupTimers.set(accountId, timer);
}

async function persistedContactStats(accountId: string, userId: string) {
  const where = { accountId, userId, isActive: true } as const;
  const [total, named] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({
      where: {
        ...where,
        OR: [{ name: { not: null } }, { pushName: { not: null } }],
      },
    }),
  ]);
  return { total, named };
}

function queueContactPersistence(accountId: string, contacts: ProviderContactRecord[], source: string) {
  if (!contacts.length) return;
  const previous = contactPersistenceTails.get(accountId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await persistWhatsAppContacts(accountId, contacts, { source });
    })
    .catch((error) => {
      logger.error("whatsapp.contacts.persist_failed", error, { accountId, source, receivedCount: contacts.length });
    });
  contactPersistenceTails.set(accountId, next);
  void next.finally(() => {
    if (contactPersistenceTails.get(accountId) === next) contactPersistenceTails.delete(accountId);
  }).catch((error) => logger.error("whatsapp.contacts.persist_tail_cleanup_failed", error, { accountId, source }));
}

async function persistLidMappings(
  accountId: string,
  keys: RuntimeSignalKeyStore,
  rawMappings: LidPnMapping[],
  source: string,
) {
  const mappings = normalizeLidPnMappings(rawMappings);
  if (!mappings.length) return { stored: 0, resolved: 0 };

  const values: Record<string, string> = {};
  for (const { lid, pn } of mappings) {
    const lidUser = lid.split("@")[0];
    const pnUser = pn.split("@")[0];
    values[pnUser] = lidUser;
    values[`${lidUser}_reverse`] = pnUser;
  }
  await keys.set({ "lid-mapping": values });

  const phoneJidsByLid = contactPhoneJidsByLid.get(accountId) ?? new Map<string, string>();
  const snapshot = contactSnapshots.get(accountId);
  const resolvedContacts: BaileysContactRecord[] = [];
  for (const { lid, pn } of mappings) {
    phoneJidsByLid.set(lid, pn);
    const unresolved = snapshot?.get(lid);
    if (unresolved) {
      resolvedContacts.push({
        id: lid,
        lid,
        jid: pn,
        phoneNumber: pn,
        name: unresolved.name ?? undefined,
        notify: unresolved.notify ?? undefined,
        verifiedName: unresolved.verifiedName ?? undefined,
      });
    }
  }
  contactPhoneJidsByLid.set(accountId, phoneJidsByLid);
  if (resolvedContacts.length) rememberContacts(accountId, resolvedContacts, `${source}_RESOLVED`);
  scheduleContactMappingBackup(accountId, source);
  logger.info("whatsapp.contacts.lid_mappings_persisted", {
    accountId,
    source,
    mappingCount: mappings.length,
    resolvedSnapshotCount: resolvedContacts.length,
  });
  return { stored: mappings.length, resolved: resolvedContacts.length };
}

function queueLidMappingPersistence(
  accountId: string,
  keys: RuntimeSignalKeyStore,
  mappings: LidPnMapping[],
  source: string,
) {
  if (!mappings.length) return;
  const previous = contactMappingPersistenceTails.get(accountId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await persistLidMappings(accountId, keys, mappings, source);
    })
    .catch((error) => {
      logger.error("whatsapp.contacts.lid_mapping_persist_failed", error, { accountId, source, mappingCount: mappings.length });
    });
  contactMappingPersistenceTails.set(accountId, next);
  void next.finally(() => {
    if (contactMappingPersistenceTails.get(accountId) === next) contactMappingPersistenceTails.delete(accountId);
  }).catch((error) => logger.error("whatsapp.contacts.lid_mapping_tail_cleanup_failed", error, { accountId, source }));
}

async function hydrateLidMappingsFromSession(accountId: string, keys: RuntimeSignalKeyStore, source: string) {
  const snapshot = contactSnapshots.get(accountId);
  if (!snapshot?.size) return { stored: 0, resolved: 0 };
  const lids = [...snapshot.keys()].map(normalizeLidJid).filter((lid): lid is string => Boolean(lid));
  if (!lids.length) return { stored: 0, resolved: 0 };
  const reverseKeys = [...new Set(lids.map((lid) => `${lid.split("@")[0]}_reverse`))];
  const stored = await keys.get("lid-mapping", reverseKeys);
  const mappings: LidPnMapping[] = [];
  for (const lid of lids) {
    const pnUser = stored[`${lid.split("@")[0]}_reverse`];
    if (typeof pnUser === "string" && pnUser.replace(/\D/g, "")) {
      mappings.push({ lid, pn: `${pnUser.replace(/\D/g, "")}@s.whatsapp.net` });
    }
  }
  return persistLidMappings(accountId, keys, mappings, source);
}

async function flushContactPersistence(accountId: string) {
  while (true) {
    const pending = contactMappingPersistenceTails.get(accountId);
    if (!pending) break;
    await pending;
    if (contactMappingPersistenceTails.get(accountId) === pending) break;
  }
  while (true) {
    const pending = contactPersistenceTails.get(accountId);
    if (!pending) return;
    await pending;
    if (contactPersistenceTails.get(accountId) === pending) return;
  }
}

async function waitForBaileysEventBuffer(accountId: string, socket: WASocket) {
  const deadline = Date.now() + CONTACT_EVENT_BUFFER_WAIT_MS;
  while (socket.ev.isBuffering() && Date.now() < deadline) await sleep(250);
  if (!socket.ev.isBuffering()) return;

  const forcedFlush = socket.ev.flush();
  logger.warn("whatsapp.contacts.event_buffer_forced_flush", {
    whatsappAccountId: accountId,
    waitedMs: CONTACT_EVENT_BUFFER_WAIT_MS,
    flushed: forcedFlush,
  });
  await flushContactPersistence(accountId);
}

async function clearContactRuntimeState(accountId: string, source: string) {
  await flushContactPersistence(accountId);
  const backupTimer = contactMappingBackupTimers.get(accountId);
  if (backupTimer) clearTimeout(backupTimer);
  contactSnapshots.delete(accountId);
  contactPhoneJidsByLid.delete(accountId);
  contactPersistenceTails.delete(accountId);
  contactMappingPersistenceTails.delete(accountId);
  contactMappingBackupTimers.delete(accountId);
  logger.info("whatsapp.contacts.runtime_state_cleared", { accountId, source });
}

function rememberContacts(accountId: string, contacts: BaileysContactRecord[], source: string) {
  const snapshot = contactSnapshots.get(accountId) ?? new Map<string, ProviderContactRecord>();
  const phoneJidsByLid = contactPhoneJidsByLid.get(accountId) ?? new Map<string, string>();
  const changed: ProviderContactRecord[] = [];
  let namedCount = 0;
  let unresolvedLidCount = 0;
  for (const contact of contacts) {
    if (!contact.id) continue;
    const lid = contact.lid || (contact.id.endsWith("@lid") ? contact.id : undefined);
    const directPhoneJid = contact.phoneNumber || contact.jid || (contact.id.endsWith("@s.whatsapp.net") ? contact.id : undefined);
    if (lid && directPhoneJid?.endsWith("@s.whatsapp.net")) phoneJidsByLid.set(lid, directPhoneJid);
    const phoneJid = directPhoneJid?.endsWith("@s.whatsapp.net") ? directPhoneJid : lid ? phoneJidsByLid.get(lid) : undefined;
    const snapshotKey = phoneJid || contact.id;
    const previous = snapshot.get(snapshotKey) || snapshot.get(contact.id);
    const next = {
      id: snapshotKey,
      jid: phoneJid ?? previous?.jid,
      phoneNumber: phoneJid ?? previous?.phoneNumber,
      name: contact.name ?? previous?.name,
      notify: contact.notify ?? previous?.notify,
      verifiedName: contact.verifiedName ?? previous?.verifiedName,
    };
    if (snapshotKey !== contact.id) snapshot.delete(contact.id);
    snapshot.set(snapshotKey, next);
    if (next.name?.trim() || next.notify?.trim() || next.verifiedName?.trim()) namedCount += 1;
    if (phoneJid) changed.push(next);
    else if (lid) unresolvedLidCount += 1;
  }
  contactSnapshots.set(accountId, snapshot);
  contactPhoneJidsByLid.set(accountId, phoneJidsByLid);
  logger.info("whatsapp.contacts.provider_event", {
    accountId,
    source,
    receivedCount: contacts.length,
    phoneResolvedCount: changed.length,
    namedCount,
    unresolvedLidCount,
    snapshotCount: snapshot.size,
  });
  queueContactPersistence(accountId, changed, source);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function configuredWhatsAppWebVersion(): WhatsAppWebVersion | undefined {
  const configured = process.env.WHATSAPP_WEB_VERSION?.trim();
  if (!configured) return undefined;
  const parts = configured.split(/[,.]/).map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    throw new Error("WHATSAPP_WEB_VERSION_INVALID");
  }
  return parts as WhatsAppWebVersion;
}

async function resolveCurrentWhatsAppWebVersion(): Promise<WhatsAppVersionInfo> {
  const live = await fetchLatestWaWebVersion({}).catch((error: unknown) => ({
    version: undefined,
    isLatest: false,
    error,
  }));
  if (live.version) {
    return {
      version: live.version,
      source: "wa-web",
      isLatest: live.isLatest,
      fallbackReason: "error" in live && live.error ? errorMessage(live.error) : undefined,
    };
  }

  const configured = configuredWhatsAppWebVersion();
  if (configured) {
    return {
      version: configured,
      source: "configured",
      isLatest: false,
      fallbackReason: "error" in live && live.error ? errorMessage(live.error) : "wa_web_version_unavailable",
    };
  }

  const fallback = await fetchLatestBaileysVersion();
  return {
    version: fallback.version,
    source: "baileys-default",
    isLatest: fallback.isLatest,
    fallbackReason: "error" in live && live.error ? errorMessage(live.error) : "wa_web_version_unavailable",
  };
}

async function fetchCurrentWhatsAppWebVersion(options: { forceLive?: boolean } = {}): Promise<WhatsAppVersionInfo> {
  const configured = configuredWhatsAppWebVersion();
  if (configured && !options.forceLive) {
    return {
      version: configured,
      source: "configured",
      isLatest: false,
    };
  }

  const now = Date.now();
  const cachedVersionIsUsable = whatsAppVersionCache
    && whatsAppVersionCache.expiresAt > now
    && (!options.forceLive || whatsAppVersionCache.info.source === "wa-web");
  if (cachedVersionIsUsable && whatsAppVersionCache) {
    return { ...whatsAppVersionCache.info, cached: true };
  }
  if (whatsAppVersionFlight) return whatsAppVersionFlight;

  whatsAppVersionFlight = resolveCurrentWhatsAppWebVersion()
    .then((info) => {
      whatsAppVersionCache = {
        info,
        expiresAt: Date.now() + Math.max(60_000, WHATSAPP_WEB_VERSION_CACHE_TTL_MS),
      };
      return info;
    })
    .finally(() => {
      whatsAppVersionFlight = undefined;
    });
  return whatsAppVersionFlight;
}

function maskPhoneNumber(phoneNumber?: string | null) {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

function disconnectCode(error: unknown) {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

function isLoggedOutError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  const code = disconnectCode(error);
  return code === DisconnectReason.loggedOut
    || code === DisconnectReason.forbidden
    || message.includes("logged out")
    || message.includes("whatsapp_logged_out")
    || message.includes("forbidden");
}

function canReissueActivePairingCodeAfterClose(reason: string, code?: number) {
  const message = reason.toLowerCase();
  if (code === DisconnectReason.loggedOut || code === 401) return false;
  if (/connection failure|logged out|unauthorized|forbidden|auth|required|invalid|bad session/.test(message)) return false;
  if (code === DisconnectReason.connectionClosed || code === DisconnectReason.timedOut) return true;
  return /connection terminated by server|connection closed|timed out|socket closed before pairing code request|qr refs attempts ended/.test(message);
}

function isPairingProviderRejection(reason: unknown, code = disconnectCode(reason)) {
  const message = errorMessage(reason).toLowerCase();
  return code === 405 || code === 429 || /\b405\b|\b429\b|connection failure|rate-overlimit/.test(message);
}

function pairingFailureMessage(reason: unknown, code = disconnectCode(reason)) {
  return isPairingProviderRejection(reason, code) ? PAIRING_PROVIDER_REJECTED_ERROR : pairingUserMessage(reason);
}

function nextSessionGeneration(accountId: string) {
  const generation = (sessionGenerations.get(accountId) ?? 0) + 1;
  sessionGenerations.set(accountId, generation);
  return generation;
}

function isCurrentSession(accountId: string, socket: WASocket, generation: number) {
  return sessionGenerations.get(accountId) === generation && sockets.get(accountId) === socket;
}

function isCurrentGeneration(accountId: string, generation: number) {
  return sessionGenerations.get(accountId) === generation;
}

async function queueAuthMutation(accountId: string, mutation: () => Promise<void>) {
  const previous = authMutationTails.get(accountId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(mutation);
  authMutationTails.set(accountId, next);
  try {
    await next;
  } finally {
    if (authMutationTails.get(accountId) === next) authMutationTails.delete(accountId);
  }
}

async function auditAccount(accountId: string, action: string, metadata: Record<string, unknown> = {}, correlationId?: string) {
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { companyId: true } });
  if (!account) return;
  const auditCorrelationId = normalizeCorrelationId(correlationId, `worker-${randomUUID()}`);
  const auditMetadata = sanitizeLogMetadata(metadata) as Prisma.InputJsonValue;
  await prisma.auditLog.create({
    data: {
      companyId: account.companyId,
      actorType: "SERVICE",
      action: canonicalAuditAction(action),
      result: action.endsWith(".failed") ? "FAILURE" : "SUCCESS",
      entityType: "WhatsAppAccount",
      entityId: sanitizeLogText(accountId, 200),
      requestId: auditCorrelationId,
      correlationId: auditCorrelationId,
      clientPlatform: "worker",
      appVersion: sanitizeLogText(process.env.APP_VERSION || "unknown", 80),
      releaseVersion: process.env.LOG_RELEASE_VERSION || process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA,
      metadata: auditMetadata,
    },
  });
}

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private async waitForConnectedSocket(accountId: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const socket = sockets.get(accountId);
      if (socket?.user) return socket;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("WHATSAPP_SESSION_CONNECTION_TIMEOUT");
  }

  private stopHeartbeat(accountId: string) {
    const timer = heartbeatTimers.get(accountId);
    if (timer) clearInterval(timer);
    heartbeatTimers.delete(accountId);
  }

  private scheduleReconnect(accountId: string, reason: string) {
    if (reconnectTimers.has(accountId)) return;
    void prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { status: true, pairingCode: true, pairingCodeExpiresAt: true, updatedAt: true, reconnectRetryCount: true, archivedAt: true, lastError: true },
    }).then((account) => {
      if (!account || account.archivedAt || account.lastError === "WHATSAPP_LOGGED_OUT") return;
      if (hasActivePhonePairing(account)) {
        logger.warn("whatsapp.session.reconnect_skipped_active_pairing", { accountId, reason, status: account.status });
        return;
      }
      const attempt = Math.max(0, account.reconnectRetryCount);
      const baseDelay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
      const delay = baseDelay + Math.floor(Math.random() * Math.min(baseDelay, 5_000));
      logger.warn("whatsapp.session.reconnect_scheduled", { accountId, attempt: attempt + 1, delayMs: delay, reason });
      const timer = setTimeout(() => {
        reconnectTimers.delete(accountId);
        void isPhonePairingActive(accountId)
          .then((activePairing) => {
            if (activePairing) {
              logger.warn("whatsapp.session.auto_reconnect_skipped_active_pairing", { accountId, attempt: attempt + 1, reason });
              return null;
            }
            return prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "CONNECTING", reconnectRetryCount: { increment: 1 }, lastError: "WHATSAPP_TRANSIENT_DISCONNECT" },
            }).then(() => this.ensureConnectedSocket(accountId));
          })
          .catch((error) => {
            logger.error("whatsapp.session.auto_reconnect_failed", error, { accountId, attempt: attempt + 1 });
            this.scheduleReconnect(accountId, errorMessage(error));
          });
      }, delay);
      timer.unref?.();
      reconnectTimers.set(accountId, timer);
    }).catch((error) => logger.error("whatsapp.session.reconnect_schedule_failed", error, { accountId }));
  }

  private async markTransientConnectionLoss(accountId: string, reason: string, recoveryLevel = 2) {
    if (await isPhonePairingActive(accountId)) {
      logger.warn("whatsapp.connection.transient_loss_skipped_active_pairing", { accountId, reason, recoveryLevel });
      return;
    }
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null, OR: [{ lastError: null }, { lastError: { not: "WHATSAPP_LOGGED_OUT" } }] },
      data: {
        status: "CONNECTING",
        lastError: "WHATSAPP_TRANSIENT_DISCONNECT",
        recoveryLevel,
        healthScore: 65,
        qrCode: null,
        qrExpiresAt: null,
        pairingCode: null,
        pairingCodeExpiresAt: null,
      },
    });
    await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTING", qrCode: null, expiresAt: null } }).catch(() => undefined);
    logger.warn("whatsapp.connection.transient_loss", { accountId, reason, recoveryLevel });
  }

  private async markFreshPairingRequired(accountId: string, reason: string) {
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING", recoveryLevel: 5, healthScore: 0 },
    });
    logger.error("whatsapp.session.fresh_pairing_required", new Error(reason), { accountId, reason });
  }

  private shouldRetryMissingCredentials(account: { status: string; lastError: string | null; phoneNumber: string | null; lastConnectedAt: Date | null; sessionSnapshotAt: Date | null; recoveryLevel: number | null }) {
    if (account.lastError === "WHATSAPP_LOGGED_OUT") return false;
    const wasLinked = Boolean(
      account.phoneNumber ||
      account.lastConnectedAt ||
      account.sessionSnapshotAt ||
      ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"].includes(account.status),
    );
    return wasLinked && Math.max(0, account.recoveryLevel ?? 0) < MISSING_CREDENTIALS_GRACE_ATTEMPTS;
  }

  private async handleMissingCredentials(accountId: string, reason: string): Promise<never> {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { status: true, lastError: true, phoneNumber: true, lastConnectedAt: true, sessionSnapshotAt: true, recoveryLevel: true, archivedAt: true },
    });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (await isPhonePairingActive(accountId)) {
      logger.warn("whatsapp.session.missing_credentials_skipped_active_pairing", { accountId, reason, status: account.status });
      throw new Error("WHATSAPP_PAIRING_IN_PROGRESS");
    }

    if (this.shouldRetryMissingCredentials(account)) {
      const recoveryLevel = Math.min(MISSING_CREDENTIALS_GRACE_ATTEMPTS, Math.max(0, account.recoveryLevel ?? 0) + 1);
      await this.markTransientConnectionLoss(accountId, reason, recoveryLevel);
      this.scheduleReconnect(accountId, reason);
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }

    await this.markFreshPairingRequired(accountId, reason);
    throw new Error("WHATSAPP_CREDENTIALS_MISSING");
  }

  private async keepAliveSocket(accountId: string, socket: WASocket) {
    // Baileys owns the protocol keepalive. Sending "available" here suppresses
    // notifications on the primary phone by making this companion look active.
    return sockets.get(accountId) === socket && Boolean(socket.user) && socket.ws.isOpen;
  }

  private startHeartbeat(accountId: string, socket: WASocket) {
    this.stopHeartbeat(accountId);
    const beat = async () => {
      const now = new Date();
      const healthy = await this.keepAliveSocket(accountId, socket);
      const groupCount = await prisma.whatsAppGroup.count({ where: { accountId, isArchived: false } }).catch(() => 0);
      const healthScore = computeWhatsAppHealthScore({
        status: healthy ? "CONNECTED" : "DISCONNECTED",
        lastHeartbeatAt: now,
        lastPongAt: healthy ? now : null,
        groupCount,
        hasSessionSnapshot: true,
      });
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: {
          lastHeartbeatAt: now,
          lastPingAt: now,
          lastPongAt: healthy ? now : undefined,
          healthScore,
          ...(healthy ? { status: "CONNECTED" as const, lastError: null, reconnectRetryCount: 0, recoveryLevel: 0 } : { recoveryLevel: 1 }),
        },
      });
      await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { lastHeartbeatAt: now } });
      if (!healthy) {
        logger.warn("whatsapp.heartbeat_fail", { accountId });
        this.stopHeartbeat(accountId);
        await this.markTransientConnectionLoss(accountId, "heartbeat_fail", 1);
        this.scheduleReconnect(accountId, "heartbeat_fail");
      }
    };
    void beat().catch((error) => logger.error("whatsapp.heartbeat.failed", error, { accountId }));
    const timer = setInterval(() => void beat().catch((error) => logger.error("whatsapp.heartbeat.failed", error, { accountId })), HEARTBEAT_INTERVAL_MS);
    timer.unref?.();
    heartbeatTimers.set(accountId, timer);
  }

  private async ensureConnectedSocket(accountId: string) {
    const activeSocket = sockets.get(accountId);
    if (activeSocket?.user) return activeSocket;
    if (await isPhonePairingActive(accountId)) throw new Error("WHATSAPP_PAIRING_IN_PROGRESS");

    const existingRestart = sessionRestarts.get(accountId);
    if (existingRestart) return existingRestart;

    const restart = (async () => {
      const account = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { id: true, archivedAt: true, status: true, lastError: true, phoneNumber: true, lastConnectedAt: true, sessionSnapshotAt: true, recoveryLevel: true },
      });
      if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");

      if (!(await hasRestorableWhatsAppCredentials(accountId))) {
        await this.handleMissingCredentials(accountId, "ensure_connected_socket_missing_credentials");
      }
      await restoreWhatsAppSessionFromDatabase(accountId);

      logger.info("SESSION_RESTORED", { accountId, level: 3 });
      logger.info("whatsapp.session.recovery_started", { accountId });
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null, status: { in: ["DISCONNECTED", "RECONNECT_REQUIRED", "FAILED", "ERROR"] } },
        data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 },
      });
      const existingSocket = sockets.get(accountId);
      if (existingSocket && !existingSocket.user) {
        await this.stopSocket(accountId, "Replace stale WhatsApp socket");
      }
      if (!sockets.has(accountId)) {
        const { initialized } = await this.startSession(accountId, "RECONNECT");
        await initialized;
      }
      const socket = await this.waitForConnectedSocket(accountId);
      logger.info("SESSION_RECONNECTED", { accountId });
      logger.info("whatsapp.session.recovery_completed", { accountId });
      return socket;
    })().finally(() => sessionRestarts.delete(accountId));

    sessionRestarts.set(accountId, restart);
    return restart;
  }

  private async stopSocket(accountId: string, reason: string) {
    nextSessionGeneration(accountId);
    this.stopHeartbeat(accountId);
    this.cancelRegisteredPairingOpenWatchdog(accountId);
    const reconnectTimer = reconnectTimers.get(accountId);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimers.delete(accountId);
    const socket = sockets.get(accountId);
    if (socket) {
      intentionallyStoppedSockets.add(socket);
      socket.end(new Error(reason));
      sockets.delete(accountId);
    }
    sessionModes.delete(accountId);
  }

  private cancelRegisteredPairingOpenWatchdog(accountId: string) {
    const timer = pairingRegisteredOpenWatchdogs.get(accountId);
    if (timer) clearTimeout(timer);
    pairingRegisteredOpenWatchdogs.delete(accountId);
  }

  private scheduleRegisteredPairingOpenWatchdog(
    accountId: string,
    socket: WASocket,
    generation: number,
    isConnectionOpen: () => boolean,
  ) {
    if (pairingRegisteredOpenWatchdogs.has(accountId)) return;

    logger.info("WA_PAIRING_REGISTERED_OPEN_WATCHDOG_SCHEDULED", {
      accountId,
      generation,
      graceMs: PAIRING_REGISTERED_OPEN_GRACE_MS,
    });
    const timer = setTimeout(() => {
      pairingRegisteredOpenWatchdogs.delete(accountId);
      void (async () => {
        if (isConnectionOpen() || !isCurrentSession(accountId, socket, generation)) return;

        logger.warn("WA_PAIRING_REGISTERED_OPEN_WATCHDOG_TRIGGERED", {
          accountId,
          generation,
          graceMs: PAIRING_REGISTERED_OPEN_GRACE_MS,
        });
        const snapshotSaved = await backupWhatsAppSessionToDatabase(
          accountId,
          "connection.open.pairing.registered_watchdog",
        ).catch((error) => {
          logger.error("WA_PAIRING_REGISTERED_OPEN_WATCHDOG_BACKUP_FAILED", error, { accountId, generation });
          return false;
        });
        if (!snapshotSaved || !isCurrentSession(accountId, socket, generation)) {
          logger.error(
            "WA_PAIRING_REGISTERED_OPEN_WATCHDOG_ABORTED",
            new Error(snapshotSaved ? SESSION_SUPERSEDED_ERROR : "REGISTERED_SESSION_SNAPSHOT_NOT_SAVED"),
            { accountId, generation },
          );
          return;
        }

        await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: {
            status: "CONNECTING",
            pairingCode: null,
            pairingCodeExpiresAt: null,
            lastError: "WHATSAPP_TRANSIENT_DISCONNECT",
            recoveryLevel: 1,
            healthScore: 65,
          },
        });
        await auditAccount(accountId, "whatsapp.pairing.registered_open_watchdog", {
          generation,
          graceMs: PAIRING_REGISTERED_OPEN_GRACE_MS,
        }).catch((error) =>
          logger.warn("whatsapp.pairing.registered_open_watchdog_audit_failed", { accountId, reason: errorMessage(error) }),
        );
        if (!isCurrentSession(accountId, socket, generation)) return;

        await this.stopSocket(accountId, "Restart registered WhatsApp phone pairing socket");
        const { initialized: reconnectInitialized } = await this.startSession(accountId, "RECONNECT");
        void reconnectInitialized.catch((error) =>
          logger.error("WA_PAIRING_REGISTERED_OPEN_WATCHDOG_RECONNECT_FAILED", error, { accountId, generation }),
        );
      })().catch((error) =>
        logger.error("WA_PAIRING_REGISTERED_OPEN_WATCHDOG_FAILED", error, { accountId, generation }),
      );
    }, PAIRING_REGISTERED_OPEN_GRACE_MS);
    timer.unref?.();
    pairingRegisteredOpenWatchdogs.set(accountId, timer);
  }

  private async clearTemporaryAuth(accountId: string) {
    await this.stopSocket(accountId, "Fresh pairing session reset");
    await queueAuthMutation(accountId, async () => {
      await clearWhatsAppSession(accountId);
    });
  }

  private async hasActivePairingCode(accountId: string) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { status: true, phoneNumber: true, pairingCode: true, pairingCodeExpiresAt: true, lastError: true },
    });

    return account ? canExposePhonePairingCode(account) : false;
  }

  private cancelQrRetry(accountId: string) {
    const timer = qrRetryTimers.get(accountId);
    if (timer) clearTimeout(timer);
    qrRetryTimers.delete(accountId);
  }

  private async markQrPairingFailed(accountId: string, reason: string, code?: number) {
    this.cancelQrRetry(accountId);
    qrTransientRetries.delete(accountId);
    await this.clearTemporaryAuth(accountId);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: "FAILED", qrCode: null, qrExpiresAt: null, lastError: "WHATSAPP_QR_FAILED", recoveryLevel: 4, healthScore: 0 },
    });
    await prisma.whatsAppSession.updateMany({
      where: { accountId },
      data: { status: "FAILED", qrCode: null, expiresAt: null },
    }).catch(() => undefined);
    await auditAccount(accountId, "whatsapp.qr.failed", { code, reason });
  }

  private async scheduleFreshQrRetry(accountId: string, reason: string, code?: number) {
    if (code === DisconnectReason.loggedOut || code === 401 || isLoggedOutError(reason)) return false;
    if (qrRetryTimers.has(accountId)) {
      logger.warn("whatsapp.qr.retry_already_scheduled", { accountId, code, reason });
      return true;
    }

    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true },
    });
    if (!account || account.archivedAt) return false;

    const nextAttempt = (qrTransientRetries.get(accountId) ?? 0) + 1;
    if (nextAttempt > QR_TRANSIENT_RETRY_LIMIT) return false;
    qrTransientRetries.set(accountId, nextAttempt);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: "PENDING_QR", qrCode: null, qrExpiresAt: null, lastError: null, recoveryLevel: Math.max(1, nextAttempt), healthScore: 25 },
    });
    await prisma.whatsAppSession.updateMany({
      where: { accountId },
      data: { status: "PENDING_QR", qrCode: null, expiresAt: null },
    }).catch(() => undefined);

    const delay = Math.min(1_000 * nextAttempt, 5_000);
    logger.warn("whatsapp.qr.fresh_socket_retry_scheduled", {
      accountId,
      code,
      attempt: nextAttempt,
      maxAttempts: QR_TRANSIENT_RETRY_LIMIT,
      delayMs: delay,
      reason,
    });
    await auditAccount(accountId, "whatsapp.qr.retry_scheduled", { code, attempt: nextAttempt, reason, delayMs: delay }).catch((error) =>
      logger.warn("whatsapp.qr.retry_audit_failed", { accountId, reason: errorMessage(error) }),
    );

    const timer = setTimeout(() => {
      qrRetryTimers.delete(accountId);
      void (async () => {
        await this.clearTemporaryAuth(accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: { status: "PENDING_QR", qrCode: null, qrExpiresAt: null, lastError: null, recoveryLevel: Math.max(1, nextAttempt), healthScore: 25 },
        });
        const { initialized } = await this.startSession(accountId, "PAIR_QR");
        await initialized;
      })().catch(async (error) => {
        logger.error("whatsapp.qr.fresh_socket_retry_failed", error, { accountId, attempt: nextAttempt });
        const retryScheduled = await this.scheduleFreshQrRetry(accountId, errorMessage(error)).catch(() => false);
        if (!retryScheduled) await this.markQrPairingFailed(accountId, errorMessage(error)).catch((failure) =>
          logger.error("whatsapp.qr.failure_state_update_failed", failure, { accountId }),
        );
      });
    }, delay);
    timer.unref?.();
    qrRetryTimers.set(accountId, timer);
    return true;
  }

  private async scheduleQrPostScanRestart(accountId: string, generation: number, reason: string, code?: number) {
    if (qrRetryTimers.has(accountId)) {
      logger.warn("whatsapp.qr.post_scan_restart_already_scheduled", { accountId, code, reason });
      return true;
    }

    // Baileys emits restartRequired after a QR has been accepted. Persist every
    // pending credential mutation before replacing the socket; clearing auth here
    // would discard the companion identity that the phone has just approved.
    await authMutationTails.get(accountId)?.catch((error) =>
      logger.warn("whatsapp.qr.post_scan_creds_flush_failed", { accountId, reason: errorMessage(error) }),
    );
    await backupWhatsAppSessionToDatabase(accountId, "qr.pairing.post_scan_restart").catch((error) =>
      logger.warn("whatsapp.qr.post_scan_backup_failed", { accountId, reason: errorMessage(error) }),
    );

    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "CONNECTING",
        qrCode: null,
        qrExpiresAt: null,
        lastError: null,
        recoveryLevel: 1,
        healthScore: 65,
      },
    });
    await prisma.whatsAppSession.updateMany({
      where: { accountId },
      data: { status: "CONNECTING", qrCode: null, expiresAt: null },
    }).catch(() => undefined);
    await auditAccount(accountId, "whatsapp.qr.post_scan_restart", { code, reason }).catch((error) =>
      logger.warn("whatsapp.qr.post_scan_restart_audit_failed", { accountId, reason: errorMessage(error) }),
    );

    logger.warn("WA_QR_PAIRING_POST_SCAN_RESTART_SCHEDULED", {
      accountId,
      code,
      generation,
      reason,
    });
    const timer = setTimeout(() => {
      qrRetryTimers.delete(accountId);
      if (!isCurrentGeneration(accountId, generation)) return;
      logger.info("WA_QR_PAIRING_POST_SCAN_RESTART_STARTED", { accountId, code, generation });
      void this.startSession(accountId, "PAIR_QR")
        .then(({ initialized: nextInitialized }) => nextInitialized)
        .catch((error) => logger.error("whatsapp.qr.post_scan_restart_failed", error, { accountId, code, generation }));
    }, 1_000);
    timer.unref?.();
    qrRetryTimers.set(accountId, timer);
    return true;
  }

  private async reissuePairingCodeOnFreshSocket(accountId: string, phoneNumber: string, pairingCode: string, expiresAt: Date, attempt: number) {
    const existingFlight = pairingSocketRepairFlights.get(accountId);
    if (existingFlight) return existingFlight;

    const repair: Promise<void> = (async () => {
      const normalizedPhoneNumber = normalizeWhatsAppPhoneNumber(phoneNumber);
      const canonicalPhoneNumber = `+${normalizedPhoneNumber}`;
      const account = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { archivedAt: true, phoneNumber: true, pairingCode: true, pairingCodeExpiresAt: true },
      });
      if (
        !account
        || account.archivedAt
        || account.phoneNumber !== canonicalPhoneNumber
        || account.pairingCode !== pairingCode
        || !account.pairingCodeExpiresAt
        || account.pairingCodeExpiresAt <= new Date()
      ) {
        throw new Error("WHATSAPP_PAIRING_CODE_NO_LONGER_ACTIVE");
      }

      await this.clearTemporaryAuth(accountId);
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: {
          status: "PAIRING_CODE_READY",
          phoneNumber: canonicalPhoneNumber,
          pairingCode,
          pairingCodeExpiresAt: expiresAt,
          qrCode: null,
          qrExpiresAt: null,
          lastError: null,
          recoveryLevel: Math.min(Math.max(1, attempt), 5),
          healthScore: 40,
        },
      });

      const session = await this.startSession(accountId, "PAIR_PHONE");
      if (session.registered) return;
      const readiness = session.initialized
        .then(() => true)
        .catch((error) => {
          logger.warn("whatsapp.pairing.same_code_reissue_initialization_deferred_failed", {
            accountId,
            attempt,
            reason: errorMessage(error),
          });
          return false;
        });
      const ready = await Promise.race([readiness, sleep(PAIRING_SOCKET_BOOTSTRAP_MS).then(() => false)]);
      if (!ready) logger.warn("whatsapp.pairing.same_code_reissue_bootstrap_wait_timeout", { accountId, attempt });
      const activeSocket = sockets.get(accountId) ?? session.socket;
      if (sessionModes.get(accountId) !== "PAIR_PHONE" || !activeSocket.ws.isOpen) {
        throw new Error("WHATSAPP_PAIRING_REPLACEMENT_SOCKET_NOT_LIVE");
      }
      await activeSocket.requestPairingCode(normalizedPhoneNumber, pairingCode);
      const updated = await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: {
          status: "PAIRING_CODE_READY",
          phoneNumber: canonicalPhoneNumber,
          pairingCode,
          pairingCodeExpiresAt: expiresAt,
          lastError: null,
          healthScore: 40,
        },
      });
      if (!updated.count) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
      const metadata = {
        accountId,
        attempt,
        expiresAt: expiresAt.toISOString(),
        browser: WHATSAPP_BROWSER,
        countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
        companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
        companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
      };
      logger.warn("whatsapp.pairing.same_code_reissued_on_live_socket", metadata);
      await auditAccount(accountId, "whatsapp.pairing.code_reissued", metadata).catch((error) =>
        logger.warn("whatsapp.pairing.code_reissue_audit_failed", { accountId, reason: errorMessage(error) }),
      );
    })().finally(() => {
      if (pairingSocketRepairFlights.get(accountId) === repair) pairingSocketRepairFlights.delete(accountId);
    });
    pairingSocketRepairFlights.set(accountId, repair);
    return repair;
  }

  private async reissuePairingCodeAfterSocketClose(accountId: string, reason: string, code?: number) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, phoneNumber: true, pairingCode: true, pairingCodeExpiresAt: true },
    });
    if (!account || account.archivedAt || !account.phoneNumber || !account.pairingCode || !account.pairingCodeExpiresAt || account.pairingCodeExpiresAt <= new Date()) return false;
    if (!canReissueActivePairingCodeAfterClose(reason, code)) return false;
    if (this.hasRecentPairingRetryScheduled(accountId) || pairingSocketRepairFlights.has(accountId)) return true;

    const nextAttempt = (pairingTransientRetries.get(accountId) ?? 0) + 1;
    pairingTransientRetries.set(accountId, nextAttempt);
    const shouldReissue = nextAttempt <= PAIRING_TRANSIENT_RETRY_LIMIT;

    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: shouldReissue ? "PAIRING_CODE_READY" : "FAILED",
        pairingCode: shouldReissue ? account.pairingCode : null,
        pairingCodeExpiresAt: shouldReissue ? account.pairingCodeExpiresAt : null,
        lastError: shouldReissue ? null : pairingFailureMessage(reason, code),
        recoveryLevel: Math.min(nextAttempt, 5),
        healthScore: shouldReissue ? 35 : 0,
      },
    });
    const metadata = {
      accountId,
      code,
      reason,
      attempt: nextAttempt,
      reissue: shouldReissue,
      expiresAt: account.pairingCodeExpiresAt.toISOString(),
    };
    logger.warn("whatsapp.pairing.same_code_reissue_scheduled", metadata);
    await auditAccount(accountId, "whatsapp.pairing.code_reissue_scheduled", metadata).catch((error) =>
      logger.warn("whatsapp.pairing.code_reissue_schedule_audit_failed", { accountId, reason: errorMessage(error) }),
    );

    if (!shouldReissue) return true;
    const phoneNumber = account.phoneNumber;
    const pairingCode = account.pairingCode;
    const expiresAt = account.pairingCodeExpiresAt;
    const delay = Math.min(1_000 * nextAttempt, PAIRING_CODE_REISSUE_RETRY_MS, 5_000);
    pairingRetryScheduledAt.set(accountId, Date.now());
    const timer = setTimeout(() => {
      pairingRetryScheduledAt.delete(accountId);
      void this.reissuePairingCodeOnFreshSocket(accountId, phoneNumber, pairingCode, expiresAt, nextAttempt).catch(async (error) => {
        logger.error("whatsapp.pairing.same_code_reissue_failed", error, { accountId, attempt: nextAttempt });
        const retryScheduled = await this.schedulePairingCodeRequestRetry(accountId, phoneNumber, errorMessage(error)).catch(() => false);
        if (!retryScheduled) {
          await prisma.whatsAppAccount.updateMany({
            where: { id: accountId, archivedAt: null },
            data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: pairingFailureMessage(error) },
          });
        }
      });
    }, delay);
    timer.unref?.();
    return true;
  }

  private async invalidatePairingCodeAfterSocketClose(accountId: string, reason: string, code?: number) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, pairingCode: true, pairingCodeExpiresAt: true },
    });
    if (!account || account.archivedAt || !account.pairingCode) return false;

    pairingRetryScheduledAt.delete(accountId);
    pairingTransientRetries.delete(accountId);
    await queueAuthMutation(accountId, async () => {
      await clearWhatsAppSession(accountId);
    });
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "FAILED",
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: PAIRING_CODE_SOCKET_CLOSED_ERROR,
        recoveryLevel: 4,
        healthScore: 0,
      },
    });
    const metadata = {
      accountId,
      code,
      reason,
      expiredAtClose: Boolean(account.pairingCodeExpiresAt && account.pairingCodeExpiresAt <= new Date()),
    };
    logger.warn("WA_PAIRING_VISIBLE_CODE_INVALIDATED", metadata);
    await auditAccount(accountId, "whatsapp.pairing.visible_code_invalidated", metadata).catch((error) =>
      logger.warn("whatsapp.pairing.visible_code_invalidation_audit_failed", { accountId, reason: errorMessage(error) }),
    );
    return true;
  }

  private hasRecentPairingRetryScheduled(accountId: string) {
    const scheduledAt = pairingRetryScheduledAt.get(accountId);
    return Boolean(scheduledAt && Date.now() - scheduledAt < Math.max(PAIRING_CODE_REISSUE_RETRY_MS, 5_000));
  }

  private async schedulePairingCodeRequestRetry(accountId: string, phoneNumber: string | null | undefined, reason: string, code?: number) {
    if (isPairingProviderRejection(reason, code)) {
      logger.error("whatsapp.pairing.provider_rejected", new Error(reason), { accountId, reason, code });
      return false;
    }
    if (this.hasRecentPairingRetryScheduled(accountId)) {
      logger.warn("whatsapp.pairing.retry_already_scheduled", { accountId, reason, code });
      return true;
    }

    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, phoneNumber: true },
    });
    const resolvedPhoneNumber = phoneNumber || account?.phoneNumber;
    if (!account || account.archivedAt || !resolvedPhoneNumber) return false;

    const nextAttempt = (pairingTransientRetries.get(accountId) ?? 0) + 1;
    pairingTransientRetries.set(accountId, nextAttempt);
    const shouldRetry = nextAttempt <= PAIRING_TRANSIENT_RETRY_LIMIT;

    await this.clearTemporaryAuth(accountId);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: shouldRetry ? "PENDING_PAIRING" : "FAILED",
        phoneNumber: resolvedPhoneNumber,
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: shouldRetry ? null : pairingFailureMessage(reason, code),
        recoveryLevel: Math.min(nextAttempt, 5),
        healthScore: shouldRetry ? 35 : 0,
      },
    });

    if (!shouldRetry) {
      logger.warn("whatsapp.pairing.retry_limit_reached", { accountId, code, attempts: nextAttempt, reason });
      await auditAccount(accountId, "whatsapp.pairing.failed", { reason, code, attempts: nextAttempt }).catch((error) =>
        logger.warn("whatsapp.pairing.failed_audit_failed", { accountId, reason: errorMessage(error) }),
      );
      return false;
    }

    const delay = Math.min(1_000 * nextAttempt, PAIRING_CODE_REISSUE_RETRY_MS, 5_000);
    pairingRetryScheduledAt.set(accountId, Date.now());
    logger.warn("whatsapp.pairing.code_request_retry_scheduled", {
      accountId,
      code,
      attempt: nextAttempt,
      maxAttempts: PAIRING_TRANSIENT_RETRY_LIMIT,
      delayMs: delay,
      reason,
    });
    await auditAccount(accountId, "whatsapp.pairing.retry_scheduled", { code, attempt: nextAttempt, reason, delayMs: delay }).catch((error) =>
      logger.warn("whatsapp.pairing.retry_audit_failed", { accountId, reason: errorMessage(error) }),
    );
    setTimeout(() => {
      pairingRetryScheduledAt.delete(accountId);
      void enqueueWhatsAppJob(
        "pairing",
        { action: "pairing", accountId, phoneNumber: resolvedPhoneNumber, preserveRetryCounter: true },
        { jobId: `pairing-retry-${accountId}-${nextAttempt}-${Math.floor(Date.now() / 1_000)}` },
      ).catch((error) => logger.error("whatsapp.pairing.retry_enqueue_failed", error, { accountId, attempt: nextAttempt }));
    }, delay);
    return true;
  }

  private async recoverRegisteredPairingClose(accountId: string, reason: string, code?: number) {
    const nextAttempt = (pairingRegisteredReconnects.get(accountId) ?? 0) + 1;
    pairingRegisteredReconnects.set(accountId, nextAttempt);
    if (nextAttempt > PAIRING_REGISTERED_RECONNECT_LIMIT) return false;

    await backupWhatsAppSessionToDatabase(accountId, "pairing.registered.close").catch((error) =>
      logger.warn("whatsapp.pairing.registered_close_backup_failed", { accountId, reason: errorMessage(error) }),
    );
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "CONNECTING",
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: "WHATSAPP_TRANSIENT_DISCONNECT",
        recoveryLevel: Math.min(nextAttempt, 3),
        healthScore: 65,
      },
    });
    await auditAccount(accountId, "whatsapp.pairing.registered_close_reconnect", { code, attempt: nextAttempt, reason }).catch((error) =>
      logger.warn("whatsapp.pairing.registered_reconnect_audit_failed", { accountId, reason: errorMessage(error) }),
    );
    logger.warn("whatsapp.pairing.registered_close_reconnect_scheduled", {
      accountId,
      code,
      attempt: nextAttempt,
      maxAttempts: PAIRING_REGISTERED_RECONNECT_LIMIT,
      reason,
    });
    setTimeout(() => {
      void this.startSession(accountId, "RECONNECT")
        .then(({ initialized: nextInitialized }) => nextInitialized)
        .catch((error) => logger.error("whatsapp.pairing.registered_reconnect_failed", error, { accountId, attempt: nextAttempt }));
    }, Math.min(1_000 * nextAttempt, 5_000));
    return true;
  }

  async requestPairingCode(accountId: string, phoneNumber: string, options: RequestPairingCodeOptions = {}): Promise<{ code: string; expiresAt: Date }> {
    const existing = pairingRequestFlights.get(accountId);
    if (existing) {
      logger.info("whatsapp.pairing.request_joined", { accountId });
      return existing;
    }

    const flight: Promise<{ code: string; expiresAt: Date }> = this.requestPairingCodeInternal(accountId, phoneNumber, options).finally(() => {
      if (pairingRequestFlights.get(accountId) === flight) pairingRequestFlights.delete(accountId);
    });
    pairingRequestFlights.set(accountId, flight);
    return flight;
  }

  private async requestPairingCodeInternal(accountId: string, phoneNumber: string, options: RequestPairingCodeOptions = {}): Promise<{ code: string; expiresAt: Date }> {
    const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
    const canonicalPhoneNumber = `+${normalized}`;
    this.cancelQrRetry(accountId);
    await pairingSocketRepairFlights.get(accountId)?.catch(() => undefined);
    if (!options.preserveRetryCounter) {
      pairingTransientRetries.delete(accountId);
      pairingRegisteredReconnects.delete(accountId);
      pairingRetryScheduledAt.delete(accountId);
    }
    logger.info("whatsapp.pairing.requested", { accountId, phoneNumber: maskPhoneNumber(normalized) });
    logger.info("whatsapp.pairing.request_started", { accountId, phoneNumber: maskPhoneNumber(normalized) });
    logger.info("WA_PAIRING_START", { accountId, phoneNumber: maskPhoneNumber(normalized), source: "worker" });
    await this.clearTemporaryAuth(accountId);
    sessionModes.set(accountId, "PAIR_PHONE");
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { status: "PENDING_PAIRING", phoneNumber: canonicalPhoneNumber, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
    });

    try {
      let session = await this.startSession(accountId, "PAIR_PHONE");
      if (session.registered) throw new Error("Pairing requires a clean unregistered auth state.");

      const waitForPairingBootstrap = async (attempt: number) => {
        const readiness = session.initialized
          .then(() => true)
          .catch((error) => {
            logger.warn("whatsapp.pairing.initialization_deferred_failed", {
              accountId,
              attempt,
              reason: errorMessage(error),
            });
            return "failed" as const;
          });
        const ready = await Promise.race([readiness, sleep(PAIRING_SOCKET_BOOTSTRAP_MS).then(() => false)]);
        if (ready === "failed") {
          if (this.hasRecentPairingRetryScheduled(accountId)) throw new Error(PAIRING_RETRY_SCHEDULED_ERROR);
          throw new Error("WhatsApp socket closed before pairing code request.");
        }
        if (!ready) logger.warn("whatsapp.pairing.socket_bootstrap_wait_timeout", { accountId, attempt });
      };

      const requestFromActiveSocket = async (attempt: number) => {
        await waitForPairingBootstrap(attempt);
        const activeSocket = sockets.get(accountId) ?? session.socket;
        if (activeSocket !== session.socket) logger.info("whatsapp.pairing.socket_replaced", { accountId, attempt });
        logger.info("whatsapp.pairing.provider_request", {
          accountId,
          attempt,
          phoneNumber: maskPhoneNumber(normalized),
          browser: WHATSAPP_BROWSER,
          countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
          companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
          companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
        });
        return activeSocket.requestPairingCode(normalized);
      };

      let code: string;
      try {
        code = await requestFromActiveSocket(1);
      } catch (requestError) {
        logger.warn("whatsapp.pairing.provider_request_retry", {
          accountId,
          reason: errorMessage(requestError),
        });
        if (isPairingProviderRejection(requestError)) throw requestError;
        if (this.hasRecentPairingRetryScheduled(accountId)) throw requestError;
        await this.clearTemporaryAuth(accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: {
            status: "PENDING_PAIRING",
            phoneNumber: canonicalPhoneNumber,
            qrCode: null,
            qrExpiresAt: null,
            pairingCode: null,
            pairingCodeExpiresAt: null,
            lastError: null,
          },
        });
        session = await this.startSession(accountId, "PAIR_PHONE");
        if (session.registered) throw new Error("Pairing requires a clean unregistered auth state.");
        code = await requestFromActiveSocket(2);
      }
      const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: { status: "PAIRING_CODE_READY", phoneNumber: canonicalPhoneNumber, pairingCode: code, pairingCodeExpiresAt: expiresAt, lastError: null },
      });
      pairingRetryScheduledAt.delete(accountId);
      const pairingMetadata = {
        phoneNumber: maskPhoneNumber(normalized),
        expiresAt: expiresAt.toISOString(),
        qrRefTimeoutMs: PHONE_PAIRING_QR_REF_TIMEOUT_MS,
        browser: WHATSAPP_BROWSER,
        countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
        companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
        companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
      };
      logger.info("whatsapp.pairing.ready", { accountId, ...pairingMetadata });
      logger.info("whatsapp.pairing.code_generated", { accountId, ...pairingMetadata });
      logger.info("WA_PAIRING_CODE_GENERATED", { accountId, ...pairingMetadata });
      await auditAccount(accountId, "whatsapp.pairing.code_generated", pairingMetadata);
      return { code, expiresAt };
    } catch (error) {
      if (!isPairingProviderRejection(error) && !isLoggedOutError(error) && await this.schedulePairingCodeRequestRetry(accountId, canonicalPhoneNumber, errorMessage(error))) {
        logger.warn("whatsapp.pairing.retry_scheduled_after_request_failure", { accountId, phoneNumber: maskPhoneNumber(normalized), reason: errorMessage(error) });
        throw new Error(PAIRING_RETRY_SCHEDULED_ERROR);
      }
      logger.error("whatsapp.connection.failed", error, { accountId, mode: "PAIR_PHONE", phoneNumber: maskPhoneNumber(normalized), reason: errorMessage(error) });
      logger.error("whatsapp.pairing.failed", error, { accountId, phoneNumber: maskPhoneNumber(normalized) });
      await this.clearTemporaryAuth(accountId);
      const message = pairingFailureMessage(error);
      await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: message } });
      await auditAccount(accountId, "whatsapp.pairing.failed", { reason: error instanceof Error ? error.message : String(error) });
      if (isPairingProviderRejection(error)) {
        const providerError = new Error(PAIRING_PROVIDER_REJECTED_ERROR) as Error & { cause?: unknown };
        providerError.cause = error;
        throw providerError;
      }
      throw error;
    }
  }

  async refreshPairingCode(accountId: string, phoneNumber: string): Promise<{ code: string; expiresAt: Date }> {
    const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
    const canonicalPhoneNumber = `+${normalized}`;
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, phoneNumber: true, pairingCode: true, pairingCodeExpiresAt: true },
    });
    if (!account || account.archivedAt || account.phoneNumber !== canonicalPhoneNumber) {
      throw new Error("WHATSAPP_PAIRING_ACCOUNT_NOT_AVAILABLE");
    }
    if (
      !account.pairingCode ||
      !account.pairingCodeExpiresAt ||
      account.pairingCodeExpiresAt.getTime() - Date.now() <= PAIRING_CODE_REFRESH_MIN_TTL_MS
    ) {
      logger.warn("whatsapp.pairing.refresh_requires_explicit_new_code", {
        accountId,
        phoneNumber: maskPhoneNumber(normalized),
        reason: "missing_or_expiring_code",
      });
      throw new Error(PAIRING_CODE_SOCKET_CLOSED_ERROR);
    }

    const activePairingSocket = sockets.get(accountId);
    if (sessionModes.get(accountId) === "PAIR_PHONE" && activePairingSocket?.ws.isOpen) {
      logger.info("whatsapp.pairing.active_code_reused", { accountId, expiresAt: account.pairingCodeExpiresAt.toISOString() });
      return { code: account.pairingCode, expiresAt: account.pairingCodeExpiresAt };
    }

    await this.invalidatePairingCodeAfterSocketClose(accountId, "pairing refresh found no live owning socket");
    logger.warn("whatsapp.pairing.refresh_requires_explicit_new_code", {
      accountId,
      phoneNumber: maskPhoneNumber(normalized),
      reason: "owning_socket_not_live",
    });
    throw new Error(PAIRING_CODE_SOCKET_CLOSED_ERROR);
  }

  async requestQrCode(accountId: string) {
    const existing = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    const activeQrSocket = sockets.get(accountId);
    const hasLiveQrSocket = sessionModes.get(accountId) === "PAIR_QR" && Boolean(activeQrSocket?.ws.isOpen);
    if (existing?.qrCode && existing.qrExpiresAt && existing.qrExpiresAt > new Date() && hasLiveQrSocket) {
      return { qr: existing.qrCode, expiresAt: existing.qrExpiresAt };
    }
    if (existing?.qrCode && existing.qrExpiresAt && existing.qrExpiresAt > new Date() && !hasLiveQrSocket) {
      logger.warn("whatsapp.qr.stale_token_rejected", { accountId, expiresAt: existing.qrExpiresAt.toISOString() });
    }
    await this.createFreshQrSession(accountId);
    for (let i = 0; i < 20; i += 1) {
      const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (account?.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()) return { qr: account.qrCode, expiresAt: account.qrExpiresAt };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("QR_GENERATION_TIMEOUT");
  }

  async getStatus(accountId: string) {
    return (await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } })).status;
  }

  private async startSession(accountId: string, mode: SessionMode) {
    const existingSocket = sockets.get(accountId);
    if (existingSocket) await this.stopSocket(accountId, `Replace existing WhatsApp socket before ${mode}`);
    await authMutationTails.get(accountId)?.catch(() => undefined);
    const generation = nextSessionGeneration(accountId);
    sessionModes.set(accountId, mode);
    if (mode === "PAIR_PHONE" || mode === "PAIR_QR") {
      await clearContactRuntimeState(accountId, `fresh-${mode.toLowerCase()}`);
    }
    await ensureWhatsAppSessionRoot();
    await restoreWhatsAppSessionFromDatabase(accountId);
    const directory = whatsappSessionDirectory(accountId);
    // Baileys uses this name for its auth-state factory; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const versionInfo = await fetchCurrentWhatsAppWebVersion({ forceLive: mode === "PAIR_PHONE" || mode === "PAIR_QR" });
    const { version } = versionInfo;
    // Full history is not required for Logivya's outbound delivery, group sync,
    // or app-state contact refresh. Asking the primary phone for full history
    // makes iOS report every long-running sync phase as a new
    // "synchronization completed" notification. Keep history sync disabled on
    // fresh pairing and reconnects; contacts are refreshed through app-state
    // and account-owned group metadata below.
    const syncContactHistory = false;
    if (!state.creds.registered && mode !== "PAIR_QR" && mode !== "PAIR_PHONE") {
      logger.warn("whatsapp.restore.credentials_missing", { accountId, mode });
      await this.handleMissingCredentials(accountId, `start_session_missing_credentials:${mode}`);
    }
    const preservePairingCode = mode === "PAIR_PHONE" && !state.creds.registered && await this.hasActivePairingCode(accountId);
    const activated = await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: state.creds.registered ? "CONNECTING" : preservePairingCode ? "PAIRING_CODE_READY" : mode === "PAIR_PHONE" ? "PENDING_PAIRING" : "PENDING_QR", lastError: null },
    });
    if (!activated.count) {
      throw new Error("WhatsApp account no longer exists");
    }

    const pendingReception = await resolveApprovedPendingReception(prisma, accountId, Boolean(state.creds.registered));
    if (pendingReception.reason === "policy_unavailable") {
      logger.warn("whatsapp_ingestion.pending_reception_policy_unavailable", { accountId });
    }
    logger.info("whatsapp.baileys.start", {
      accountId,
      mode,
      registered: state.creds.registered,
      sessionDirectory: directory,
      qrTimeoutMs: mode === "PAIR_PHONE" ? PHONE_PAIRING_QR_REF_TIMEOUT_MS : undefined,
      browser: WHATSAPP_BROWSER,
      countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
      companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
      companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
      waVersion: version,
      waVersionSource: versionInfo.source,
      waVersionIsLatest: versionInfo.isLatest,
      waVersionCached: Boolean(versionInfo.cached),
      waVersionFallbackReason: versionInfo.fallbackReason,
      syncContactHistory,
      statusBroadcastIgnored: true,
      offlineHistoryBatchDisabled: !pendingReception.enabled,
      approvedPendingReception: pendingReception.enabled,
      maxMsgRetryCount: MESSAGE_RETRY_LIMIT,
    });
    logger.info("whatsapp.session.starting", {
      accountId,
      mode,
      registered: state.creds.registered,
      qrTimeoutMs: mode === "PAIR_PHONE" ? PHONE_PAIRING_QR_REF_TIMEOUT_MS : undefined,
      browser: WHATSAPP_BROWSER,
      countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
      companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
      companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
      waVersion: version,
      waVersionSource: versionInfo.source,
      waVersionIsLatest: versionInfo.isLatest,
      waVersionFallbackReason: versionInfo.fallbackReason,
      syncContactHistory,
      offlineHistoryBatchDisabled: !pendingReception.enabled,
      approvedPendingReception: pendingReception.enabled,
      maxMsgRetryCount: MESSAGE_RETRY_LIMIT,
    });
    const socket = makeWASocket({
      auth: state,
      version,
      browser: WHATSAPP_BROWSER,
      countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: syncContactHistory,
      shouldSyncHistoryMessage: () => false,
      ...(pendingReception.enabled ? { logivyaReceivePendingMessages: true } : {}),
      connectTimeoutMs: SOCKET_CONNECT_TIMEOUT_MS,
      defaultQueryTimeoutMs: SOCKET_QUERY_TIMEOUT_MS,
      maxMsgRetryCount: MESSAGE_RETRY_LIMIT,
      shouldIgnoreJid: shouldIgnoreWhatsAppJid,
      ...(mode === "PAIR_PHONE" ? { qrTimeout: PHONE_PAIRING_QR_REF_TIMEOUT_MS } : {}),
    });
    if (sessionGenerations.get(accountId) !== generation) {
      intentionallyStoppedSockets.add(socket);
      socket.end(new Error(SESSION_SUPERSEDED_ERROR));
      throw new Error(SESSION_SUPERSEDED_ERROR);
    }
    sockets.set(accountId, socket);

    let initializedSettled = false;
    let connectionOpened = false;
    let initializationTimeout: ReturnType<typeof setTimeout> | undefined;
    let settleInitialized: (error?: unknown) => void = () => undefined;
    const initialized = new Promise<void>((resolve, reject) => {
      settleInitialized = (error?: unknown) => {
        if (initializedSettled) return;
        initializedSettled = true;
        if (initializationTimeout) clearTimeout(initializationTimeout);
        if (error) reject(error);
        else resolve();
      };
      initializationTimeout = setTimeout(() => settleInitialized(new Error("WhatsApp socket initialization timed out.")), SOCKET_INITIALIZATION_TIMEOUT_MS);
    });

    socket.ev.on("creds.update", () => {
      void queueAuthMutation(accountId, async () => {
        if (!isCurrentSession(accountId, socket, generation)) {
          logger.warn("whatsapp.creds_update.stale_ignored", { accountId, mode, generation });
          return;
        }
        await mkdir(directory, { recursive: true });
        await saveCreds();
        if (!isCurrentSession(accountId, socket, generation)) return;
        const activeMode = mode;
        logger.info("WA_PAIRING_CREDS_RECEIVED", {
          accountId,
          mode: activeMode,
          registered: state.creds.registered,
        });
        if (!connectionOpened && (activeMode === "PAIR_PHONE" || activeMode === "PAIR_QR")) {
          await auditAccount(accountId, "whatsapp.pairing.creds_update", { mode: activeMode, registered: state.creds.registered }).catch((error) =>
            logger.warn("whatsapp.pairing.creds_update_audit_failed", { accountId, reason: errorMessage(error) }),
          );
        }
        if (!connectionOpened && activeMode === "PAIR_PHONE" && state.creds.registered) {
          await prisma.whatsAppAccount.updateMany({
            where: { id: accountId, archivedAt: null },
            data: {
              status: "CONNECTING",
              pairingCode: null,
              pairingCodeExpiresAt: null,
              lastError: null,
            },
          });
          const registeredSnapshotSaved = await backupWhatsAppSessionToDatabase(
            accountId,
            "connection.open.pairing.registered",
          ).catch((error) => {
            logger.error("WA_PAIRING_REGISTERED_SNAPSHOT_FAILED", error, { accountId, mode: activeMode, generation });
            return false;
          });
          logger.info("WA_PAIRING_REGISTERED_SNAPSHOT_RESULT", {
            accountId,
            mode: activeMode,
            generation,
            saved: registeredSnapshotSaved,
          });
          this.scheduleRegisteredPairingOpenWatchdog(
            accountId,
            socket,
            generation,
            () => connectionOpened,
          );
        } else {
          await backupWhatsAppSessionToDatabase(accountId, "creds.update").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
        }
      }).catch((error) => logger.error("whatsapp.creds_update_handler_failed", error, { accountId, mode, generation }));
    });
    const runtimeKeys = state.keys as unknown as RuntimeSignalKeyStore;
    const lidMappingEvents = socket.ev as unknown as {
      on(event: "lid-mapping.update", listener: (event: LidMappingEvent) => void): void;
    };
    lidMappingEvents.on("lid-mapping.update", (event) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      const mappings = event.mappings ?? (event.lid && event.pn ? [{ lid: event.lid, pn: event.pn }] : []);
      queueLidMappingPersistence(accountId, runtimeKeys, mappings, "BAILEYS_LID_MAPPING_EVENT");
    });
    socket.ev.on("messaging-history.set", (payload) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      rememberContacts(accountId, payload.contacts, "BAILEYS_HISTORY");
      const mappings = (payload as typeof payload & { lidPnMappings?: LidPnMapping[] }).lidPnMappings ?? [];
      queueLidMappingPersistence(accountId, runtimeKeys, mappings, "BAILEYS_HISTORY_MAPPING");
    });
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      for (const message of messages) {
        const externalGroupId = message.key.remoteJid;
        const sourceMessageId = message.key.id;
        if (!externalGroupId?.endsWith("@g.us") || !sourceMessageId) continue;
        const sourceMessageTimestamp = whatsappMessageTimestamp(message.messageTimestamp);
        if (!shouldCaptureWhatsAppUpsert(type, sourceMessageTimestamp)) continue;
        const descriptor = whatsappInboundDescriptor(message);
        const text = whatsappInboundText(message).trim() || (descriptor.messageType === "LOCATION" ? "[location]" : "");
        if (!text) continue;
        void captureApprovedWhatsAppMessage({
          accountId,
          externalGroupId,
          providerMessageId: sourceMessageId,
          sourceMessageTimestamp,
          text,
          messageType: descriptor.messageType,
          senderJid: message.key.participant,
          attachments: descriptor.attachments,
        }).catch((error) => logger.error("whatsapp_ingestion.capture_failed", error, {
          accountId,
          externalGroupId,
          sourceMessageId,
        }));
      }
    });
    socket.ev.on("messages.update", (updates) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      for (const { key, update } of updates) {
        // Baileys emits a revoke as messages.update, not messages.delete.
        // The outer key identifies the original message; update.key is the revoke envelope.
        if (key.id && key.remoteJid?.endsWith("@g.us") && update.message === null && update.messageStubType === WAMessageStubType.REVOKE) {
          void markWhatsAppSourceMessageDeleted({ accountId, providerMessageId: key.id })
            .catch((error) => logger.error("whatsapp_ingestion.delete_capture_failed", error, {
              accountId,
              externalGroupId: key.remoteJid,
              sourceMessageId: key.id,
            }));
          continue;
        }
        if (key.id && key.remoteJid?.endsWith("@g.us") && update.message) {
          const editedMessage = { key, message: update.message } as WAMessage;
          const descriptor = whatsappInboundDescriptor(editedMessage);
          const text = whatsappInboundText(editedMessage).trim();
          if (text) {
            void captureApprovedWhatsAppMessage({
              accountId,
              externalGroupId: key.remoteJid,
              providerMessageId: key.id,
              sourceMessageTimestamp: new Date(),
              text,
              messageType: descriptor.messageType,
              senderJid: key.participant,
              attachments: descriptor.attachments,
              edited: true,
            }).catch((error) => logger.error("whatsapp_ingestion.edit_capture_failed", error, {
              accountId,
              externalGroupId: key.remoteJid,
              sourceMessageId: key.id,
            }));
          }
          continue;
        }
        if (!key.id || key.fromMe === false) continue;
        const acknowledgement = acknowledgementFromBaileysStatus(update.status);
        if (!acknowledgement) continue;
        recordOutboundAcknowledgement(accountId, key.id, acknowledgement, "messages.update");
      }
    });
    socket.ev.on("messages.delete", (payload) => {
      if (!isCurrentSession(accountId, socket, generation) || !("keys" in payload)) return;
      for (const key of payload.keys) {
        if (!key.id || !key.remoteJid?.endsWith("@g.us")) continue;
        void markWhatsAppSourceMessageDeleted({ accountId, providerMessageId: key.id })
          .catch((error) => logger.error("whatsapp_ingestion.delete_capture_failed", error, {
            accountId,
            externalGroupId: key.remoteJid,
            sourceMessageId: key.id,
          }));
      }
    });
    socket.ev.on("message-receipt.update", (updates) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      for (const { key, receipt } of updates) {
        if (!key.id) continue;
        const acknowledgement = receipt.readTimestamp ? "READ" : receipt.receiptTimestamp ? "DELIVERED" : null;
        if (!acknowledgement) continue;
        recordOutboundAcknowledgement(accountId, key.id, acknowledgement, "message-receipt.update");
      }
    });
    socket.ev.on("contacts.upsert", (contacts) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      rememberContacts(accountId, contacts, "BAILEYS_UPSERT");
    });
    socket.ev.on("contacts.update", (contacts) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      rememberContacts(accountId, contacts, "BAILEYS_UPDATE");
    });
    socket.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
      if (!isCurrentSession(accountId, socket, generation)) return;
      queueLidMappingPersistence(accountId, runtimeKeys, [{ lid, pn: jid }], "BAILEYS_PHONE_NUMBER_SHARE");
      rememberContacts(accountId, [{ id: lid, lid, jid, phoneNumber: jid }], "BAILEYS_PHONE_NUMBER_SHARE");
    });
    socket.ev.on("connection.update", (update) => {
      void (async () => {
        if (!isCurrentSession(accountId, socket, generation)) {
          logger.warn("whatsapp.connection.stale_update_ignored", { accountId, mode, generation });
          if (!initializedSettled) settleInitialized(new Error(SESSION_SUPERSEDED_ERROR));
          return;
        }
        const { connection, lastDisconnect, qr } = update;
        try {
        const currentMode = mode;
        if (currentMode === "PAIR_PHONE" || currentMode === "PAIR_QR") {
          logger.info("WA_PAIRING_CONNECTION_UPDATE", {
            accountId,
            mode: currentMode,
            connection: connection ?? null,
            hasQr: Boolean(qr),
            code: disconnectCode(lastDisconnect?.error) ?? null,
            registered: state.creds.registered,
          });
        }
        if (qr && currentMode === "PAIR_QR") {
          logger.info("whatsapp.qr.received", { accountId });
          const qrCode = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
          if (!isCurrentSession(accountId, socket, generation)) return;
          const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { id: true, archivedAt: true } });
          if (!isCurrentSession(accountId, socket, generation)) return;
          if (!account || account.archivedAt) {
            await this.stopSocket(accountId, "WhatsApp account no longer exists");
            settleInitialized(new Error("WhatsApp account no longer exists"));
            return;
          }
          const expiresAt = new Date(Date.now() + 60_000);
          await prisma.whatsAppSession.upsert({
            where: { id: accountId },
            update: { qrCode, status: "QR_READY", expiresAt },
            create: { id: accountId, accountId, qrCode, status: "QR_READY", expiresAt },
          });
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "QR_READY", qrCode, qrExpiresAt: expiresAt, lastError: null } });
          logger.info("whatsapp.qr.saved", { accountId, expiresAt: expiresAt.toISOString() });
          await auditAccount(
            accountId,
            "whatsapp.qr.generated",
            { expiresAt: expiresAt.toISOString() },
            qrRequestCorrelationIds.get(accountId),
          );
          settleInitialized();
        } else if (qr) {
          logger.warn("whatsapp.qr.ignored_for_restore", { accountId, mode: currentMode });
        }
        if (connection === "connecting") {
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null, status: { in: ["PENDING_PAIRING", "PENDING_QR"] } }, data: { status: "CONNECTING" } });
        }
        if (connection === "open") {
          connectionOpened = true;
          this.cancelRegisteredPairingOpenWatchdog(accountId);
          this.cancelQrRetry(accountId);
          qrRequestCorrelationIds.delete(accountId);
          pairingTransientRetries.delete(accountId);
          pairingRegisteredReconnects.delete(accountId);
          const phoneDigits = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0];
          const phoneNumber = phoneDigits ? `+${phoneDigits.replace(/^\+/, "")}` : null;
          const deviceId = socket.user?.id ?? null;
          const inferredCountry = inferPhoneCountry(phoneNumber);
          const existingLocale = await prisma.whatsAppAccount.findUnique({
            where: { id: accountId },
            select: { countryIso: true, messageLocale: true, lastGroupSyncAt: true },
          });
          if (!isCurrentSession(accountId, socket, generation)) return;
          const identityReset = await resetWhatsAppContactDirectoryIfIdentityChanged(accountId, phoneNumber, "connection-open");
          if (!isCurrentSession(accountId, socket, generation)) return;
          if (identityReset.changed) {
            await flushContactPersistence(accountId);
            if (!isCurrentSession(accountId, socket, generation)) return;
            const currentContacts = [...(contactSnapshots.get(accountId)?.values() ?? [])];
            if (currentContacts.length) {
              await persistWhatsAppContacts(accountId, currentContacts, { source: "BAILEYS_IDENTITY_CHANGED" });
              if (!isCurrentSession(accountId, socket, generation)) return;
            }
          }
          const connectedAt = new Date();
          const updated = await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTED", phoneNumber, countryIso: existingLocale?.countryIso ?? inferredCountry?.countryIso, messageLocale: existingLocale?.messageLocale ?? inferredCountry?.localeId, displayName: socket.user?.name, deviceId, lastConnectedAt: connectedAt, lastHeartbeatAt: connectedAt, lastPongAt: connectedAt, reconnectRetryCount: 0, recoveryLevel: 0, healthScore: 95, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null, ...(currentMode === "PAIR_PHONE" || currentMode === "PAIR_QR" ? { pairedAt: connectedAt, connectionMethod: currentMode === "PAIR_PHONE" ? "PHONE_CODE" : "QR" } : {}) } });
          if (!updated.count) return;
          await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTED", qrCode: null, expiresAt: null } });
          const connectionSnapshotSaved = await backupWhatsAppSessionToDatabase(accountId, "connection.open").catch((error) => {
            logger.error("whatsapp.session.backup_failed", error, { accountId });
            return false;
          });
          if (!connectionSnapshotSaved) {
            logger.warn("WA_SESSION_SNAPSHOT_CONNECTION_OPEN_RETRY_SCHEDULED", { accountId, retryAfterMs: 5_000 });
            const snapshotRetryTimer = setTimeout(() => {
              void backupWhatsAppSessionToDatabase(accountId, "connection.open.retry").then((saved) => {
                if (!saved) logger.error("WA_SESSION_SNAPSHOT_CONNECTION_OPEN_RETRY_FAILED", new Error("SESSION_SNAPSHOT_NOT_SAVED"), { accountId });
              }).catch((error) => logger.error("WA_SESSION_SNAPSHOT_CONNECTION_OPEN_RETRY_FAILED", error, { accountId }));
            }, 5_000);
            snapshotRetryTimer.unref?.();
          }
          this.startHeartbeat(accountId, socket);
          logger.info("SESSION_CREATED", { accountId, mode: currentMode });
          logger.info("whatsapp.connected", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          logger.info("whatsapp.connection.open", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          logger.info("WA_ACCOUNT_CONNECTED", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          await auditAccount(accountId, "whatsapp.connected", { phoneNumber: maskPhoneNumber(phoneNumber), mode: currentMode });
          settleInitialized();
          await safelyEvaluateTrialAfterConnection(accountId).catch((error) =>
            logger.error("whatsapp.trial.connection_open_evaluation_failed", error, { accountId }),
          );
          const groupSyncStale = !existingLocale?.lastGroupSyncAt
            || Date.now() - existingLocale.lastGroupSyncAt.getTime() >= GROUP_OPEN_SYNC_STALE_MS;
          if (groupSyncStale) {
            await enqueueWhatsAppJob(
              "sync",
              { action: "sync", accountId },
              {
                jobId: `sync-groups-open-${accountId}-${Math.floor(Date.now() / OPEN_SYNC_JOB_DEDUP_WINDOW_MS)}`,
                delay: 5_000,
                removeOnComplete: 50,
                removeOnFail: 100,
              },
            ).then(() => {
              logger.info("whatsapp.groups.connection_open_sync_queued", { whatsappAccountId: accountId });
            }).catch((error) => {
              logger.error("whatsapp.groups.connection_open_sync_queue_failed", error, { accountId });
            });
          } else {
            logger.info("whatsapp.groups.connection_open_sync_skipped_recent", {
              whatsappAccountId: accountId,
              lastGroupSyncAt: existingLocale.lastGroupSyncAt?.toISOString(),
              staleAfterMs: GROUP_OPEN_SYNC_STALE_MS,
            });
          }
          await (async () => {
            const contactState = await prisma.whatsAppAccount.findUnique({
              where: { id: accountId },
              select: { lastContactSyncAt: true, contactSyncImplementation: true, _count: { select: { contacts: true } } },
            });
            const contactSyncStale = !contactState?.lastContactSyncAt
              || Date.now() - contactState.lastContactSyncAt.getTime() >= CONTACT_OPEN_SYNC_STALE_MS;
            const contactSyncUpgradeRequired = contactState?.contactSyncImplementation !== CONTACT_SYNC_IMPLEMENTATION;
            if (identityReset.changed || !contactState?._count.contacts || contactSyncStale || contactSyncUpgradeRequired) {
              await enqueueWhatsAppJob(
                "sync-contacts",
                { action: "sync-contacts", accountId },
                {
                  jobId: `sync-contacts-open-${accountId}-${Math.floor(Date.now() / OPEN_SYNC_JOB_DEDUP_WINDOW_MS)}`,
                  delay: 5_000,
                  removeOnComplete: 50,
                  removeOnFail: 100,
                },
              );
              logger.info("whatsapp.contacts.connection_open_sync_queued", {
                whatsappAccountId: accountId,
                identityChanged: identityReset.changed,
                existingCount: contactState?._count.contacts ?? 0,
                stale: contactSyncStale,
                implementationUpgradeRequired: contactSyncUpgradeRequired,
              });
            }
          })().catch((error) => {
            logger.error("whatsapp.contacts.connection_open_sync_queue_failed", error, { accountId });
          });
        }
        if (connection === "close") {
          this.cancelRegisteredPairingOpenWatchdog(accountId);
          this.stopHeartbeat(accountId);
          const code = disconnectCode(lastDisconnect?.error);
          // WhatsApp's 403/forbidden close is a terminal rejection of the
          // linked-device credentials. Retrying it as a transient disconnect
          // repeatedly re-registers the companion on iOS and triggers the
          // "synchronization completed" notification. Reuse the established
          // logged-out path so credentials are cleared once and the user is
          // asked to pair again instead of entering an infinite reconnect loop.
          const loggedOut = isLoggedOutError(lastDisconnect?.error);
          const intentional = intentionallyStoppedSockets.has(socket);
          const replacedByNewSocket = Boolean(sockets.get(accountId) && sockets.get(accountId) !== socket);
          const closeError = lastDisconnect?.error instanceof Error ? lastDisconnect.error : new Error("WhatsApp socket closed before initialization.");
          if (!connectionOpened && currentMode === "PAIR_QR" && code === DisconnectReason.restartRequired && !intentional && !replacedByNewSocket) {
            const reason = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "WhatsApp QR pairing restart required";
            await this.scheduleQrPostScanRestart(accountId, generation, reason, code);
            if (sockets.get(accountId) === socket) sockets.delete(accountId);
            if (!initializedSettled) settleInitialized();
            return;
          }
          if (sockets.get(accountId) === socket) sockets.delete(accountId);
          logger.warn("whatsapp.connection.closed", { accountId, code, loggedOut, intentional, mode: currentMode });
          if (intentional) return;
          if (!connectionOpened && currentMode === "PAIR_QR") {
            if (replacedByNewSocket) return;
            if (!isCurrentGeneration(accountId, generation)) return;
            const reason = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "WhatsApp QR connection closed";
            const retryScheduled = !loggedOut && await this.scheduleFreshQrRetry(accountId, reason, code);
            if (retryScheduled) {
              if (!initializedSettled) settleInitialized();
              return;
            }
            await this.markQrPairingFailed(accountId, reason, code);
            if (!initializedSettled) settleInitialized(closeError);
            return;
          }
          if (currentMode !== "PAIR_PHONE" && !initializedSettled) settleInitialized(closeError);
          if (!connectionOpened && currentMode === "PAIR_PHONE") {
            if (replacedByNewSocket) {
              logger.warn("whatsapp.pairing.stale_socket_close_ignored", { accountId, code });
              return;
            }
            if (code === DisconnectReason.restartRequired) {
              await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTING", pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
              setTimeout(() => {
                if (!isCurrentGeneration(accountId, generation)) return;
                void this.startSession(accountId, "PAIR_PHONE")
                  .then(({ initialized: nextInitialized }) => nextInitialized)
                  .catch((error) => logger.error("whatsapp.pairing.restart_failed", error, { accountId }));
              }, 1_000);
              return;
            }
            const reason = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "WhatsApp pairing connection closed";
            if (state.creds.registered && await this.recoverRegisteredPairingClose(accountId, reason, code)) {
              logger.warn("WA_PAIRING_REGISTERED_CLOSE_RECOVERABLE", { accountId, mode: currentMode, reason, code });
              return;
            }
            if (!isCurrentGeneration(accountId, generation)) return;
            if (!state.creds.registered && await this.invalidatePairingCodeAfterSocketClose(accountId, reason, code)) {
              logger.warn("WA_PAIRING_VISIBLE_CODE_RETRY_REQUIRED", { accountId, mode: currentMode, reason, code });
              if (!initializedSettled) settleInitialized();
              return;
            }
            if (!isCurrentGeneration(accountId, generation)) return;
            if (!state.creds.registered && await this.schedulePairingCodeRequestRetry(accountId, null, reason, code)) {
              logger.warn("WA_PAIRING_RETRY_SCHEDULED_RECOVERABLE", { accountId, mode: currentMode, reason, code });
              if (!initializedSettled) settleInitialized();
              return;
            }
            if (!isCurrentGeneration(accountId, generation)) return;
            logger.error("whatsapp.pairing.connection_closed", lastDisconnect?.error, { accountId, code });
            await queueAuthMutation(accountId, async () => {
              if (!isCurrentGeneration(accountId, generation)) return;
              await clearWhatsAppSession(accountId);
            });
            if (!isCurrentGeneration(accountId, generation)) return;
            await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: pairingFailureMessage(lastDisconnect?.error, code) } });
            await auditAccount(accountId, "whatsapp.pairing.failed", { reason, code });
            logger.error("WA_PAIRING_FAILED_AUTH", lastDisconnect?.error, { accountId, mode: currentMode, reason, code });
            if (!initializedSettled) settleInitialized(closeError);
            return;
          }
          if (loggedOut) {
            if (!isCurrentGeneration(accountId, generation)) return;
            await queueAuthMutation(accountId, async () => {
              if (!isCurrentGeneration(accountId, generation)) return;
              await clearWhatsAppSession(accountId);
            });
            if (!isCurrentGeneration(accountId, generation)) return;
            const updated = await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "RECONNECT_REQUIRED", lastDisconnectedAt: new Date(), lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
            });
            await auditAccount(accountId, "whatsapp.logged_out", { code, loggedOut, mode: currentMode, recoverable: false });
            if (!updated.count) logger.warn("whatsapp.logged_out.account_missing", { accountId, code, mode: currentMode });
          } else {
            await this.markTransientConnectionLoss(accountId, `connection_close:${code ?? "unknown"}`, state.creds.registered ? 1 : 2);
            await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { lastDisconnectedAt: new Date() } });
            await auditAccount(accountId, "whatsapp.disconnected", { code, loggedOut, mode: currentMode, recoverable: true });
            this.scheduleReconnect(accountId, `connection_close:${code ?? "unknown"}`);
          }
        }
        } catch (error) {
          this.cancelRegisteredPairingOpenWatchdog(accountId);
          if (sessionGenerations.get(accountId) !== generation) {
            logger.warn("whatsapp.connection.stale_error_ignored", { accountId, mode, generation, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized(new Error(SESSION_SUPERSEDED_ERROR));
            return;
          }
          if (sockets.get(accountId) === socket) sockets.delete(accountId);
          const modeAtFailure = mode;
          const restorable = await hasRestorableWhatsAppCredentials(accountId).catch(() => false);
          if (!isCurrentGeneration(accountId, generation)) return;
          if (!connectionOpened && modeAtFailure === "PAIR_QR") {
            const code = disconnectCode(lastDisconnect?.error);
            if (code === DisconnectReason.restartRequired) {
              await this.scheduleQrPostScanRestart(accountId, generation, errorMessage(error), code);
              if (!initializedSettled) settleInitialized();
              return;
            }
            const retryScheduled = await this.scheduleFreshQrRetry(accountId, errorMessage(error)).catch(() => false);
            if (retryScheduled) {
              if (!initializedSettled) settleInitialized();
              return;
            }
            await this.markQrPairingFailed(accountId, errorMessage(error));
            if (!initializedSettled) settleInitialized(error);
            return;
          }
          if (!connectionOpened && modeAtFailure === "PAIR_PHONE" && state.creds.registered && await this.recoverRegisteredPairingClose(accountId, errorMessage(error))) {
            logger.warn("whatsapp.pairing.registered_error_reconnect", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            logger.warn("WA_PAIRING_REGISTERED_CLOSE_RECOVERABLE", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized();
            return;
          }
          if (!isCurrentGeneration(accountId, generation)) return;
          if (!connectionOpened && modeAtFailure === "PAIR_PHONE" && await this.invalidatePairingCodeAfterSocketClose(accountId, errorMessage(error))) {
            logger.warn("whatsapp.pairing.error_visible_code_invalidated", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            logger.warn("WA_PAIRING_VISIBLE_CODE_RETRY_REQUIRED", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized();
            return;
          }
          if (!isCurrentGeneration(accountId, generation)) return;
          if (!connectionOpened && modeAtFailure === "PAIR_PHONE" && !isLoggedOutError(error) && await this.schedulePairingCodeRequestRetry(accountId, null, errorMessage(error))) {
            logger.warn("whatsapp.pairing.error_retry_scheduled", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            logger.warn("WA_PAIRING_RETRY_SCHEDULED_RECOVERABLE", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized();
            return;
          }
          if (!isCurrentGeneration(accountId, generation)) return;
          if (!connectionOpened && modeAtFailure === "PAIR_PHONE") {
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null, status: { in: ["PENDING_QR", "QR_READY", "PENDING_PAIRING", "PAIRING_CODE_READY", "CONNECTING"] } },
              data: {
                status: "FAILED",
                lastError: pairingFailureMessage(error),
              },
            });
          } else if (isLoggedOutError(error)) {
            await queueAuthMutation(accountId, async () => {
              if (!isCurrentGeneration(accountId, generation)) return;
              await clearWhatsAppSession(accountId);
            });
            if (!isCurrentGeneration(accountId, generation)) return;
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
            });
          } else {
            await this.markTransientConnectionLoss(accountId, `connection_update_failed:${errorMessage(error)}`, restorable ? 2 : 3);
            this.scheduleReconnect(accountId, `connection_update_failed:${errorMessage(error)}`);
          }
          logger.error("whatsapp.connection.failed", error, { accountId, mode: modeAtFailure, reason: errorMessage(error) });
          logger.error("whatsapp.connection.update_failed", error, { accountId, mode: modeAtFailure });
          if (!connectionOpened && modeAtFailure === "PAIR_PHONE") {
            logger.error("WA_PAIRING_FAILED_AUTH", error, { accountId, mode: modeAtFailure, reason: errorMessage(error) });
          }
          if (!initializedSettled) settleInitialized(error);
        }
      })().catch((error) => {
        logger.error("whatsapp.connection.event_handler_failed", error, { accountId, mode, generation });
        if (!initializedSettled) settleInitialized(error);
      });
    });
    return { socket, registered: state.creds.registered, initialized };
  }

  async createSession(accountId: string): Promise<SessionResult> {
    const existingSocket = sockets.get(accountId);
    if (existingSocket?.user) return { sessionId: accountId, qrCode: await this.getQr(accountId) };
    if (existingSocket) await this.stopSocket(accountId, "Replace stale WhatsApp socket");
    const { initialized } = await this.startSession(accountId, "PAIR_QR");
    void initialized.catch((error) => logger.warn("whatsapp.qr.initialization_deferred_failed", { accountId, reason: errorMessage(error) }));
    return { sessionId: accountId, qrCode: null };
  }

  async createFreshQrSession(accountId: string, options: CreateFreshQrSessionOptions = {}): Promise<SessionResult> {
    this.cancelQrRetry(accountId);
    await pairingSocketRepairFlights.get(accountId)?.catch(() => undefined);
    qrTransientRetries.delete(accountId);
    if (options.correlationId) qrRequestCorrelationIds.set(accountId, options.correlationId);
    else qrRequestCorrelationIds.delete(accountId);
    await this.clearTemporaryAuth(accountId);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "PENDING_QR",
        qrCode: null,
        qrExpiresAt: null,
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: null,
      },
    });
    await prisma.whatsAppSession.updateMany({
      where: { accountId },
      data: { status: "PENDING_QR", qrCode: null, expiresAt: null },
    });
    await auditAccount(accountId, "whatsapp.qr.fresh_session_requested", {}, options.correlationId);
    return this.createSession(accountId);
  }

  async getQr(accountId: string) {
    return (await prisma.whatsAppSession.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } }))?.qrCode ?? null;
  }

  async disconnect(accountId: string) {
    await this.stopSocket(accountId, "Manual disconnect");
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "DISCONNECTED", lastDisconnectedAt: new Date(), lastError: null } });
  }

  hasLiveSocket(accountId: string) {
    const socket = sockets.get(accountId);
    return Boolean(socket?.user && socket.ws.isOpen);
  }

  async reconnect(accountId: string, options: { credentialsVerified?: boolean; sessionRestored?: boolean } = {}) {
    if (await isPhonePairingActive(accountId)) {
      logger.warn("whatsapp.reconnect.skipped_active_pairing", { accountId });
      await auditAccount(accountId, "whatsapp.reconnect.skipped_active_pairing");
      return;
    }
    const hasCredentials = options.credentialsVerified ?? await hasRestorableWhatsAppCredentials(accountId);
    if (hasCredentials) {
      await this.stopSocket(accountId, "Recover existing WhatsApp session");
      if (!options.sessionRestored) await restoreWhatsAppSessionFromDatabase(accountId);
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: { status: "CONNECTING", qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null, recoveryLevel: 2 },
      });
      await auditAccount(accountId, "whatsapp.session.recovery_requested");
      const { initialized } = await this.startSession(accountId, "RECONNECT");
      await initialized;
      return;
    }
    await this.handleMissingCredentials(accountId, "manual_reconnect_missing_credentials");
  }

  async syncGroups(accountId: string): Promise<GroupResult[]> {
    const startedAt = Date.now();
    logger.info("WA_GROUP_SYNC_START", { accountId });
    const socket = await this.ensureConnectedSocket(accountId);
    const metadata = await socket.groupFetchAllParticipating();
    const fetchedGroups = Object.entries(metadata).map(([externalId, group]) => ({
      ...(group as RuntimeWhatsAppGroupMetadata),
      id: group?.id || externalId,
    }));
    const account = await prisma.whatsAppAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { company: { select: { ownerId: true } } },
    });
    const ownerUserId = account.userId ?? account.company.ownerId;
    if (!ownerUserId) throw new Error("WHATSAPP_ACCOUNT_OWNER_MISSING");
    if (!account.userId) {
      await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { userId: ownerUserId } });
    }
    const fetchedGroupIds = fetchedGroups
      .map((group) => group.id?.trim())
      .filter((externalId): externalId is string => Boolean(externalId?.endsWith("@g.us")));
    const existingGroups = fetchedGroupIds.length
      ? await prisma.whatsAppGroup.findMany({
          where: { accountId, externalGroupId: { in: fetchedGroupIds } },
          select: { externalGroupId: true, name: true },
        })
      : [];
    const existingNameByExternalId = new Map(
      existingGroups.map((group) => [group.externalGroupId, group.name]),
    );
    const groups: NonNullable<ReturnType<typeof normalizeWhatsAppGroupMetadata>>[] = [];
    let metadataRefetchedCount = 0;
    let metadataRefetchFailedCount = 0;
    let invalidMetadataCount = 0;
    for (let index = 0; index < fetchedGroups.length; index += GROUP_SYNC_WRITE_CONCURRENCY) {
      const metadataBatch = fetchedGroups.slice(index, index + GROUP_SYNC_WRITE_CONCURRENCY);
      const normalizedBatch = await Promise.all(metadataBatch.map(async (group) => {
        let detailed: RuntimeWhatsAppGroupMetadata | null = null;
        if (!group.subject?.trim() && group.id?.endsWith("@g.us")) {
          try {
            detailed = await socket.groupMetadata(group.id);
            metadataRefetchedCount += 1;
          } catch (error) {
            metadataRefetchFailedCount += 1;
            logger.warn("whatsapp.groups.metadata_refetch_failed", {
              accountId,
              externalGroupId: group.id,
              reason: errorMessage(error),
            });
          }
        }
        return normalizeWhatsAppGroupMetadata(group, {
          detailed,
          existingName: group.id ? existingNameByExternalId.get(group.id) : undefined,
        });
      }));
      for (const group of normalizedBatch) {
        if (group) groups.push(group);
        else invalidMetadataCount += 1;
      }
    }
    const syncedAt = new Date();
    const groupJids = groups.map((group) => group.externalId);
    const ownershipRepaired = await prisma.whatsAppGroup.updateMany({
      where: {
        accountId,
        OR: [
          { companyId: { not: account.companyId } },
          { userId: null },
          { userId: { not: ownerUserId } },
        ],
      },
      data: { userId: ownerUserId, companyId: account.companyId },
    });
    for (let index = 0; index < groups.length; index += GROUP_SYNC_WRITE_CONCURRENCY) {
      const groupBatch = groups.slice(index, index + GROUP_SYNC_WRITE_CONCURRENCY);
      await Promise.all(groupBatch.map((group) => {
        const recommendation = recommendLogisticsWhatsAppGroup(group.name, group.description);
        return prisma.whatsAppGroup.upsert({
          where: { accountId_externalGroupId: { accountId, externalGroupId: group.externalId } },
          update: {
          userId: ownerUserId,
          companyId: account.companyId,
          accountId,
          name: group.name,
          description: group.description,
          participantCount: group.participantCount,
          canSend: group.canSend,
          logisticsGroupRecommended: recommendation.recommended,
          logisticsRecommendationConfidence: recommendation.confidence,
          isArchived: false,
          lastSyncedAt: syncedAt,
        },
        create: {
          userId: ownerUserId,
          companyId: account.companyId,
          accountId,
          externalGroupId: group.externalId,
          name: group.name,
          description: group.description,
          participantCount: group.participantCount,
          canSend: group.canSend,
          logisticsGroupRecommended: recommendation.recommended,
          logisticsRecommendationConfidence: recommendation.confidence,
          lastSyncedAt: syncedAt,
        },
        });
      }));
    }
    const deactivated = await prisma.whatsAppGroup.updateMany({
      where: { accountId, externalGroupId: { notIn: groupJids }, isArchived: false },
      data: { userId: ownerUserId, companyId: account.companyId, isArchived: true, lastSyncedAt: syncedAt },
    });
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: {
        lastSyncedAt: syncedAt,
        lastGroupSyncAt: syncedAt,
        healthScore: computeWhatsAppHealthScore({ status: "CONNECTED", lastHeartbeatAt: syncedAt, lastPongAt: syncedAt, lastSyncedAt: syncedAt, groupCount: groups.length, hasSessionSnapshot: true }),
      },
    });
    await backupWhatsAppSessionToDatabase(accountId, "group.sync").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
    const syncCorrelationId = `sync-${accountId}-${syncedAt.getTime()}`;
    logger.info("GROUP_SYNC", {
      correlationId: syncCorrelationId,
      userId: ownerUserId,
      companyId: account.companyId,
      whatsappAccountId: accountId,
      phoneNumber: account.phoneNumber ?? undefined,
      groupsFetchedCount: groups.length,
      groupsUpsertedCount: groups.length,
      groupsMetadataRefetchedCount: metadataRefetchedCount,
      groupsMetadataRefetchFailedCount: metadataRefetchFailedCount,
      groupsFallbackNameCount: groups.filter((group) => group.nameSource === "FALLBACK").length,
      groupsInvalidMetadataCount: invalidMetadataCount,
      groupsOwnershipRepairedCount: typeof ownershipRepaired === "object" && ownershipRepaired && "count" in ownershipRepaired ? ownershipRepaired.count : 0,
      groupsDeactivatedCount: typeof deactivated === "object" && deactivated && "count" in deactivated ? deactivated.count : 0,
      duration: Date.now() - startedAt,
      source: "baileys-provider",
    });
    logger.info("WA_GROUP_SYNC_SUCCESS", { accountId, count: groups.length, durationMs: Date.now() - startedAt });
    await auditAccount(accountId, "whatsapp.groups.synced", { count: groups.length }, syncCorrelationId);
    return groups.map(({ nameSource: _nameSource, ...group }) => group);
  }

  async sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    if (account.lastError === "WHATSAPP_LOGGED_OUT") {
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
      });
      throw new Error("WHATSAPP_LOGGED_OUT");
    }
    if (account.lastError === "WHATSAPP_CREDENTIALS_MISSING") {
      const hasLiveSocket = Boolean(sockets.get(input.accountId)?.user);
      const hasCredentials = hasLiveSocket || await hasRestorableWhatsAppCredentials(input.accountId);
      if (!hasCredentials) await this.handleMissingCredentials(input.accountId, "message_send_missing_credentials");
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "CONNECTING", lastError: null, recoveryLevel: 2, healthScore: 65 },
      });
    }
    if (!sockets.get(input.accountId)?.user) await restoreWhatsAppSessionFromDatabase(input.accountId);
    if (["RECONNECT_REQUIRED", "DISCONNECTED", "FAILED", "ERROR"].includes(account.status)) {
      await prisma.whatsAppAccount.updateMany({ where: { id: input.accountId, archivedAt: null }, data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 } });
    }
    const socket = await this.ensureConnectedSocket(input.accountId);
    const logContext = {
      accountId: input.accountId,
      groupExternalId: input.groupExternalId,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    };
    logger.info("message.baileys.send.attempt", logContext);
    let result: Awaited<ReturnType<typeof socket.sendMessage>>;
    try {
      result = await socket.sendMessage(input.groupExternalId, buildWhatsAppOutboundPayload(input));
    } catch (error) {
      logger.error("message.baileys.send.failed", error, logContext);
      if (isLoggedOutError(error)) {
        await clearWhatsAppSession(input.accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: input.accountId, archivedAt: null },
          data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
        });
        throw new Error("WHATSAPP_LOGGED_OUT");
      }
      await this.markTransientConnectionLoss(input.accountId, `message_send_failed:${errorMessage(error)}`);
      this.scheduleReconnect(input.accountId, `message_send_failed:${errorMessage(error)}`);
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
    if (!result?.key.id) {
      const error = new Error("WhatsApp did not return a message id");
      logger.error("message.baileys.send.failed", error, logContext);
      throw error;
    }
    assertWhatsAppMediaUploadResult(result, input.attachment);
    const observedAcknowledgement = input.attachment
      ? await waitForOutboundAcknowledgement(input.accountId, result.key.id, OUTBOUND_MEDIA_ACK_WAIT_MS)
      : outboundAcknowledgements.get(outboundAcknowledgementKey(input.accountId, result.key.id))?.acknowledgement ?? "PENDING";
    if (observedAcknowledgement === "ERROR") {
      const error = new Error("WHATSAPP_PROVIDER_REJECTED_MESSAGE");
      logger.error("message.baileys.send.rejected", error, { ...logContext, externalMessageId: result.key.id });
      throw error;
    }
    const acknowledgement = observedAcknowledgement;
    if (input.attachment && acknowledgement === "PENDING") {
      logger.warn("message.baileys.media_ack.pending", {
        ...logContext,
        externalMessageId: result.key.id,
        attachmentKind: input.attachment.kind,
        waitMs: OUTBOUND_MEDIA_ACK_WAIT_MS,
      });
    }
    await prisma.whatsAppAccount.updateMany({
      where: { id: input.accountId, archivedAt: null },
      data: { status: "CONNECTED", lastError: null, lastMessageAt: new Date(), lastPongAt: new Date(), healthScore: 95, recoveryLevel: 0 },
    });
    await backupWhatsAppSessionToDatabase(input.accountId, "message.sent").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId: input.accountId }));
    logger.info("MESSAGE_SENT", { ...logContext, externalMessageId: result.key.id, acknowledgement, mediaUploadVerified: Boolean(input.attachment) });
    logger.info("message.baileys.send.succeeded", { ...logContext, externalMessageId: result.key.id, acknowledgement, mediaUploadVerified: Boolean(input.attachment) });
    return {
      externalMessageId: result.key.id,
      messageKey: result.key,
      acknowledgement,
      mediaUploadVerified: Boolean(input.attachment),
    };
  }

  async syncContacts(accountId: string): Promise<{ count: number; implementation: string; deferred?: boolean }> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { id: true, userId: true, archivedAt: true } });
    if (!account || account.archivedAt || !account.userId) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (!sockets.get(accountId)?.user) await restoreWhatsAppSessionFromDatabase(accountId);
    const socket = await this.ensureConnectedSocket(accountId);
    const runtimeKeys = socket.authState.keys as unknown as RuntimeSignalKeyStore;
    await hydrateLidMappingsFromSession(accountId, runtimeKeys, "SESSION_LID_MAPPING");
    await flushContactPersistence(accountId);
    let snapshot = [...(contactSnapshots.get(accountId)?.values() ?? [])];
    if (snapshot.length) await persistWhatsAppContacts(accountId, snapshot, { source: "BAILEYS_MANUAL_SYNC" });

    let directoryStats = await persistedContactStats(accountId, account.userId);
    const activeDeliveries = await prisma.messageRecipient.count({
      where: {
        accountId,
        status: { in: ["SENDING", "PROCESSING"] },
        updatedAt: { gte: new Date(Date.now() - CONTACT_BOOTSTRAP_ACTIVE_DELIVERY_WINDOW_MS) },
      },
    });
    if (activeDeliveries > 0) {
      await enqueueWhatsAppJob(
        "sync-contacts",
        { action: "sync-contacts", accountId },
        { jobId: `sync-contacts-deferred-${accountId}-${Math.floor(Date.now() / 30_000)}`, delay: 30_000, removeOnComplete: 50, removeOnFail: 100 },
      );
      logger.info("whatsapp.contacts.bootstrap_deferred_active_delivery", { accountId, activeDeliveries, existingCount: directoryStats.total });
      return { count: directoryStats.total, implementation: CONTACT_SYNC_IMPLEMENTATION, deferred: true };
    }

    logger.info("whatsapp.contacts.full_sync_started", { accountId, existingCount: directoryStats.total, existingNamedCount: directoryStats.named });
    await auditAccount(accountId, "whatsapp.contacts.full_sync_started", {
      existingCount: directoryStats.total,
      existingNamedCount: directoryStats.named,
    }).catch((error) => logger.warn("whatsapp.contacts.bootstrap_audit_failed", { accountId, reason: errorMessage(error) }));

    const sessionBackedUp = await backupWhatsAppSessionToDatabase(accountId, "contact.full_sync.before_app_state")
      .then(() => true)
      .catch((error) => {
        logger.error("whatsapp.contacts.bootstrap_backup_failed", error, { accountId });
        return false;
      });
    if (!sessionBackedUp) return { count: directoryStats.total, implementation: CONTACT_SYNC_IMPLEMENTATION };

    let syncStrategy = "APP_STATE";
    let appStateSyncError: string | null = null;
    try {
      await waitForBaileysEventBuffer(accountId, socket);
      await socket.authState.keys.set({
        "app-state-sync-version": Object.fromEntries(CONTACT_APP_STATE_COLLECTIONS.map((collection) => [collection, null])),
      });
      await socket.resyncAppState([...CONTACT_APP_STATE_COLLECTIONS], true);
      const eventBufferFlushed = socket.ev.flush();
      logger.info("whatsapp.contacts.app_state_event_buffer_flushed", {
        whatsappAccountId: accountId,
        flushed: eventBufferFlushed,
      });
      await flushContactPersistence(accountId);
      snapshot = [...(contactSnapshots.get(accountId)?.values() ?? [])];
      if (snapshot.length) {
        // Baileys app-state events expose the session directory, not a provably complete phone address book.
        // Reconcile additively so a partial event stream can never hide previously authorized contacts.
        await persistWhatsAppContacts(accountId, snapshot, { source: "BAILEYS_FULL_APP_STATE" });
      }
      directoryStats = await persistedContactStats(accountId, account.userId);
      await backupWhatsAppSessionToDatabase(accountId, "contact.full_sync.app_state_synced").catch((error) =>
        logger.error("whatsapp.contacts.bootstrap_backup_failed", error, { accountId, strategy: syncStrategy }),
      );
    } catch (error) {
      appStateSyncError = errorMessage(error).slice(0, 200);
      logger.warn("whatsapp.contacts.app_state_sync_failed", { accountId, reason: appStateSyncError });
    }

    try {
      const metadata = Object.values(await socket.groupFetchAllParticipating());
      const participantContacts = collectGroupParticipantContacts(metadata, {
        ownJid: socket.user?.id,
        knownContacts: snapshot,
      });
      if (participantContacts.length) {
        await persistWhatsAppContacts(accountId, participantContacts, { source: "BAILEYS_GROUP_PARTICIPANT" });
      }
      directoryStats = await persistedContactStats(accountId, account.userId);
      if (!directoryStats.named && directoryStats.total > 0) syncStrategy = "APP_STATE_PLUS_GROUP_PARTICIPANTS";
      logger.info("whatsapp.contacts.group_participants_collected", {
        accountId,
        groupCount: metadata.length,
        participantContactCount: participantContacts.length,
        persistedCount: directoryStats.total,
        namedCount: directoryStats.named,
      });
    } catch (error) {
      logger.warn("whatsapp.contacts.group_participant_sync_failed", { accountId, reason: errorMessage(error) });
    }

    const expectedNamedCount = Math.min(directoryStats.total, Math.max(1, CONTACT_HISTORY_FALLBACK_MIN_NAMED));
    const sparseNamedDirectory = directoryStats.total > 0 && directoryStats.named < expectedNamedCount;
    if (directoryStats.total === 0 || sparseNamedDirectory) {
      // Never replace a healthy socket just to request phone-backed history.
      // App-state and group metadata are additive, so a later manual refresh can
      // safely discover newly available contacts without producing an iOS
      // companion-sync notification or interrupting message delivery.
      syncStrategy = directoryStats.total === 0 ? "APP_STATE_EMPTY" : "APP_STATE_SPARSE_NAMES";
      logger.info("whatsapp.contacts.history_reconnect_suppressed", {
        accountId,
        persistedCount: directoryStats.total,
        namedCount: directoryStats.named,
        expectedNamedCount,
      });
    }
    snapshot = [...(contactSnapshots.get(accountId)?.values() ?? [])];
    const unresolvedLidCount = snapshot.filter((contact) => contact.id.endsWith("@lid") && !contact.jid?.endsWith("@s.whatsapp.net")).length;
    const lidMappingCount = contactPhoneJidsByLid.get(accountId)?.size ?? 0;
    const lidMappingUniquePhoneCount = new Set(contactPhoneJidsByLid.get(accountId)?.values() ?? []).size;
    const normalizedSnapshot = snapshot.map(normalizeProviderContact).filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
    const normalizableSnapshotCount = normalizedSnapshot.length;
    const uniqueNormalizedAddressCount = new Set(normalizedSnapshot.map((contact) => contact.externalContactId)).size;
    const nativeLidTargetCount = normalizedSnapshot.filter((contact) => contact.externalContactId.endsWith("@lid")).length;
    logger.info("whatsapp.contacts.full_sync_finished", {
      accountId,
      persistedCount: directoryStats.total,
      namedCount: directoryStats.named,
      snapshotCount: snapshot.length,
      unresolvedLidCount,
      lidMappingCount,
      lidMappingUniquePhoneCount,
      normalizableSnapshotCount,
      uniqueNormalizedAddressCount,
      nativeLidTargetCount,
      appStateSyncError,
      strategy: syncStrategy,
    });
    await auditAccount(accountId, directoryStats.total > 0 ? "whatsapp.contacts.full_sync_completed" : "whatsapp.contacts.full_sync_empty", {
      persistedCount: directoryStats.total,
      namedCount: directoryStats.named,
      snapshotCount: snapshot.length,
      unresolvedLidCount,
      lidMappingCount,
      lidMappingUniquePhoneCount,
      normalizableSnapshotCount,
      uniqueNormalizedAddressCount,
      nativeLidTargetCount,
      appStateSyncError,
      strategy: syncStrategy,
    }).catch((error) => logger.warn("whatsapp.contacts.bootstrap_audit_failed", { accountId, reason: errorMessage(error) }));

    let verifiedCount = 0;
    let contactCursor: string | undefined;
    while (true) {
      const page = await prisma.contact.findMany({
        where: { accountId, userId: account.userId, isActive: true },
        select: { id: true, externalContactId: true },
        orderBy: { id: "asc" },
        take: 500,
        ...(contactCursor ? { cursor: { id: contactCursor }, skip: 1 } : {}),
      });
      if (!page.length) break;
      verifiedCount += page.length;
      contactCursor = page.at(-1)?.id;
      for (let offset = 0; offset < page.length; offset += 100) {
        const batch = page.slice(offset, offset + 100).filter((contact) => !contact.externalContactId.endsWith("@lid"));
        if (!batch.length) continue;
        try {
          const availability = await socket.onWhatsApp(...batch.map((contact) => contact.externalContactId)) ?? [];
          const availabilityByJid = new Map<string, boolean>();
          for (const item of availability) {
            if (item.jid) availabilityByJid.set(item.jid, Boolean(item.exists));
          }
          await Promise.all(batch.flatMap((contact) => {
            if (!availabilityByJid.has(contact.externalContactId)) return [];
            const exists = availabilityByJid.get(contact.externalContactId) ?? false;
            return [prisma.contact.update({
              where: { id: contact.id },
              data: { isWhatsAppUser: exists, isActive: exists },
            })];
          }));
        } catch (error) {
          logger.warn("whatsapp.contacts.availability_check_failed", {
            accountId,
            batchSize: batch.length,
            reason: errorMessage(error),
          });
        }
      }
    }
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { lastContactSyncAt: new Date(), contactSyncImplementation: CONTACT_SYNC_IMPLEMENTATION },
    });
    logger.info("whatsapp.contacts.sync_completed", { accountId, snapshotCount: snapshot.length, verifiedCount });
    return { count: verifiedCount, implementation: CONTACT_SYNC_IMPLEMENTATION };
  }

  async sendContactMessage(input: SendContactMessageInput): Promise<SendResult> {
    logger.info("message.baileys.contact_send.delegated", { accountId: input.accountId, contactExternalId: input.contactExternalId, correlationId: input.correlationId });
    return this.sendGroupMessage({
      accountId: input.accountId,
      groupExternalId: input.contactExternalId,
      content: input.content,
      attachment: input.attachment,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    });
  }

  async deleteGroupMessage(input: DeleteGroupMessageInput): Promise<DeleteResult> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    if (!input.messageKey?.id) throw new Error("WHATSAPP_MESSAGE_KEY_MISSING");
    if (account.lastError === "WHATSAPP_LOGGED_OUT") {
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
      });
      throw new Error("WHATSAPP_LOGGED_OUT");
    }
    if (account.lastError === "WHATSAPP_CREDENTIALS_MISSING") {
      const hasLiveSocket = Boolean(sockets.get(input.accountId)?.user);
      const hasCredentials = hasLiveSocket || await hasRestorableWhatsAppCredentials(input.accountId);
      if (!hasCredentials) await this.handleMissingCredentials(input.accountId, "message_delete_missing_credentials");
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "CONNECTING", lastError: null, recoveryLevel: 2, healthScore: 65 },
      });
    }
    if (!sockets.get(input.accountId)?.user) await restoreWhatsAppSessionFromDatabase(input.accountId);
    if (["RECONNECT_REQUIRED", "DISCONNECTED", "FAILED", "ERROR"].includes(account.status)) {
      await prisma.whatsAppAccount.updateMany({ where: { id: input.accountId, archivedAt: null }, data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 } });
    }
    const socket = await this.ensureConnectedSocket(input.accountId);
    const deleteKey: WAMessageKey = {
      ...input.messageKey,
      id: input.messageKey.id,
      remoteJid: input.messageKey.remoteJid ?? input.groupExternalId,
      fromMe: input.messageKey.fromMe ?? true,
    };
    const logContext = {
      accountId: input.accountId,
      groupExternalId: input.groupExternalId,
      externalMessageId: deleteKey.id,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    };
    logger.info("message.baileys.delete.attempt", logContext);
    try {
      const result = await socket.sendMessage(input.groupExternalId, { delete: deleteKey });
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "CONNECTED", lastError: null, lastPongAt: new Date(), healthScore: 95, recoveryLevel: 0 },
      });
      await backupWhatsAppSessionToDatabase(input.accountId, "message.deleted").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId: input.accountId }));
      logger.info("message.baileys.delete.succeeded", { ...logContext, deleteMessageId: result?.key?.id });
      return { ok: true, externalMessageId: result?.key?.id ?? null };
    } catch (error) {
      logger.error("message.baileys.delete.failed", error, logContext);
      if (isLoggedOutError(error)) {
        await clearWhatsAppSession(input.accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: input.accountId, archivedAt: null },
          data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
        });
        throw new Error("WHATSAPP_LOGGED_OUT");
      }
      await this.markTransientConnectionLoss(input.accountId, `message_delete_failed:${errorMessage(error)}`);
      this.scheduleReconnect(input.accountId, `message_delete_failed:${errorMessage(error)}`);
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
  }

  async deleteContactMessage(input: DeleteContactMessageInput): Promise<DeleteResult> {
    logger.info("message.baileys.contact_delete.delegated", { accountId: input.accountId, contactExternalId: input.contactExternalId, correlationId: input.correlationId });
    return this.deleteGroupMessage({
      accountId: input.accountId,
      groupExternalId: input.contactExternalId,
      messageKey: input.messageKey,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    });
  }
}
