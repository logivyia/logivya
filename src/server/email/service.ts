import { prisma } from "@/server/db";
import { emailProvider, type TemplateEmailInput } from "@/server/email/provider";
import { getSmtpDiagnostics, verifySmtpConnection } from "@/lib/email/send-email";
import { logger } from "@/server/observability/logger";

function currentProviderName() {
  return process.env.EMAIL_PROVIDER || "SMTP";
}

function deliveryErrorCode(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 120);
  return "UNKNOWN_EMAIL_DELIVERY_ERROR";
}

export async function sendTemplateEmailSafely(input: TemplateEmailInput & { companyId?: string; userId?: string }) {
  const provider = currentProviderName();
  const smtpDiagnostics = provider.toUpperCase() === "SMTP" ? getSmtpDiagnostics() : undefined;
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

  if (smtpDiagnostics && !smtpDiagnostics.configured) {
    const errorCode = "SMTP_CONFIGURATION_MISSING";
    logger.error("SMTP configuration missing", undefined, {
      template: input.template,
      missing: smtpDiagnostics.missing,
      emailDeliveryLogId: log.id,
    });
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorCode },
    });
    return { sent: false as const, errorCode, missing: smtpDiagnostics.missing };
  }

  try {
    if (smtpDiagnostics) {
      logger.info("SMTP connection verification started", { template: input.template, emailDeliveryLogId: log.id });
      const verification = await verifySmtpConnection();
      if (!verification.ok) {
        const errorCode = verification.errorCode || "SMTP_VERIFY_FAILED";
        logger.error("SMTP connection verification failed", undefined, {
          template: input.template,
          emailDeliveryLogId: log.id,
          errorCode,
        });
        await prisma.emailDeliveryLog.update({
          where: { id: log.id },
          data: { status: "FAILED", errorCode },
        });
        return { sent: false as const, errorCode };
      }
    }

    logger.info("Transactional email send attempted", { provider, template: input.template, emailDeliveryLogId: log.id });
    const result = await emailProvider().sendTemplateEmail(input);
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: { status: "SENT", providerId: result.providerId, sentAt: new Date() },
    });
    logger.info("Transactional email provider accepted message", {
      provider,
      template: input.template,
      emailDeliveryLogId: log.id,
      providerId: result.providerId,
    });
    return { sent: true as const, providerId: result.providerId };
  } catch (error) {
    const errorCode = deliveryErrorCode(error);
    logger.error("Transactional email delivery failed", error, { provider, template: input.template, errorCode });
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorCode },
    });
    return { sent: false as const, errorCode };
  }
}
