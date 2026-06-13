import { prisma } from "@/server/db";
import { emailProvider, type TemplateEmailInput } from "@/server/email/provider";
import { logger } from "@/server/observability/logger";

function currentProviderName() {
  return process.env.EMAIL_PROVIDER || (process.env.SMTP_HOST ? "SMTP" : "UNCONFIGURED");
}

function deliveryErrorCode(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 120);
  return "UNKNOWN_EMAIL_DELIVERY_ERROR";
}

export async function sendTemplateEmailSafely(input: TemplateEmailInput & { companyId?: string; userId?: string }) {
  const provider = currentProviderName();
  const log = await prisma.emailDeliveryLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      template: input.template,
      recipient: input.to,
      provider,
      status: "PENDING",
    },
  });
  try {
    const result = await emailProvider().sendTemplateEmail(input);
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: { status: "SENT", providerId: result.providerId, sentAt: new Date() },
    });
    return { sent: true as const, providerId: result.providerId };
  } catch (error) {
    const errorCode = deliveryErrorCode(error);
    logger.error("Transactional email delivery failed", { provider, template: input.template, errorCode });
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorCode },
    });
    return { sent: false as const, errorCode };
  }
}
