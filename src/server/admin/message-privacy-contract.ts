import { createHash, createHmac } from "node:crypto";

export type AdminCampaignOperationSource = {
  id: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  canceledCount: number;
  createdAt: Date;
};

export type AdminCampaignOperationDto = {
  operationReference: string;
  status: string;
  dateBucket: string;
  total: number;
  succeeded: number;
  failed: number;
  canceled: number;
  errorCategory?: "DELIVERY_FAILURE";
};

export type AdminCampaignMetricsDto = {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  processingOperations: number;
  queuedOperations: number;
};

export type AdminAuditRecordSource = {
  id: string;
  action: string;
  actorType: string;
  actorEmailMasked: string | null;
  result: string;
  entityType: string;
  entityId: string | null;
  clientPlatform: string | null;
  appVersion: string | null;
  createdAt: Date;
  company: { id: string; name: string };
};

export type AdminAuditRecordDto = {
  id: string;
  action: string;
  actor: string;
  actorType: string;
  result: string;
  targetType: string;
  targetId?: string;
  clientPlatform?: string;
  appVersion?: string;
  createdAt: string;
  company: { id: string; name: string };
};

const MESSAGE_OPERATION_PATTERN = /(?:message|campaign|recipient|delivery|contact[_ .-]?sync|group[_ .-]?sync|delete[_ .-]?for[_ .-]?everyone)/i;

export function adminPrivacyReference(scope: string, id: string, secret?: string) {
  const normalized = `${scope}\0${id}`;
  const digest = secret
    ? createHmac("sha256", secret).update(normalized).digest("base64url")
    : createHash("sha256").update(normalized).digest("base64url");
  return `op_${digest.slice(0, 16)}`;
}

export function serializeAdminCampaignOperation(
  source: AdminCampaignOperationSource,
  secret?: string,
): AdminCampaignOperationDto {
  return {
    operationReference: adminPrivacyReference("message-campaign", source.id, secret),
    status: source.status,
    dateBucket: source.createdAt.toISOString().slice(0, 10),
    total: source.totalRecipients,
    succeeded: source.sentCount,
    failed: source.failedCount,
    canceled: source.canceledCount,
    ...(source.failedCount > 0 || source.status === "FAILED" ? { errorCategory: "DELIVERY_FAILURE" as const } : {}),
  };
}

export function isMessageOperationalAudit(action: string, entityType: string) {
  return MESSAGE_OPERATION_PATTERN.test(action) || MESSAGE_OPERATION_PATTERN.test(entityType);
}

export function serializeAdminAuditRecord(source: AdminAuditRecordSource): AdminAuditRecordDto | null {
  if (isMessageOperationalAudit(source.action, source.entityType)) return null;
  return {
    id: source.id,
    action: source.action,
    actor: source.actorEmailMasked ?? source.actorType,
    actorType: source.actorType,
    result: source.result,
    targetType: source.entityType,
    ...(source.entityId ? { targetId: source.entityId } : {}),
    ...(source.clientPlatform ? { clientPlatform: source.clientPlatform } : {}),
    ...(source.appVersion ? { appVersion: source.appVersion } : {}),
    createdAt: source.createdAt.toISOString(),
    company: source.company,
  };
}

export const ADMIN_MESSAGE_PRIVACY_FORBIDDEN_KEYS = [
  "title",
  "content",
  "contentJson",
  "message",
  "body",
  "preview",
  "recipientId",
  "recipientPhone",
  "recipientJid",
  "contactId",
  "contactName",
  "groupId",
  "groupName",
  "groupJid",
  "companyId",
  "companyName",
  "userId",
  "userEmail",
  "createdById",
  "createdBy",
  "scheduledAt",
  "sentAt",
  "deliveredAt",
  "failedAt",
  "beforeState",
  "afterState",
  "metadata",
  "payload",
] as const;
