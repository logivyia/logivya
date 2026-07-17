import { z } from "zod";
import { assertPrivacyMutationCsrf, requirePrivacyAuth, requirePrivacyPassword } from "@/server/privacy/auth";
import { PrivacyError, privacyErrorResponse } from "@/server/privacy/errors";
import { cancelDeletionRequest, queueDeletionRequest } from "@/server/privacy/requests";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";

const createSchema = z.object({
  scope: z.enum(["USER", "COMPANY"]).default("USER"),
  confirmation: z.enum(["LOGIVYA HESABIMI SIL", "DELETE MY LOGIVYA ACCOUNT", "LOGIVYA SIRKETIMI SIL", "DELETE MY LOGIVYA COMPANY"]),
  reason: z.string().trim().max(500).optional(),
  password: z.string().min(1).max(256),
});
const cancelSchema = z.object({ publicId: z.string().trim().min(8).max(80), password: z.string().min(1).max(256) });

export async function GET(request: Request) {
  try {
    const auth = await requirePrivacyAuth(request);
    const jobs = await prisma.privacyDeletionJob.findMany({ where: { companyId: auth.company.id, userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 20 });
    return Response.json({ destructiveExecutionEnabled: false, legalReviewStatus: "LEGAL_REVIEW_REQUIRED", jobs });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertPrivacyMutationCsrf(request);
    const auth = await requirePrivacyAuth(request);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new PrivacyError("VALIDATION_INVALID", 400);
    const companyConfirmation = ["LOGIVYA SIRKETIMI SIL", "DELETE MY LOGIVYA COMPANY"].includes(parsed.data.confirmation);
    if ((parsed.data.scope === "COMPANY") !== companyConfirmation) throw new PrivacyError("DELETION_CONFIRMATION_MISMATCH", 400);
    await requirePrivacyPassword(auth.user, parsed.data.password);
    const job = await queueDeletionRequest({ companyId: auth.company.id, userId: auth.user.id, scope: parsed.data.scope, owner: auth.membership.role === "OWNER", reason: parsed.data.reason });
    await writeAuditLog(request, { companyId: auth.company.id, userId: auth.user.id, actorEmail: auth.user.email, action: "privacy.deletion.queued", entityType: "PrivacyDeletionJob", entityId: job.id, after: { publicId: job.publicId, scope: job.scope, status: job.status } });
    return Response.json({ job, destructiveExecutionEnabled: false }, { status: 202 });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertPrivacyMutationCsrf(request);
    const auth = await requirePrivacyAuth(request);
    const parsed = cancelSchema.safeParse(await request.json());
    if (!parsed.success) throw new PrivacyError("VALIDATION_INVALID", 400);
    await requirePrivacyPassword(auth.user, parsed.data.password);
    const job = await cancelDeletionRequest({ companyId: auth.company.id, userId: auth.user.id, publicId: parsed.data.publicId });
    await writeAuditLog(request, { companyId: auth.company.id, userId: auth.user.id, actorEmail: auth.user.email, action: "privacy.deletion.canceled", entityType: "PrivacyDeletionJob", entityId: job.id, after: { publicId: job.publicId, status: job.status } });
    return Response.json({ job });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
