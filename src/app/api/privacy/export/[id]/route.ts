import { requirePrivacyAuth } from "@/server/privacy/auth";
import { PrivacyError, privacyErrorResponse } from "@/server/privacy/errors";
import { prisma } from "@/server/db";
import { userPrivacyExportSelect } from "@/server/privacy/serialization";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePrivacyAuth(request);
    const { id } = await context.params;
    const job = await prisma.privacyExportJob.findFirst({
      where: { publicId: id, companyId: auth.company.id, userId: auth.user.id },
      select: userPrivacyExportSelect,
    });
    if (!job) throw new PrivacyError("PRIVACY_EXPORT_NOT_FOUND", 404);
    return Response.json({ job: { ...job, sizeBytes: job.sizeBytes?.toString() ?? null } });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
