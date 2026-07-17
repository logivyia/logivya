import { z } from "zod";
import { requireCriticalAdminAction, requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const createSchema = z.object({
  type: z.string().trim().regex(/^[A-Z0-9_]{3,80}$/),
  version: z.string().trim().min(3).max(80),
  locale: z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  status: z.enum(["DRAFT", "LEGAL_REVIEW_REQUIRED"]).default("LEGAL_REVIEW_REQUIRED"),
  sourcePath: z.string().trim().regex(/^docs\/privacy\/[a-z0-9-]+\.md$/),
  checksumSha256: z.string().trim().regex(/^[a-f0-9]{64}$/).optional(),
  previousVersion: z.string().trim().max(80).optional(),
  changeSummary: z.string().trim().min(5).max(2_000),
  reason: z.string().trim().min(5).max(500),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    const documents = await prisma.privacyLegalDocument.findMany({
      orderBy: [{ type: "asc" }, { locale: "asc" }, { createdAt: "desc" }],
      take: 500,
      select: {
        id: true,
        type: true,
        version: true,
        locale: true,
        status: true,
        sourcePath: true,
        checksumSha256: true,
        effectiveAt: true,
        publishedAt: true,
        reviewedBy: true,
        previousVersion: true,
        changeSummary: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return Response.json({ legalReviewStatus: "LEGAL_REVIEW_REQUIRED", documents, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: safe.status });
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const body = createSchema.parse(await request.json());
    const admin = await requireCriticalAdminAction(request, "admin.privacy.update", body.reason);
    const document = await prisma.privacyLegalDocument.create({
      data: {
        type: body.type,
        version: body.version,
        locale: body.locale,
        status: body.status,
        sourcePath: body.sourcePath,
        checksumSha256: body.checksumSha256,
        previousVersion: body.previousVersion,
        changeSummary: body.changeSummary,
        active: false,
      },
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorEmail: admin.user.email,
      actorType: "PLATFORM_ADMIN",
      action: "admin.privacy.legal_document.draft_created",
      reason: body.reason,
      entityType: "PrivacyLegalDocument",
      entityId: document.id,
      after: { type: document.type, version: document.version, locale: document.locale, status: document.status, active: false },
    });
    return Response.json({ document, legalReviewStatus: "LEGAL_REVIEW_REQUIRED", requestId: id }, { status: 201 });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: error instanceof z.ZodError ? 400 : safe.status });
  }
}
