import { assertFacebookPublisher, requireFacebookPagesAccess } from "@/server/facebook/access";
import { deleteFacebookPagePost } from "@/server/facebook/posts";
import { facebookSafeError } from "@/server/facebook/response";
import { mobileSuccess } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    assertFacebookPublisher(auth);
    const { id } = await context.params;
    await enforceOperationRateLimit({
      scope: "facebook.pages.delete",
      subject: `${auth.company.id}:${auth.user.id}`,
      maxAttempts: 20,
      windowMs: 60_000,
      request,
    });
    const result = await deleteFacebookPagePost(auth.company.id, auth.user.id, id);
    await writeAuditLog(request, {
      companyId: auth.company.id,
      userId: auth.user.id,
      action: "facebook.page.post.deleted",
      entityType: "ChannelMessage",
      entityId: id,
    });
    return mobileSuccess(result);
  } catch (error) {
    return facebookSafeError(error);
  }
}
