import { syncFacebookPages } from "@/server/facebook/accounts";
import { assertFacebookConnectionManager, requireFacebookPagesAccess } from "@/server/facebook/access";
import { facebookSafeError } from "@/server/facebook/response";
import { mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export async function POST(request: Request) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    assertFacebookConnectionManager(auth);
    await enforceOperationRateLimit({
      scope: "facebook.pages.sync",
      subject: `${auth.company.id}:${auth.user.id}`,
      maxAttempts: 10,
      windowMs: 10 * 60_000,
      request,
    });
    const result = await syncFacebookPages(auth.company.id, auth.user.id);
    await writeAuditLog(request, {
      companyId: auth.company.id,
      userId: auth.user.id,
      action: "facebook.pages.synchronized",
      entityType: "ChannelAccount",
      after: result,
    });
    return mobileSuccess(result);
  } catch (error) {
    return facebookSafeError(error);
  }
}
