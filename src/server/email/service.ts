import { prisma } from "@/server/db";
import { emailProvider, validateTemplateEmailInput, type TemplateEmailInput } from "@/server/email/provider";
import { getEmailProviderStatus } from "@/lib/email/email-provider";
import { verifyEmailProviderConnection } from "@/lib/email/send-email";
import { logger } from "@/server/observability/logger";
import { raiseOperationalAlert } from "@/server/observability/alerts";

function deliveryErrorCode(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 120);
  return "UNKNOWN_EMAIL_DELIVERY_ERROR";
}

export async function sendTemplateEmailSafely(input: TemplateEmailInput & { companyId?: string; userId?: string }) {
  const providerStatus = getEmailProviderStatus();
  const provider = providerStatus.provider;
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

  const validation = validateTemplateEmailInput(input);
  if (!validation.valid) {
    const errorCode = "EMAIL_TEMPLATE_VARIABLES_MISSING";
    await prisma.emailDeliveryLog.update({ where: { id: log.id }, data: { status: "FAILED", errorCode } });
    logger.error("email.template.validation_failed", undefined, { template: input.template, missingVariables: validation.missing, emailDeliveryLogId: log.id });
    await raiseOperationalAlert({
      type: "EMAIL_TEMPLATE_VALIDATION_FAILED",
      severity: "HIGH",
      service: "email",
      message: "A transactional email was rejected because mandatory template variables were missing.",
      metadata: { template: input.template, missingVariables: validation.missing },
    }).catch(() => undefined);
    return { sent: false as const, errorCode, missing: validation.missing };
  }

  if (!providerStatus.configured) {
    const errorCode = "EMAIL_CONFIGURATION_MISSING";
    logger.error("Email configuration missing", undefined, {
      template: input.template,
      provider,
      missing: providerStatus.missingVariables,
      emailDeliveryLogId: log.id,
    });
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorCode },
    });
    return { sent: false as const, errorCode, missing: providerStatus.missingVariables };
  }

  try {
    if (provider === "smtp") {
      logger.info("SMTP connection verification started", { template: input.template, emailDeliveryLogId: log.id });
      const verification = await verifyEmailProviderConnection();
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
