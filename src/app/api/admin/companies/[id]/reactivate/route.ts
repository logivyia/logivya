import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ reason: z.string().trim().min(5).max(500) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "VALIDATION_ERROR", requestId: id },
        { status: 400 },
      );
    const { user } = await requireCriticalAdminAction(
      request,
      "admin.companies.update",
      parsed.data.reason,
    );
    const { id: companyId } = await params;
    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, securityStatus: true, campaignsPausedAt: true },
    });
    if (!existing)
      return NextResponse.json(
        { error: "NOT_FOUND", requestId: id },
        { status: 404 },
      );
    if (existing.securityStatus === "ACTIVE")
      return NextResponse.json({ ok: true, idempotent: true, requestId: id });

    const company = await prisma.company.update({
      where: { id: companyId },
      data: { securityStatus: "ACTIVE", campaignsPausedAt: null },
      select: { id: true, securityStatus: true, campaignsPausedAt: true },
    });
    await writeAuditLog(request, {
      companyId,
      userId: user.id,
      actorType: "PLATFORM_ADMIN",
      action: "company.admin_reactivated",
      entityType: "Company",
      entityId: companyId,
      reason: parsed.data.reason,
      before: {
        securityStatus: existing.securityStatus,
        campaignsPausedAt: existing.campaignsPausedAt,
      },
      after: {
        securityStatus: company.securityStatus,
        campaignsPausedAt: company.campaignsPausedAt,
      },
      requestId: id,
    });
    return NextResponse.json({ company, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
