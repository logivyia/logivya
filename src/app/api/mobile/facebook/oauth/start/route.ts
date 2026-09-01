import { assertFacebookConnectionManager, requireFacebookPagesAccess } from "@/server/facebook/access";
import { createFacebookAuthorizationUrl } from "@/server/facebook/oauth";
import { facebookSafeError } from "@/server/facebook/response";
import { mobileSuccess } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    assertFacebookConnectionManager(auth);
    await enforceOperationRateLimit({
      scope: "facebook.oauth.start",
      subject: `${auth.company.id}:${auth.user.id}`,
      maxAttempts: 10,
      windowMs: 10 * 60_000,
      request,
    });
    const authorizationUrl = await createFacebookAuthorizationUrl(auth);
    await writeAuditLog(request, {
      companyId: auth.company.id,
      userId: auth.user.id,
      action: "facebook.oauth.started",
      entityType: "FacebookOAuthTransaction",
    });
    return mobileSuccess({ authorizationUrl });
  } catch (error) {
    return facebookSafeError(error);
  }
}
