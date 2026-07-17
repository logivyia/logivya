import { z } from "zod";
import { requireCriticalAdminAction, requirePlatformAdmin } from "@/server/auth/platform-admin";
import { RETENTION_CATALOG } from "@/server/privacy/catalog";
import { runPrivacyRetention } from "@/server/privacy/retention";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const schema = z.object({ dryRun: z.boolean().default(true), reason: z.string().trim().min(5).max(500) });

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const runs = await prisma.privacyRetentionRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 });
    return Response.json({ catalog: RETENTION_CATALOG, enforcementEnabled: process.env.PRIVACY_RETENTION_ENFORCEMENT === "true", runs, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: safe.status });
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const body = schema.parse(await request.json());
    const admin = await requireCriticalAdminAction(request, "admin.privacy.update", body.reason);
    if (!body.dryRun && process.env.PRIVACY_RETENTION_ENFORCEMENT !== "true") return Response.json({ error: "PRIVACY_RETENTION_ENFORCEMENT_DISABLED", requestId: id }, { status: 409 });
    const result = await runPrivacyRetention({ dryRun: body.dryRun, initiatedByUserId: admin.user.id });
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorEmail: admin.user.email, actorType: "PLATFORM_ADMIN", action: "admin.privacy.retention.run", reason: body.reason, entityType: "PrivacyRetentionRun", entityId: result.id, after: { dryRun: result.dryRun, counts: result.counts } });
    return Response.json({ result, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
