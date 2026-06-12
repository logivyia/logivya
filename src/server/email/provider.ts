export type EmailTemplate =
  | "welcome" | "email_verification" | "password_reset" | "trial_started"
  | "trial_ending" | "trial_expired" | "subscription_activated"
  | "payment_received" | "invoice_created" | "support_created"
  | "support_replied" | "whatsapp_disconnected";

export type EmailInput = { to:string; subject:string; html:string; text?:string };
export type TemplateEmailInput = { to:string; template:EmailTemplate; variables:Record<string,string> };
export interface EmailProvider {
  sendEmail(input:EmailInput):Promise<{providerId?:string}>;
  sendTemplateEmail(input:TemplateEmailInput):Promise<{providerId?:string}>;
}

class SafePlaceholderProvider implements EmailProvider {
  async sendEmail(){ return {}; }
  async sendTemplateEmail(){ return {}; }
}

export function emailProvider():EmailProvider {
  return new SafePlaceholderProvider();
}
