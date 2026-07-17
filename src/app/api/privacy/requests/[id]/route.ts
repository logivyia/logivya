import { requirePrivacyAuth } from "@/server/privacy/auth";
import { PrivacyError, privacyErrorResponse } from "@/server/privacy/errors";
import { prisma } from "@/server/db";
import { userPrivacyRequestDetailSelect } from "@/server/privacy/serialization";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePrivacyAuth(request);
    const { id } = await context.params;
    const privacyRequest = await prisma.dataSubjectRequest.findFirst({
      where: { publicId: id, userId: auth.user.id, companyId: auth.company.id },
      select: userPrivacyRequestDetailSelect,
    });
    if (!privacyRequest) throw new PrivacyError("PRIVACY_REQUEST_NOT_FOUND", 404);
    return Response.json({ request: privacyRequest });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}
