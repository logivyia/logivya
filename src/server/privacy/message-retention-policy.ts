export const MESSAGE_PRIVACY_RETENTION_POLICY = {
  customerHistory: {
    scope: "TENANT_ONLY",
    period: "ACCOUNT_LIFECYCLE_PENDING_LEGAL_APPROVAL",
    contentAllowed: true,
    adminAccessible: false,
    deletionGate: "CUSTOMER_REQUEST_OR_APPROVED_RETENTION_RUN_WITH_LEGAL_HOLD_CHECK",
  },
  deliveryQueue: {
    completedSeconds: 3_600,
    terminalFailureSeconds: 86_400,
    contentAllowed: "TRANSIENT_MINIMUM_ONLY",
    adminAccessible: false,
  },
  deadLetterQueue: {
    completedSeconds: 86_400,
    terminalFailureSeconds: 7 * 86_400,
    contentAllowed: false,
    adminAccessible: false,
  },
  rawWhatsappAndWebhookPayloads: {
    period: "DO_NOT_PERSIST_FOR_ADMIN_OR_ANALYTICS",
    contentAllowed: false,
    adminAccessible: false,
  },
  adminAnalytics: {
    period: "AGGREGATE_ONLY_PENDING_LEGAL_APPROVAL",
    contentAllowed: false,
    recipientLinkageAllowed: false,
  },
  temporaryExports: {
    periodDays: 7,
    contentAllowed: "CUSTOMER_SCOPED_EXPORT_ONLY",
    adminMessageExportAllowed: false,
  },
  logs: {
    period: "OBSERVABILITY_RETENTION_CONFIGURATION",
    contentAllowed: false,
    phoneAllowed: false,
    recipientLinkageAllowed: false,
  },
} as const;

export function assertQueueRetentionMatchesPolicy(options: {
  completedAge: number;
  failedAge: number;
}) {
  return options.completedAge === MESSAGE_PRIVACY_RETENTION_POLICY.deliveryQueue.completedSeconds
    && options.failedAge === MESSAGE_PRIVACY_RETENTION_POLICY.deliveryQueue.terminalFailureSeconds;
}
