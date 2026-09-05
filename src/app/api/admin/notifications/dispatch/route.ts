import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";
import {
  drainNotificationOutbox,
  emitNotificationEvent,
  processNotificationAudienceExpansions,
  queueNotificationAudienceEvent,
  type NotificationRecipient,
} from "@/server/notifications/engine";
import { notificationEventDefinition } from "@/server/notifications/registry";
import {
  isSafeNotificationDeepLink,
  isValidNotificationAudienceRequest,
} from "@/server/notifications/policy";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  type: z.string().min(3).max(120),
  idempotencyKey: z.string().min(8).max(240),
  audience: z.enum([
    "USER",
    "COMPANY_USERS",
    "PLATFORM_ADMIN",
    "PLATFORM_ALL_USERS",
  ]),
  companyId: z.string().min(1).optional(),
  userIds: z.array(z.string().min(1)).max(500).optional(),
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2_000),
  deepLink: z.string().max(500).optional(),
  scheduledAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "NOTIFICATION_DISPATCH_INVALID", issues: parsed.error.issues },
        { status: 400 },
      );
    const admin = await requireCriticalAdminAction(
      request,
      "admin.notifications.update",
      parsed.data.reason,
    );
    notificationEventDefinition(parsed.data.type);
    if (
      parsed.data.type === "administration.announcement" &&
      parsed.data.audience === "PLATFORM_ALL_USERS"
    ) {
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_APPROVAL_REQUIRED" },
        { status: 409 },
      );
    }
    if (!isValidNotificationAudienceRequest(parsed.data)) {
      return NextResponse.json(
        { error: "NOTIFICATION_AUDIENCE_INVALID" },
        { status: 400 },
      );
    }
    if (
      parsed.data.deepLink &&
      !isSafeNotificationDeepLink(parsed.data.deepLink)
    ) {
      return NextResponse.json(
        { error: "NOTIFICATION_DEEP_LINK_INVALID" },
        { status: 400 },
      );
    }
    if (parsed.data.audience === "COMPANY_USERS" && !parsed.data.companyId) {
      return NextResponse.json(
        { error: "NOTIFICATION_COMPANY_REQUIRED" },
        { status: 400 },
      );
    }
    const isBulkAudience =
      parsed.data.audience === "COMPANY_USERS" ||
      parsed.data.audience === "PLATFORM_ALL_USERS";
    const recipientCount = isBulkAudience
      ? await prisma.companyUser.count({
          where: {
            status: "ACTIVE",
            ...(parsed.data.companyId
              ? { companyId: parsed.data.companyId }
              : {}),
          },
        })
      : 0;
    const recipients = isBulkAudience
      ? []
      : await resolveRecipients(parsed.data);
    if (!isBulkAudience && !recipients.length)
      return NextResponse.json(
        { error: "NOTIFICATION_RECIPIENT_REQUIRED" },
        { status: 400 },
      );
    const common = {
      type: parsed.data.type,
      idempotencyKey: parsed.data.idempotencyKey,
      content: { title: parsed.data.title, message: parsed.data.message },
      payload: parsed.data.payload,
      companyId: parsed.data.companyId,
      actorUserId: admin.user.id,
      deepLink: parsed.data.deepLink,
      scheduledAt: parsed.data.scheduledAt
        ? new Date(parsed.data.scheduledAt)
        : undefined,
    };
    const result = isBulkAudience
      ? await queueNotificationAudienceEvent({
          ...common,
          audience: parsed.data.audience as
            "COMPANY_USERS" | "PLATFORM_ALL_USERS",
        })
      : await emitNotificationEvent({
          ...common,
          recipients,
          audience: parsed.data.audience,
        });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.event.dispatched",
      reason: parsed.data.reason,
      entityType: "NotificationEvent",
      entityId: result.event.id,
      metadata: {
        eventType: parsed.data.type,
        audience: parsed.data.audience,
        recipientCount: isBulkAudience ? recipientCount : recipients.length,
        duplicate: result.duplicate,
      },
    });
    after(async () => {
      await processNotificationAudienceExpansions(20, 250);
      await drainNotificationOutbox(20, 100);
    });
    return NextResponse.json({
      ok: true,
      eventId: result.event.id,
      duplicate: result.duplicate,
      recipientCount: isBulkAudience ? recipientCount : recipients.length,
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

async function resolveRecipients(
  input: z.infer<typeof schema>,
): Promise<NotificationRecipient[]> {
  if (input.audience === "PLATFORM_ADMIN") {
    const owner = await prisma.user.findUnique({
      where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
      select: {
        id: true,
        memberships: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { companyId: true },
        },
      },
    });
    return owner?.memberships[0]
      ? [{ companyId: owner.memberships[0].companyId, userId: owner.id }]
      : [];
  }
  const memberships = await prisma.companyUser.findMany({
    where: {
      status: "ACTIVE",
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.audience === "USER"
        ? { userId: { in: input.userIds ?? [] } }
        : {}),
    },
    select: { companyId: true, userId: true },
    distinct: ["companyId", "userId"],
    take: 500,
  });
  return memberships;
}
