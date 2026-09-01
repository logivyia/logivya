import { CompanyRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { listFacebookPages } from "@/server/facebook/accounts";
import { createFacebookPagePosts, createFacebookPostRequestSchema, listFacebookPagePosts } from "@/server/facebook/posts";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { requireWebFacebookAccess } from "@/server/web/communication-access";
import { webCommunicationSafeError, webCommunicationValidationError } from "@/server/web/communication-response";

export const dynamic = "force-dynamic";

function boundedTake(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : fallback;
}

export async function GET(request: Request) {
  try {
    const { user, company } = await requireWebFacebookAccess();
    const take = boundedTake(new URL(request.url).searchParams.get("take"), 50);
    const [pages, history] = await Promise.all([
      listFacebookPages(company.id, user.id),
      listFacebookPagePosts(company.id, user.id, take),
    ]);
    return NextResponse.json({ ok: true, pages, history });
  } catch (error) {
    return webCommunicationSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireWebFacebookAccess();
    if (context.membership.role === CompanyRole.VIEWER) throw new Error("Missing permission: facebook.pages.publish");
    await enforceOperationRateLimit({
      scope: "facebook.pages.publish",
      subject: `${context.company.id}:${context.user.id}`,
      maxAttempts: 30,
      windowMs: 60_000,
      request,
    });
    const parsed = createFacebookPostRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return webCommunicationValidationError(parsed.error.issues);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
    if (idempotencyKey && idempotencyKey.length > 200) {
      return webCommunicationValidationError([{ path: ["idempotency-key"], message: "En fazla 200 karakter olabilir." }]);
    }

    const posts = await createFacebookPagePosts({
      companyId: context.company.id,
      userId: context.user.id,
      data: parsed.data,
      idempotencyKey,
    });
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "facebook.page.post.queued",
      entityType: "ChannelMessage",
      entityId: posts[0]?.id,
      after: {
        source: "WEB",
        pageAccountIds: [...new Set([...(parsed.data.pageAccountId ? [parsed.data.pageAccountId] : []), ...parsed.data.pageAccountIds])],
        queuedMessageIds: posts.map((post) => post.id),
        scheduled: Boolean(parsed.data.scheduledAt),
        mediaCount: parsed.data.mediaFileIds.length,
      },
    }).catch((auditError) => logger.error("facebook.web_post_audit_failed", auditError, { messageIds: posts.map((post) => post.id) }));

    return NextResponse.json({ ok: true, posts, queued: true }, { status: 202 });
  } catch (error) {
    return webCommunicationSafeError(error);
  }
}
