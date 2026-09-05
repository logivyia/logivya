import { disconnectFacebookPage } from "@/server/facebook/accounts";
import { assertFacebookConnectionManager, requireFacebookPagesAccess } from "@/server/facebook/access";
import { facebookSafeError } from "@/server/facebook/response";
import { mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    assertFacebookConnectionManager(auth);
    const { id } = await context.params;
    const result = await disconnectFacebookPage(auth.company.id, auth.user.id, id);
    await writeAuditLog(request, {
      companyId: auth.company.id,
      userId: auth.user.id,
      action: "facebook.page.disconnected",
      entityType: "ChannelAccount",
      entityId: id,
    });
    return mobileSuccess(result);
  } catch (error) {
    return facebookSafeError(error);
  }
}
