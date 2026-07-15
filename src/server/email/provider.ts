import { sendEmail } from "@/lib/email/send-email";
import { passwordResetCodeTemplate } from "@/lib/email/templates/password-reset-code";
import { supportCreatedEmail, supportReplyEmail } from "@/lib/email/templates/support-ticket";

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
  | "team_invitation"
  | "whatsapp_disconnected"
  | "security_alert";

export type EmailInput = { to: string; subject: string; html: string; text?: string };
export type TemplateEmailInput = { to: string; template: EmailTemplate; variables: Record<string, string> };

export interface EmailProvider {
  sendEmail(input: EmailInput): Promise<{ providerId?: string }>;
  sendTemplateEmail(input: TemplateEmailInput): Promise<{ providerId?: string }>;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

class TransactionalEmailProvider implements EmailProvider {
  async sendEmail(input: EmailInput) {
    return sendEmail(input);
  }

  async sendTemplateEmail(input: TemplateEmailInput) {
    if (input.template === "password_reset") {
      return this.sendEmail({ to: input.to, ...await passwordResetCodeTemplate(input.variables.code, input.variables.locale) });
    }

    if (input.template === "support_created") {
      return this.sendEmail({ to: input.to, ...supportCreatedEmail(input.variables) });
    }

    if (input.template === "support_replied") {
      return this.sendEmail({ to: input.to, ...supportReplyEmail(input.variables) });
    }

    const title = input.variables.title || "Logivya notification";
    const message = input.variables.message || "You have a new notification about your Logivya account.";
    return this.sendEmail({
      to: input.to,
      subject: title,
      text: message,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div>`,
    });
  }
}

export function emailProvider(): EmailProvider {
  return new TransactionalEmailProvider();
}
