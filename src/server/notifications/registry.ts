import type { NotificationAudience, NotificationCategory, NotificationChannel, NotificationPriority } from "@prisma/client";

export type NotificationEventDefinition = {
  category: NotificationCategory;
  audience: NotificationAudience;
  priority: NotificationPriority;
  defaultChannels: NotificationChannel[];
  mandatoryChannels: NotificationChannel[];
  requiredVariables: string[];
};

const inApp = ["IN_APP"] satisfies NotificationChannel[];
const accountChannels = ["IN_APP", "EMAIL", "ANDROID_PUSH", "IOS_PUSH", "WEB_PUSH"] satisfies NotificationChannel[];
const operationalChannels = ["IN_APP", "ANDROID_PUSH", "IOS_PUSH", "WEB_PUSH"] satisfies NotificationChannel[];

export const NOTIFICATION_EVENT_REGISTRY = {
  "account.welcome": event("ACCOUNT", "NORMAL", accountChannels, ["IN_APP", "EMAIL"]),
  "account.registered": event("ACCOUNT", "NORMAL", accountChannels, ["IN_APP", "EMAIL"]),
  "account.email_verification_requested": event("ACCOUNT", "HIGH", accountChannels, ["EMAIL"]),
  "account.email_verified": event("ACCOUNT", "NORMAL", inApp),
  "account.password_reset_requested": event("SECURITY", "CRITICAL", accountChannels, ["EMAIL"]),
  "account.password_changed": event("SECURITY", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "account.new_device_login": event("SECURITY", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "account.failed_login_threshold": event("SECURITY", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "account.mfa_enabled": event("SECURITY", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "account.mfa_disabled": event("SECURITY", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "account.mfa_recovery_code_used": event("SECURITY", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "account.suspicious_login": event("SECURITY", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "account.locked": event("SECURITY", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "invitation.created": event("INVITATION", "HIGH", accountChannels, ["EMAIL"], ["invitationUrl"]),
  "invitation.resent": event("INVITATION", "HIGH", accountChannels, ["EMAIL"], ["invitationUrl"]),
  "invitation.accepted": event("INVITATION", "NORMAL", inApp),
  "invitation.expiring": event("INVITATION", "HIGH", accountChannels),
  "invitation.expired": event("INVITATION", "NORMAL", inApp),
  "invitation.cancelled": event("INVITATION", "NORMAL", inApp),
  "membership.removed": event("ACCOUNT", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "membership.suspended": event("ACCOUNT", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "membership.reactivated": event("ACCOUNT", "NORMAL", accountChannels),
  "trial.started": event("SUBSCRIPTION", "NORMAL", accountChannels),
  "trial.ending": event("SUBSCRIPTION", "HIGH", accountChannels),
  "trial.expired": event("SUBSCRIPTION", "HIGH", accountChannels),
  "trial.ineligible": event("SUBSCRIPTION", "NORMAL", inApp),
  "subscription.activated": event("SUBSCRIPTION", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "subscription.upgraded": event("SUBSCRIPTION", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "subscription.downgraded": event("SUBSCRIPTION", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "subscription.renewed": event("SUBSCRIPTION", "NORMAL", accountChannels),
  "subscription.cancelled": event("SUBSCRIPTION", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "subscription.reactivated": event("SUBSCRIPTION", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "subscription.expiring": event("SUBSCRIPTION", "HIGH", accountChannels),
  "subscription.expired": event("SUBSCRIPTION", "HIGH", accountChannels),
  "payment.received": event("BILLING", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "payment.failed": event("BILLING", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "payment.pending": event("BILLING", "NORMAL", inApp),
  "payment.refunded": event("BILLING", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "invoice.created": event("BILLING", "NORMAL", accountChannels),
  "invoice.overdue": event("BILLING", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "support.ticket_created": event("SUPPORT", "NORMAL", operationalChannels),
  "support.admin_replied": event("SUPPORT", "HIGH", accountChannels),
  "support.user_replied": event("SUPPORT", "HIGH", operationalChannels),
  "support.status_changed": event("SUPPORT", "NORMAL", operationalChannels),
  "support.resolved": event("SUPPORT", "NORMAL", operationalChannels),
  "support.closed": event("SUPPORT", "NORMAL", operationalChannels),
  "whatsapp.connected": event("WHATSAPP", "NORMAL", operationalChannels),
  "whatsapp.disconnected": event("WHATSAPP", "HIGH", operationalChannels),
  "whatsapp.qr_expired": event("WHATSAPP", "HIGH", operationalChannels),
  "whatsapp.session_restored": event("WHATSAPP", "NORMAL", inApp),
  "whatsapp.reconnecting": event("WHATSAPP", "LOW", inApp),
  "whatsapp.reconnected": event("WHATSAPP", "NORMAL", operationalChannels),
  "whatsapp.auth_required": event("WHATSAPP", "CRITICAL", operationalChannels, ["IN_APP"]),
  "whatsapp.logged_out": event("WHATSAPP", "CRITICAL", operationalChannels, ["IN_APP"]),
  "whatsapp.connection_degraded": event("WHATSAPP", "HIGH", operationalChannels),
  "whatsapp.group_sync_completed": event("WHATSAPP", "NORMAL", inApp),
  "whatsapp.contact_sync_completed": event("WHATSAPP", "NORMAL", inApp),
  "whatsapp.sync_failed": event("WHATSAPP", "HIGH", operationalChannels),
  "message.queued": event("MESSAGE", "LOW", inApp),
  "message.sent": event("MESSAGE", "NORMAL", inApp),
  "message.partial": event("MESSAGE", "HIGH", operationalChannels),
  "message.failed": event("MESSAGE", "HIGH", operationalChannels),
  "message.scheduled": event("MESSAGE", "NORMAL", inApp),
  "message.repeat_completed": event("MESSAGE", "NORMAL", inApp),
  "message.campaign_queued": event("MESSAGE", "LOW", inApp),
  "message.campaign_started": event("MESSAGE", "LOW", inApp),
  "message.campaign_completed": event("MESSAGE", "NORMAL", operationalChannels),
  "message.campaign_partial": event("MESSAGE", "HIGH", operationalChannels),
  "message.campaign_failed": event("MESSAGE", "HIGH", operationalChannels),
  "message.schedule_failed": event("MESSAGE", "HIGH", operationalChannels),
  "message.recurring_paused": event("MESSAGE", "HIGH", operationalChannels),
  "message.delete_for_everyone_completed": event("MESSAGE", "NORMAL", inApp),
  "message.delete_for_everyone_partial": event("MESSAGE", "HIGH", operationalChannels),
  "message.delete_for_everyone_failed": event("MESSAGE", "HIGH", operationalChannels),
  "marketplace.request_match_found": event("MARKETPLACE", "HIGH", operationalChannels),
  "system.maintenance": event("SYSTEM", "HIGH", accountChannels, ["IN_APP"]),
  "system.maintenance_scheduled": event("SYSTEM", "HIGH", accountChannels, ["IN_APP"]),
  "system.maintenance_started": event("SYSTEM", "HIGH", accountChannels, ["IN_APP"]),
  "system.maintenance_completed": event("SYSTEM", "NORMAL", operationalChannels),
  "system.incident": event("INCIDENT", "CRITICAL", accountChannels, ["IN_APP"]),
  "system.incident_created": event("INCIDENT", "CRITICAL", accountChannels, ["IN_APP"]),
  "system.incident_resolved": event("INCIDENT", "NORMAL", operationalChannels),
  "system.recovered": event("INCIDENT", "NORMAL", operationalChannels),
  "system.announcement": event("ADMINISTRATION", "NORMAL", operationalChannels, ["IN_APP"], [], "PLATFORM_ALL_USERS"),
  "backup.completed": event("BACKUP", "NORMAL", inApp, [], [], "PLATFORM_ADMIN"),
  "backup.succeeded": event("BACKUP", "NORMAL", inApp, [], [], "PLATFORM_ADMIN"),
  "backup.failed": event("BACKUP", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"], [], "PLATFORM_ADMIN"),
  "backup.restore_test_failed": event("BACKUP", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"], [], "PLATFORM_ADMIN"),
  "privacy.request_received": event("COMPLIANCE", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "privacy.request_completed": event("COMPLIANCE", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "privacy.request_updated": event("COMPLIANCE", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "privacy.data_export_ready": event("COMPLIANCE", "HIGH", accountChannels, ["IN_APP", "EMAIL"]),
  "privacy.data_export_expired": event("COMPLIANCE", "NORMAL", inApp),
  "privacy.data_deletion_started": event("COMPLIANCE", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "privacy.deletion_scheduled": event("COMPLIANCE", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "privacy.deletion_completed": event("COMPLIANCE", "CRITICAL", accountChannels, ["IN_APP", "EMAIL"]),
  "administration.announcement": event("ADMINISTRATION", "NORMAL", operationalChannels, ["IN_APP"], [], "PLATFORM_ALL_USERS"),
  "marketing.campaign": event("MARKETING", "LOW", inApp),
} as const satisfies Record<string, NotificationEventDefinition>;

export type CanonicalNotificationEventType = keyof typeof NOTIFICATION_EVENT_REGISTRY;

export function notificationEventDefinition(type: string): NotificationEventDefinition {
  const definition = NOTIFICATION_EVENT_REGISTRY[type as CanonicalNotificationEventType];
  if (!definition) throw new Error("NOTIFICATION_EVENT_TYPE_UNREGISTERED");
  return definition;
}

export function isMandatoryNotificationChannel(type: string, channel: NotificationChannel) {
  return notificationEventDefinition(type).mandatoryChannels.includes(channel);
}

function event(
  category: NotificationCategory,
  priority: NotificationPriority,
  defaultChannels: NotificationChannel[],
  mandatoryChannels: NotificationChannel[] = [],
  requiredVariables: string[] = [],
  audience: NotificationAudience = "USER",
): NotificationEventDefinition {
  return { category, priority, defaultChannels, mandatoryChannels, requiredVariables, audience };
}
