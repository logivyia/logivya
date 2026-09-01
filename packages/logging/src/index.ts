export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const AUDIT_RESULTS = ["SUCCESS", "DENIED", "FAILED", "PARTIAL"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export const ACTOR_TYPES = ["USER", "COMPANY_OWNER", "PLATFORM_ADMIN", "SYSTEM", "WORKER", "WEBHOOK"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const SECURITY_EVENT_STATUS = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"] as const;
export type SecurityEventStatus = (typeof SECURITY_EVENT_STATUS)[number];

export const AUDIT_ACTIONS = [
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED",
  "AUTH_LOGOUT",
  "AUTH_PASSWORD_CHANGED",
  "AUTH_PASSWORD_RESET",
  "AUTH_SESSION_REVOKED",
  "AUTH_2FA_ENABLED",
  "AUTH_2FA_DISABLED",
  "AUTH_2FA_FAILED",
  "AUTH_RECOVERY_CODE_USED",
  "COMPANY_CREATED",
  "COMPANY_UPDATED",
  "COMPANY_SUSPENDED",
  "COMPANY_REACTIVATED",
  "USER_INVITED",
  "INVITATION_RESENT",
  "INVITATION_CANCELED",
  "INVITATION_ACCEPTED",
  "MEMBERSHIP_REMOVED",
  "MEMBERSHIP_SUSPENDED",
  "MEMBERSHIP_REACTIVATED",
  "SEAT_ALLOCATED",
  "SEAT_RELEASED",
  "SEAT_LIMIT_DENIED",
  "TRIAL_STARTED",
  "TRIAL_DENIED",
  "TRIAL_CONSUMED",
  "TRIAL_RISK_FLAGGED",
  "SUBSCRIPTION_ASSIGNED",
  "SUBSCRIPTION_ACTIVATED",
  "SUBSCRIPTION_CHANGED",
  "SUBSCRIPTION_EXTENDED",
  "SUBSCRIPTION_CANCELED",
  "SUBSCRIPTION_EXPIRED",
  "SUBSCRIPTION_SUSPENDED",
  "SUBSCRIPTION_REACTIVATED",
  "WHATSAPP_ACCOUNT_CONNECTED",
  "WHATSAPP_ACCOUNT_RESTORED",
  "WHATSAPP_ACCOUNT_DISCONNECTED",
  "WHATSAPP_ACCOUNT_LOGGED_OUT",
  "WHATSAPP_RECONNECT_STARTED",
  "WHATSAPP_RECONNECT_COMPLETED",
  "WHATSAPP_RECONNECT_FAILED",
  "GROUP_SYNC_STARTED",
  "GROUP_SYNC_COMPLETED",
  "GROUP_SYNC_FAILED",
  "CONTACT_SYNC_STARTED",
  "CONTACT_SYNC_COMPLETED",
  "CONTACT_SYNC_FAILED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_SCHEDULED",
  "CAMPAIGN_CANCELED",
  "CAMPAIGN_COMPLETED",
  "CAMPAIGN_PARTIAL",
  "CAMPAIGN_FAILED",
  "MESSAGE_DELETE_REQUESTED",
  "MESSAGE_DELETE_COMPLETED",
  "MESSAGE_DELETE_PARTIAL",
  "MESSAGE_DELETE_FAILED",
  "SUPPORT_TICKET_CREATED",
  "SUPPORT_ADMIN_REPLIED",
  "SUPPORT_USER_REPLIED",
  "SUPPORT_STATUS_CHANGED",
  "SUPPORT_TICKET_CLOSED",
  "ADMIN_SETTING_CHANGED",
  "FEATURE_FLAG_CHANGED",
  "BACKUP_STARTED",
  "BACKUP_COMPLETED",
  "RESTORE_STARTED",
  "RESTORE_COMPLETED",
  "DEPLOYMENT_ROLLED_BACK",
  "ADMIN_AUDIT_LOG_ACCESSED",
  "ADMIN_SECURITY_LOG_ACCESSED",
  "ADMIN_SECURITY_EVENT_STATUS_CHANGED",
] as const;

export const SECURITY_EVENT_TYPES = [
  "AUTH_LOGIN_FAILED",
  "AUTH_RATE_LIMITED",
  "AUTH_SESSION_REVOKED",
  "AUTH_REFRESH_TOKEN_REJECTED",
  "AUTH_2FA_FAILED",
  "ADMIN_ACCESS_DENIED",
  "TENANT_ACCESS_DENIED",
  "RATE_LIMIT_BLOCKED",
  "TRIAL_RISK_FLAGGED",
  "INVITATION_RISK_FLAGGED",
  "WEBHOOK_SIGNATURE_FAILED",
  "WHATSAPP_AUTH_FAILURE_REPEATED",
  "CLIENT_ERROR_REPORTED",
] as const;

export type StructuredLogContext = {
  service?: string | null;
  environment?: string | null;
  eventName?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  jobId?: string | number | null;
  queueName?: string | null;
  workerId?: string | null;
  userId?: string | null;
  companyId?: string | null;
  whatsappAccountId?: string | null;
  campaignId?: string | null;
  ticketId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  appVersion?: string | null;
  releaseVersion?: string | null;
  platform?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number;
  durationMs?: number;
  result?: string;
  errorCode?: string;
  retryable?: boolean;
  attempt?: number;
  finalAttempt?: boolean;
  safeMetadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SerializedLogError = {
  name: string;
  message: string;
  category: string;
  code?: string;
  statusCode?: number;
  retryable?: boolean;
  stack?: string;
  cause?: SerializedLogError;
};

const SECRET_KEY = /(?:password|passcode|passwordhash|passwordconfirmation|token|authorization|cookie|csrf|secret|api[-_]?key|private[-_]?key|session|credential|pairing[-_]?code|totp|recovery[-_]?code|card[-_]?number|cvv|cvc|database[-_]?url|connection[-_]?string)/i;
const PRIVATE_CONTENT_KEY = /(?:message[-_]?(?:body|content|key)|externalMessageId|support[-_]?content|ticket[-_]?content|description|attachment[-_]?content|raw[-_]?body|payload|contact[-_]?list|group[-_]?list|qr(?:code|data)?|jid|external(?:group|contact)id|device(?:id|fingerprint)|^(?:content|body|text|caption|preview|message|messageId|campaignId|recipientId|recipientPhone|recipientJid|contactId|contactName|groupId|groupName|groupJid|targetJid)$)/i;
const EMAIL_KEY = /email(?:address)?$/i;
const PHONE_KEY = /(?:phone|phoneNumber|mobileNumber)$/i;
const IP_KEY = /(?:^|[-_])ip(?:Address)?$/i;
const USER_AGENT_KEY = /userAgent/i;
const URL_KEY = /(?:^|[-_])(?:url|uri|link)$/i;
const SECRET_VALUE = /TEST_(?:PASSWORD|ACCESS_TOKEN|TOTP|WHATSAPP_CREDS)_SECRET|Bearer\s+[^\s,;]+|(?:postgres(?:ql)?|redis):\/\/[^\s]+|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gi;
const EMAIL_VALUE = /\b([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const WHATSAPP_JID_VALUE = /\b\d{7,20}@(s\.whatsapp\.net|g\.us|lid)\b/gi;
const PHONE_VALUE = /(?:^|[^A-Za-z0-9])((?:\+|00)?\d[\d\s().-]{6,}\d)(?=$|[^A-Za-z0-9])/g;
const MAX_DEPTH = 8;
const MAX_KEYS = 100;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 2_048;
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function maskEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return "[REDACTED_EMAIL]";
  return `${normalized[0]}***@${normalized.slice(separator + 1)}`;
}

export function maskPhone(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "[REDACTED_PHONE]";
  const country = raw.startsWith("+") && digits.length > 10 ? `+${digits.slice(0, Math.min(2, digits.length - 7))}` : "";
  return `${country}${"*".repeat(Math.max(4, digits.length - country.replace("+", "").length - 4))}${digits.slice(-4)}`;
}

export function maskIpAddress(value: string | null | undefined) {
  const ip = value?.trim();
  if (!ip) return undefined;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}::*`;
  return "[REDACTED_IP]";
}

export function summarizeUserAgent(value: string | null | undefined) {
  const userAgent = value?.trim();
  if (!userAgent) return undefined;
  const os = /Android/i.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/i.test(userAgent) ? "iOS"
    : /Windows/i.test(userAgent) ? "Windows"
    : /Macintosh|Mac OS/i.test(userAgent) ? "macOS"
    : /Linux/i.test(userAgent) ? "Linux"
    : "Other";
  const client = /Edg\//i.test(userAgent) ? "Edge"
    : /Chrome\//i.test(userAgent) ? "Chrome"
    : /Firefox\//i.test(userAgent) ? "Firefox"
    : /Safari\//i.test(userAgent) ? "Safari"
    : /okhttp|ReactNative|Expo/i.test(userAgent) ? "MobileApp"
    : "Other";
  return `${os}/${client}`;
}

function sanitizeString(value: string) {
  return value
    .replace(SECRET_VALUE, "[REDACTED]")
    .replace(WHATSAPP_JID_VALUE, "[REDACTED_JID]")
    .replace(EMAIL_VALUE, (_match, local: string, domain: string) => `${local.slice(0, 1).toLowerCase()}***@${domain.toLowerCase()}`)
    .replace(PHONE_VALUE, (match, phone: string) => {
      const digits = phone.replace(/\D/g, "");
      const explicitlyInternational = phone.startsWith("+") || phone.startsWith("00");
      return explicitlyInternational || digits.length >= 10
        ? match.replace(phone, "[REDACTED_PHONE]")
        : match;
    })
    .slice(0, MAX_STRING_LENGTH);
}

export function sanitizeLogText(value: unknown, maxLength = MAX_STRING_LENGTH) {
  return sanitizeString(String(value ?? "")).slice(0, Math.max(0, Math.min(maxLength, MAX_STRING_LENGTH)));
}

function sanitizeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`.slice(0, MAX_STRING_LENGTH);
  } catch {
    return sanitizeString(value.split(/[?#]/, 1)[0] ?? value);
  }
}

function sanitizeUnknown(value: unknown, key: string | undefined, depth: number, seen: WeakSet<object>): unknown {
  if (key && (SECRET_KEY.test(key) || PRIVATE_CONTENT_KEY.test(key))) return "[REDACTED]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (key && EMAIL_KEY.test(key)) return maskEmail(value);
    if (key && PHONE_KEY.test(key)) return "[REDACTED_PHONE]";
    if (key && IP_KEY.test(key)) return maskIpAddress(value);
    if (key && USER_AGENT_KEY.test(key)) return summarizeUserAgent(value);
    if (key && URL_KEY.test(key)) return sanitizeUrl(value);
    return sanitizeString(value);
  }
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeUnknown(item, undefined, depth + 1, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);
    const result = Object.fromEntries(entries.map(([childKey, item]) => [childKey, sanitizeUnknown(item, childKey, depth + 1, seen)]));
    seen.delete(value);
    return result;
  }
  return sanitizeString(String(value));
}

export function redactSensitive<T>(value: T): T {
  return sanitizeUnknown(value, undefined, 0, new WeakSet()) as T;
}

export function sanitizeLogMetadata(value: Record<string, unknown> | null | undefined) {
  return redactSensitive(value ?? {}) as Record<string, unknown>;
}

export function normalizeCorrelationId(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && CORRELATION_ID.test(normalized) ? normalized : fallback;
}

export function canonicalAuditAction(value: string) {
  const normalized = value.trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return normalized || "UNKNOWN_ACTION";
}

export function normalizeEventName(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._:-]+/g, "_").slice(0, 160) || "unknown.event";
}

function errorField(error: unknown, key: string): unknown {
  return error && typeof error === "object" ? (error as Record<string, unknown>)[key] : undefined;
}

export function classifyError(error: unknown) {
  const value = `${errorField(error, "name") ?? ""} ${errorField(error, "code") ?? ""} ${error instanceof Error ? error.message : String(error ?? "")}`;
  if (/validation|zod|invalid/i.test(value)) return "Validation";
  if (/tenant|ownership|company_mismatch/i.test(value)) return "Tenant isolation";
  if (/forbidden|authorization|permission/i.test(value)) return "Authorization";
  if (/unauthorized|authentication|credential|login/i.test(value)) return "Authentication";
  if (/prisma|database|constraint|P\d{4}/i.test(value)) return "Database";
  if (/redis|cache/i.test(value)) return "Redis";
  if (/queue|bullmq|job/i.test(value)) return "Queue";
  if (/worker/i.test(value)) return "Worker";
  if (/whatsapp|baileys|socket|jid/i.test(value)) return "WhatsApp";
  if (/smtp|email|mail/i.test(value)) return "Email";
  if (/notification|push/i.test(value)) return "Notification";
  if (/storage|s3|file/i.test(value)) return "Storage";
  if (/payment|stripe|iyzico|invoice/i.test(value)) return "Payment";
  return "Unknown";
}

export function serializeLogError(error: unknown, options: { includeStack?: boolean; depth?: number } = {}): SerializedLogError {
  const depth = options.depth ?? 0;
  const name = error instanceof Error ? error.name : typeof error === "object" && error ? String(errorField(error, "name") ?? "Error") : "Error";
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : String(errorField(error, "message") ?? "Operation failed");
  const rawCode = errorField(error, "code");
  const rawStatus = errorField(error, "statusCode") ?? errorField(error, "status");
  const rawRetryable = errorField(error, "retryable");
  const result: SerializedLogError = {
    name: sanitizeString(name).slice(0, 120),
    message: sanitizeString(rawMessage),
    category: classifyError(error),
  };
  if (typeof rawCode === "string" || typeof rawCode === "number") result.code = sanitizeString(String(rawCode)).slice(0, 120);
  if (typeof rawStatus === "number") result.statusCode = rawStatus;
  if (typeof rawRetryable === "boolean") result.retryable = rawRetryable;
  if (options.includeStack && error instanceof Error && error.stack) result.stack = sanitizeString(error.stack).slice(0, 8_000);
  const cause = errorField(error, "cause");
  if (cause && depth < 2) result.cause = serializeLogError(cause, { ...options, depth: depth + 1 });
  return result;
}
