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
  | "security_alert"
  | "notification_generic";

export type EmailInput = { to: string; subject: string; html: string; text?: string };
export type TemplateEmailInput = { to: string; template: EmailTemplate; variables: Record<string, string> };

const REQUIRED_TEMPLATE_VARIABLES: Partial<Record<EmailTemplate, string[]>> = {
  password_reset: ["code"],
  support_created: ["ticketNumber", "ticketSubject", "userEmail", "companyName", "ticketCategory", "ticketPriority", "createdAt", "message", "openUrl"],
  support_replied: ["eventKind", "ticketNumber", "ticketSubject", "ticketStatus", "createdAt", "message", "openUrl"],
  notification_generic: ["title", "message"],
};

export function validateTemplateEmailInput(input: TemplateEmailInput) {
  const required = REQUIRED_TEMPLATE_VARIABLES[input.template] ?? ["title", "message"];
  const missing = required.filter((key) => !input.variables[key]?.trim());
  if (!input.to.trim()) missing.push("recipient");
  if (input.template === "support_replied" && input.variables.eventKind === "user_reply") {
    for (const key of ["userName", "userEmail", "companyName"]) {
      if (!input.variables[key]?.trim()) missing.push(key);
    }
  }
  return { valid: missing.length === 0, missing: [...new Set(missing)] };
}

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
    const validation = validateTemplateEmailInput(input);
    if (!validation.valid) throw new Error("EMAIL_TEMPLATE_VARIABLES_MISSING");
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
