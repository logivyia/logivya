import { z } from "zod";
import { assertPrivacyMutationCsrf, requirePrivacyAuth, requirePrivacyPassword } from "@/server/privacy/auth";
import { PrivacyError, privacyErrorResponse } from "@/server/privacy/errors";
import { queuePrivacyExport } from "@/server/privacy/export";
import { writeAuditLog } from "@/server/security/audit";
import { prisma } from "@/server/db";
import { userPrivacyExportSelect } from "@/server/privacy/serialization";

const schema = z.object({ password: z.string().min(1).max(256) });

export async function GET(request: Request) {
  try {
    const auth = await requirePrivacyAuth(request);
    const jobs = await prisma.privacyExportJob.findMany({
      where: { companyId: auth.company.id, userId: auth.user.id },
      select: userPrivacyExportSelect,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return Response.json({ jobs: jobs.map((job) => ({ ...job, sizeBytes: job.sizeBytes?.toString() ?? null })) });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePrivacyAuth(request);
    assertPrivacyMutationCsrf(request, auth.authSource);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PrivacyError("VALIDATION_INVALID", 400);
    await requirePrivacyPassword(auth.user, parsed.data.password);
    const result = await queuePrivacyExport({ companyId: auth.company.id, userId: auth.user.id });
    await writeAuditLog(request, { companyId: auth.company.id, userId: auth.user.id, actorEmail: auth.user.email, action: "privacy.export.queued", entityType: "PrivacyExportJob", entityId: result.job.id, after: { publicId: result.job.publicId, status: result.job.status } });
    return Response.json({
      job: { publicId: result.job.publicId, status: result.job.status, expiresAt: result.job.expiresAt, createdAt: result.job.createdAt },
      oneTimeDownloadToken: result.downloadToken,
      tokenHandling: "Store only in authenticated client memory or protected device storage. It cannot be recovered.",
    }, { status: 202 });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
