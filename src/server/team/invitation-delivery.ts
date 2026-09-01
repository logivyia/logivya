import type { Prisma } from "@prisma/client";

import { translateForLocale } from "@/i18n/server";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import { logger } from "@/server/observability/logger";
import { decryptPrivateValue, encryptPrivateValue } from "@/server/security/private-fields";

const MAX_DELIVERY_ATTEMPTS = 5;
const PROCESSING_TIMEOUT_MS = 10 * 60_000;

function deliveryError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "INVITATION_DELIVERY_FAILED";
}

export function queueInvitationDelivery(
  tx: Prisma.TransactionClient,
  input: { invitationId: string; recipient: string; appBaseUrl: string; token: string; locale: string; eventKey: string },
) {
  return tx.invitationDeliveryOutbox.create({
    data: {
      invitationId: input.invitationId,
      recipient: input.recipient,
      appBaseUrl: input.appBaseUrl,
      tokenEncrypted: encryptPrivateValue(input.token),
      locale: input.locale,
      eventKey: input.eventKey,
    },
  });
}

export async function processInvitationDelivery(outboxId: string) {
  const now = new Date();
  const claimed = await prisma.invitationDeliveryOutbox.updateMany({
    where: {
      id: outboxId,
      status: { in: ["PENDING", "FAILED"] },
      availableAt: { lte: now },
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
      tokenEncrypted: { not: null },
    },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
  if (!claimed.count) return { sent: false as const, skipped: true as const };

  const row = await prisma.invitationDeliveryOutbox.findUnique({
    where: { id: outboxId },
    include: {
      invitation: {
        select: {
          id: true,
          companyId: true,
          invitedByUserId: true,
          email: true,
          name: true,
          status: true,
          expiresAt: true,
          company: { select: { name: true } },
          invitedBy: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!row?.tokenEncrypted || row.invitation.status !== "PENDING" || row.invitation.expiresAt <= now) {
    await prisma.invitationDeliveryOutbox.update({ where: { id: outboxId }, data: { status: "FAILED", lastError: "INVITATION_NOT_DELIVERABLE", tokenEncrypted: null } });
    return { sent: false as const, skipped: true as const };
  }

  try {
    const token = decryptPrivateValue(row.tokenEncrypted);
    const acceptUrl = `${row.appBaseUrl}/register?invitation=${encodeURIComponent(token)}`;
    const expiresAt = new Intl.DateTimeFormat(row.locale || "tr", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/Istanbul",
    }).format(row.invitation.expiresAt);
    const [title, message] = await Promise.all([
      translateForLocale(row.locale, "email.teamInvitation.subject"),
      translateForLocale(row.locale, "email.teamInvitation.linkMessage", {
        name: row.invitation.name,
        inviter: row.invitation.invitedBy.name || row.invitation.invitedBy.email,
        workspace: row.invitation.company.name,
        expiresAt,
        url: acceptUrl,
      }),
    ]);
    const delivery = await sendTemplateEmailSafely({
      companyId: row.invitation.companyId,
      userId: row.invitation.invitedByUserId,
      to: row.recipient,
      template: "team_invitation",
      variables: { title, message, locale: row.locale },
    });
    if (!delivery.sent) throw new Error(delivery.errorCode);

    await prisma.$transaction([
      prisma.invitationDeliveryOutbox.update({
        where: { id: outboxId },
        data: { status: "SENT", deliveredAt: new Date(), lastError: null, tokenEncrypted: null },
      }),
      prisma.companyInvitation.update({ where: { id: row.invitation.id }, data: { sentAt: new Date() } }),
    ]);
    logger.info("company.invitation.delivery_succeeded", {
      outboxId,
      invitationId: row.invitation.id,
      companyId: row.invitation.companyId,
      userId: row.invitation.invitedByUserId,
      attempts: row.attempts,
    });
    return { sent: true as const, acceptUrl };
  } catch (error) {
    const attempts = row.attempts;
    const terminal = attempts >= MAX_DELIVERY_ATTEMPTS;
    const delay = Math.min(6 * 60 * 60_000, 2 ** Math.max(0, attempts - 1) * 60_000);
    await prisma.invitationDeliveryOutbox.update({
      where: { id: outboxId },
      data: {
        status: "FAILED",
        lastError: deliveryError(error),
        availableAt: terminal ? new Date("9999-12-31T23:59:59.999Z") : new Date(Date.now() + delay),
      },
    });
    logger.error("company.invitation.delivery_failed", error, {
      outboxId,
      invitationId: row.invitation.id,
      companyId: row.invitation.companyId,
      userId: row.invitation.invitedByUserId,
      attempts,
    });
    return { sent: false as const, errorCode: deliveryError(error) };
  }
}

export async function drainInvitationDeliveryOutbox(limit = 25) {
  const now = new Date();
  await prisma.invitationDeliveryOutbox.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) } },
    data: { status: "FAILED", availableAt: now, lastError: "PROCESSING_TIMEOUT_RECOVERED" },
  });
  const rows = await prisma.invitationDeliveryOutbox.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: now }, attempts: { lt: MAX_DELIVERY_ATTEMPTS } },
    select: { id: true },
    orderBy: { availableAt: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
  });
  const results = [];
  for (const row of rows) results.push(await processInvitationDelivery(row.id));
  return { processed: rows.length, sent: results.filter((result) => result.sent).length };
}
