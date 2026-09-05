import { readMobileJson } from "@/server/mobile/request-json";
import { assertFacebookPublisher, requireFacebookPagesAccess } from "@/server/facebook/access";
import { createFacebookPagePosts, createFacebookPostRequestSchema, listFacebookPagePosts } from "@/server/facebook/posts";
import { facebookSafeError } from "@/server/facebook/response";
import { mobileError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";
import { logger } from "@/server/observability/logger";

export async function GET(request: Request) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    const take = Number(new URL(request.url).searchParams.get("take") || 50);
    return mobileSuccess({ items: await listFacebookPagePosts(auth.company.id, auth.user.id, take) });
  } catch (error) {
    return facebookSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireFacebookPagesAccess(request);
    assertFacebookPublisher(auth);
    await enforceOperationRateLimit({
      scope: "facebook.pages.publish",
      subject: `${auth.company.id}:${auth.user.id}`,
      maxAttempts: 30,
      windowMs: 60_000,
      request,
    });
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = createFacebookPostRequestSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const rawIdempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
    if (rawIdempotencyKey && rawIdempotencyKey.length > 200) {
      return mobileError("VALIDATION_ERROR", "Idempotency-Key en fazla 200 karakter olabilir.", { status: 400 });
    }
    const posts = await createFacebookPagePosts({
      companyId: auth.company.id,
      userId: auth.user.id,
      data: parsed.data,
      idempotencyKey: rawIdempotencyKey,
    });
    await writeAuditLog(request, {
      companyId: auth.company.id,
      userId: auth.user.id,
      action: "facebook.page.post.queued",
      entityType: "ChannelMessage",
      entityId: posts[0]?.id,
      after: {
        pageAccountIds: [...new Set([...(parsed.data.pageAccountId ? [parsed.data.pageAccountId] : []), ...parsed.data.pageAccountIds])],
        queuedMessageIds: posts.map((post) => post.id),
        scheduled: Boolean(parsed.data.scheduledAt),
        mediaCount: parsed.data.mediaFileIds.length,
      },
    }).catch((error) => logger.error("facebook.post_audit_failed", error, { messageIds: posts.map((post) => post.id) }));
    return mobileSuccess({ post: posts[0], posts, queued: true }, { status: 202 });
  } catch (error) {
    return facebookSafeError(error);
  }
}
