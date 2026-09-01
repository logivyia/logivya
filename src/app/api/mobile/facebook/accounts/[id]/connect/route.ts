import { connectFacebookPage } from "@/server/facebook/accounts";
import { assertFacebookConnectionManager, requireFacebookPagesAccess } from "@/server/facebook/access";
import { facebookSafeError } from "@/server/facebook/response";
import { mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    assertFacebookConnectionManager(auth);
    const { id } = await context.params;
    const account = await connectFacebookPage(auth.company.id, auth.user.id, id);
    await writeAuditLog(request, {
      companyId: auth.company.id,
      userId: auth.user.id,
      action: "facebook.page.connected",
      entityType: "ChannelAccount",
      entityId: account.id,
    });
    return mobileSuccess({ connected: true, accountId: account.id });
  } catch (error) {
    return facebookSafeError(error);
  }
}
