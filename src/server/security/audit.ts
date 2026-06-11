import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export type ImmutableAuditEntry = {
  companyId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
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
  const metadata = JSON.parse(JSON.stringify({ before: entry.before ?? {}, after: entry.after ?? {} })) as Prisma.InputJsonValue;
  await prisma.auditLog.create({
    data: {
      companyId: entry.companyId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      userAgent: request.headers.get("user-agent"),
    },
  });
}
