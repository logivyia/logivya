import type { Locale } from "@/i18n/config";
import {
  translate,
  translations,
  type TranslationKey,
} from "@/i18n/translations";

const statusKeys: Record<string, TranslationKey> = {
  ACTIVE: "status.active",
  INACTIVE: "status.inactive",
  ENABLED: "adminFeatureFlags.enabled",
  DISABLED: "adminFeatureFlags.disabled",
  CONNECTED: "accountStatus.CONNECTED",
  CONNECTING: "accountStatus.CONNECTING",
  RECONNECTING: "accountStatus.RECONNECTING",
  DISCONNECTED: "accountStatus.DISCONNECTED",
  RECONNECT_REQUIRED: "accountStatus.RECONNECT_REQUIRED",
  FAILED: "status.failed",
  COMPLETED: "status.completed",
  CANCELED: "status.canceled",
  CANCELLED: "status.canceled",
  SUSPENDED: "status.suspended",
  TRIALING: "status.subscription.trial",
  EXPIRED: "status.subscription.expired",
  PENDING: "status.pending",
  PAID: "payment.status.paid",
  SUCCEEDED: "payment.status.succeeded",
  REFUNDED: "payment.status.refunded",
  READ: "status.completed",
  UNREAD: "status.pending",
  REQUESTED: "dataRequest.status.requested",
  VERIFYING: "dataRequest.status.verifying",
  PROCESSING: "dataRequest.status.processing",
  REJECTED: "dataRequest.status.rejected",
  PENDING_PAYMENT: "status.payment.pending",
  PAYMENT_REVIEW: "status.in_progress",
  AWAITING_PAYMENT: "status.payment.pending",
  UNDER_REVIEW: "status.in_progress",
  APPROVED: "status.completed",
  ACTIVATED: "status.active",
  CLARIFICATION_REQUIRED: "status.waiting_for_user",
  HEALTHY: "status.healthy",
  DEGRADED: "status.unknown",
  UNAVAILABLE: "groups.unavailable",
  UNKNOWN: "status.unknown",
  CONFIGURED: "adminPlatform.configured",
  RUNBOOK_ONLY: "adminBackups.runbookReady",
  DOCUMENTED: "status.completed",
  ARCHIVED: "accountStatus.ARCHIVED",
  OPEN: "status.open",
  ACKNOWLEDGED: "status.in_progress",
  INVESTIGATING: "status.in_progress",
  MITIGATED: "status.resolved",
  RESOLVED: "status.resolved",
  MAINTENANCE: "status.in_progress",
  UNDER_INVESTIGATION: "status.in_progress",
  INVITED: "status.pending",
  DRAFT: "status.draft",
  ISSUED: "status.invoice.issued",
  MANUAL_PENDING: "status.subscription.manual_pending",
  QUEUED: "status.queued",
  SCHEDULED: "status.scheduled",
  SENDING: "status.sending",
  DISMISSED: "status.canceled",
  CONSUMED: "status.completed",
  INELIGIBLE: "adminReleases.blocked",
  BLOCKED: "adminReleases.blocked",
  PAID_USAGE: "status.payment.paid",
  RECEIVED: "status.completed",
  IDENTITY_VERIFICATION_REQUIRED: "dataRequest.status.verifying",
  IN_REVIEW: "status.in_progress",
  WAITING_FOR_USER: "status.waiting_for_user",
  WAITING_FOR_ADMIN: "status.waiting_for_admin",
  PARTIALLY_APPROVED: "status.partially_completed",
  CLOSED: "status.closed",
  VALIDATING: "status.in_progress",
  BUILT: "status.completed",
  SUBMITTED: "status.completed",
  ROLLING_OUT: "status.in_progress",
  ROLLED_BACK: "status.canceled",
  CONFIGURED_UNVERIFIED: "adminPlatform.configured",
  INCOMPLETE: "adminSubscriptions.incomplete",
  NOT_CONFIGURED: "adminPlatform.notConfigured",
  NOT_RECORDED: "status.unknown",
  SCRIPTED: "status.completed",
  PASSED: "status.completed",
  DELIVERED: "webhook.status.delivered",
  DEAD_LETTERED: "webhook.status.dead_letter",
  PROCESSED: "status.completed",
  PUBLISHED: "status.active",
  PARTIALLY_COMPLETED: "status.partially_completed",
  ANSWERED: "status.answered",
  IN_PROGRESS: "status.in_progress",
};

const actionKeys: Record<string, TranslationKey> = {
  SUSPEND: "adminSubscriptions.action.suspend",
  REACTIVATE: "adminSubscriptions.action.activate",
  FORCE_LOGOUT: "logout",
  RESET_MFA: "security",
  REQUIRE_MFA: "security",
  ACTIVATE: "adminSubscriptions.action.activate",
  EXTEND: "adminSubscriptions.action.extend",
  CHANGE_PLAN: "adminSubscriptions.action.change_plan",
  CANCEL: "adminSubscriptions.action.cancel",
  MARK_PAID: "adminPayments.approve",
  REJECT: "adminPayments.reject",
  APPROVE_REVIEW: "notifications.admin.approve",
  BLOCK: "adminReleases.blocked",
  ACKNOWLEDGED: "status.in_progress",
  INVESTIGATING: "status.in_progress",
  MITIGATED: "status.resolved",
  RESOLVED: "status.resolved",
  DISMISSED: "adminSubscriptions.dismiss",
};

const priorityKeys: Record<string, TranslationKey> = {
  LOW: "priority.low",
  NORMAL: "priority.normal",
  MEDIUM: "priority.medium",
  HIGH: "priority.high",
  URGENT: "priority.urgent",
  CRITICAL: "notifications.admin.priorityCritical",
};

const paymentMethodKeys: Record<string, TranslationKey> = {
  MANUAL_BANK_TRANSFER: "adminSubscriptions.bankTransfer",
  BANK_TRANSFER: "adminSubscriptions.bankTransfer",
  MANUAL: "adminSubscriptions.manual",
  FREE_PROMO: "adminSubscriptions.freePromo",
  OTHER: "more",
};

const valueKeys: Record<string, TranslationKey> = {
  OWNER: "roleOwner",
  ADMIN: "roleAdmin",
  OPERATOR: "roleOperator",
  VIEWER: "roleViewer",
  MANAGER: "roleManager",
  SUPPORT: "roleSupport",
  USER: "roleUser",
  SUPER_ADMIN: "roleSuperAdmin",
  SERVICE: "adminSystemHealthModule",
  INCIDENT: "notification.category.incident",
  INFO: "notifications",
  LOW: "priority.low",
  MEDIUM: "priority.medium",
  HIGH: "priority.high",
  CRITICAL: "notifications.admin.priorityCritical",
  MONTHLY: "adminSubscriptions.monthly",
  YEARLY: "adminSubscriptions.yearly",
};

const knownNotificationTitles = new Set(
  Object.keys(translations.en).filter((key) =>
    key.startsWith("notification.title."),
  ),
);

const knownNotificationCategories = new Set(
  Object.keys(translations.en).filter((key) =>
    key.startsWith("notification.category."),
  ),
);

function dynamicTranslation(
  locale: Locale,
  key: string,
  fallbackKey: TranslationKey,
) {
  const dictionary = translations[locale] as Record<string, string>;
  return dictionary[key] ?? translate(locale, fallbackKey);
}

export function adminStatusLabel(status: string, locale: Locale) {
  const normalized = status.trim().toUpperCase();
  if (["LOW", "NORMAL", "MEDIUM", "HIGH", "URGENT", "CRITICAL"].includes(normalized)) return adminPriorityLabel(normalized, locale);
  if (normalized === "INFO") return locale === "tr" ? "Bilgi" : "Info";
  if (normalized === "WARNING" || normalized === "WARN") return locale === "tr" ? "Uyarı" : "Warning";
  if (normalized === "ERROR") return translate(locale, "status.failed");
  if (normalized === "SUCCESS" || normalized === "MANUALLY_CONFIRMED") return translate(locale, "status.completed");
  return translate(locale, statusKeys[normalized] ?? "status.unknown");
}

export function adminActionLabel(action: string, locale: Locale) {
  const normalized = action.trim().toUpperCase();
  return translate(locale, actionKeys[normalized] ?? "adminSubscriptions.action");
}

export function adminPriorityLabel(priority: string, locale: Locale) {
  const normalized = priority.trim().toUpperCase();
  return translate(locale, priorityKeys[normalized] ?? "status.unknown");
}

export function adminChannelLabel(channel: string, locale: Locale) {
  const normalized = channel.trim().toLowerCase();
  return dynamicTranslation(
    locale,
    `notification.channel.${normalized}`,
    "notifications.admin.channel",
  );
}

export function adminCategoryLabel(category: string, locale: Locale) {
  const normalized = category.trim().toLowerCase();
  const key = `notification.category.${normalized}`;
  return knownNotificationCategories.has(key)
    ? dynamicTranslation(locale, key, "notifications")
    : translate(locale, "notifications");
}

export function adminAudienceLabel(audience: string, locale: Locale) {
  return translate(
    locale,
    audience.trim().toUpperCase() === "PLATFORM_ALL_USERS"
      ? "notifications.admin.platformAllUsers"
      : "notifications.admin.audience",
  );
}

export function adminEventTypeLabel(eventType: string, locale: Locale) {
  const normalized = eventType.trim();
  const candidates = [
    `notification.title.${normalized}`,
    `notification.title.${normalized.toLowerCase()}`,
    `security.event.${normalized.toUpperCase()}`,
  ];
  const key = candidates.find(
    (candidate) =>
      knownNotificationTitles.has(candidate) ||
      (candidate.startsWith("security.event.") && candidate in translations.en),
  );
  return key
    ? dynamicTranslation(locale, key, "notifications.admin.event")
    : translate(locale, "notifications.admin.event");
}

export function adminPaymentMethodLabel(method: string, locale: Locale) {
  const normalized = method.trim().toUpperCase();
  return translate(
    locale,
    paymentMethodKeys[normalized] ?? "adminSubscriptions.paymentMethod",
  );
}

export function adminBillingPeriodLabel(period: string, locale: Locale) {
  return translate(
    locale,
    period.trim().toUpperCase() === "YEARLY"
      ? "adminSubscriptions.yearly"
      : "adminSubscriptions.monthly",
  );
}

export function adminValueLabel(value: string, locale: Locale) {
  const normalized = value.trim().toUpperCase();
  if (valueKeys[normalized]) return translate(locale, valueKeys[normalized]);
  if (paymentMethodKeys[normalized]) return adminPaymentMethodLabel(normalized, locale);
  if (statusKeys[normalized]) return adminStatusLabel(normalized, locale);
  return value;
}

export function adminBooleanLabel(value: boolean, locale: Locale) {
  return translate(locale, value ? "common.yes" : "common.no");
}
