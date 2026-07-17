import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { PROCESSOR_REGISTER } from "@/server/privacy/catalog";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.privacy.read", request);
    return Response.json({ legalReviewStatus: "LEGAL_REVIEW_REQUIRED", processors: PROCESSOR_REGISTER, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return Response.json(safe.body, { status: safe.status });
  }
}
