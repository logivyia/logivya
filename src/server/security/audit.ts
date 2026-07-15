import { Prisma } from "@prisma/client";
import { canonicalAuditAction, maskEmail, sanitizeLogMetadata, sanitizeLogText, type ActorType, type AuditResult } from "@logivya/logging";
import { prisma } from "@/server/db";
import { requestObservabilityIds } from "@/server/observability/request-id";
import { requestNetworkSummary, safeState } from "@/server/observability/privacy";

export type ImmutableAuditEntry = {
  companyId: string;
  userId?: string;
  actorType?: ActorType;
  actorEmail?: string;
  action: string;
  result?: AuditResult;
  reason?: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  correlationId?: string;
  requestId?: string;
  clientPlatform?: string;
  appVersion?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};
export interface ImmutableAuditRepository {
  append(entry: ImmutableAuditEntry): Promise<void>;
}
export class AuditService {
  constructor(private readonly repository: ImmutableAuditRepository) {}
  record(entry: ImmutableAuditEntry) { return this.repository.append(entry); }
}

export async function writeAuditLog(request: Request, entry: Omit<ImmutableAuditEntry, "ipAddress" | "userAgent">) {
  const ids = requestObservabilityIds(request);
  const beforeState = safeState(entry.before);
  const afterState = safeState(entry.after);
  const network = requestNetworkSummary(request);
  const metadata = sanitizeLogMetadata(entry.metadata) as Prisma.InputJsonValue;
  await prisma.auditLog.create({
    data: {
      companyId: entry.companyId,
      userId: entry.userId,
      actorType: entry.actorType ?? "USER",
      actorEmailMasked: maskEmail(entry.actorEmail),
      action: canonicalAuditAction(entry.action),
      result: entry.result ?? "SUCCESS",
      reason: entry.reason ? String(sanitizeLogMetadata({ reason: entry.reason }).reason ?? "").slice(0, 500) : undefined,
      entityType: sanitizeLogText(entry.entityType, 120),
      entityId: entry.entityId ? sanitizeLogText(entry.entityId, 200) : undefined,
      requestId: entry.requestId ?? ids.requestId,
      correlationId: entry.correlationId ?? ids.correlationId,
      clientPlatform: sanitizeLogText(entry.clientPlatform ?? request.headers.get("x-client-platform") ?? "web", 80),
      appVersion: sanitizeLogText(entry.appVersion ?? request.headers.get("x-logivya-app-version") ?? "unknown", 80),
      releaseVersion: process.env.LOG_RELEASE_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT,
      beforeState: beforeState as Prisma.InputJsonValue,
      afterState: afterState as Prisma.InputJsonValue,
      metadata,
      ipAddress: network.ipAddressMasked,
      ipAddressMasked: network.ipAddressMasked,
      userAgent: network.userAgentSummary,
      userAgentSummary: network.userAgentSummary,
    },
  });
}
