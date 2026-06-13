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

function passwordResetTemplate(code: string) {
  const text = `Merhaba,

Şifre sıfırlama talebiniz alınmıştır.

Doğrulama Kodunuz:

${code}

Bu kod 10 dakika boyunca geçerlidir.

Eğer bu işlemi siz yapmadıysanız bu e-postayı dikkate almayınız.

Logivya Güvenlik Sistemi`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">
    <h1 style="font-size:24px">Logivya Şifre Sıfırlama Kodu</h1>
    <p>Merhaba,</p><p>Şifre sıfırlama talebiniz alınmıştır.</p>
    <p>Doğrulama Kodunuz:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#f97316">${code}</p>
    <p>Bu kod 10 dakika boyunca geçerlidir.</p>
    <p>Eğer bu işlemi siz yapmadıysanız bu e-postayı dikkate almayınız.</p>
    <p>Logivya Güvenlik Sistemi</p>
  </div>`;
  return { subject: "Logivya Şifre Sıfırlama Kodu", text, html };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

class ResendEmailProvider implements EmailProvider {
  async sendEmail(input: EmailInput) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;
    if (!apiKey || !fromAddress) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
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
    const result = await response.json() as { id?: string };
    return { providerId: result.id };
  }

  async sendTemplateEmail(input: TemplateEmailInput) {
    if (input.template === "password_reset") return this.sendEmail({ to: input.to, ...passwordResetTemplate(input.variables.code) });
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
  return new ResendEmailProvider();
}
