import { sendEmail } from "@/lib/email/send-email";
import { passwordResetCodeTemplate } from "@/lib/email/templates/password-reset-code";

export type EmailTemplate =
  | "welcome"
  | "email_verification"
  | "password_reset"
  | "trial_started"
  | "trial_ending"
  | "trial_expired"
  | "subscription_activated"
  | "payment_received"
  | "invoice_created"
  | "support_created"
  | "support_replied"
  | "whatsapp_disconnected";

export type EmailInput = { to: string; subject: string; html: string; text?: string };
export type TemplateEmailInput = { to: string; template: EmailTemplate; variables: Record<string, string> };

export interface EmailProvider {
  sendEmail(input: EmailInput): Promise<{ providerId?: string }>;
  sendTemplateEmail(input: TemplateEmailInput): Promise<{ providerId?: string }>;
}

export class EmailConfigurationError extends Error {
  constructor(message = "EMAIL_PROVIDER_NOT_CONFIGURED") {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

class ResendEmailProvider implements EmailProvider {
  async sendEmail(input: EmailInput) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;
    if (!apiKey || !fromAddress) throw new EmailConfigurationError("RESEND_CONFIGURATION_MISSING");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `${process.env.EMAIL_FROM_NAME || "Logivya"} <${fromAddress}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) throw new Error(`EMAIL_PROVIDER_REJECTED_${response.status}`);
    const result = (await response.json()) as { id?: string };
    return { providerId: result.id };
  }

  async sendTemplateEmail(input: TemplateEmailInput) {
    if (input.template === "password_reset") {
      return this.sendEmail({ to: input.to, ...passwordResetCodeTemplate(input.variables.code) });
    }

    const title = input.variables.title || "Logivya Bildirimi";
    const message = input.variables.message || "Logivya hesabınızla ilgili yeni bir bildiriminiz var.";
    return this.sendEmail({
      to: input.to,
      subject: title,
      text: message,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div>`,
    });
  }
}

class SmtpEmailProvider implements EmailProvider {
  async sendEmail(input: EmailInput) {
    return sendEmail(input);
  }

  async sendTemplateEmail(input: TemplateEmailInput) {
    if (input.template === "password_reset") {
      return this.sendEmail({ to: input.to, ...passwordResetCodeTemplate(input.variables.code) });
    }

    const title = input.variables.title || "Logivya Bildirimi";
    const message = input.variables.message || "Logivya hesabınızla ilgili yeni bir bildiriminiz var.";
    return this.sendEmail({
      to: input.to,
      subject: title,
      text: message,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div>`,
    });
  }
}

export function emailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER?.trim().toUpperCase();

  if (provider === "SMTP" || (!provider && process.env.SMTP_HOST)) return new SmtpEmailProvider();
  if (provider === "RESEND") return new ResendEmailProvider();
  if (process.env.SMTP_HOST) return new SmtpEmailProvider();

  return new SmtpEmailProvider();
}
