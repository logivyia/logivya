import { localeMetadata, normalizeLocale, fallbackLocale } from "@/i18n/config";
import { translateForLocale } from "@/i18n/server";

export async function passwordResetCodeTemplate(code: string, preferredLocale?: string) {
  const locale = normalizeLocale(preferredLocale) ?? fallbackLocale;
  const keys = [
    "email.passwordReset.subject",
    "email.passwordReset.greeting",
    "email.passwordReset.requestReceived",
    "email.passwordReset.codeLabel",
    "email.passwordReset.validity",
    "email.passwordReset.ignore",
    "email.passwordReset.securitySystem",
    "email.passwordReset.title",
    "email.passwordReset.intro",
  ] as const;
  const [subject, greeting, requestReceived, codeLabel, validity, ignore, securitySystem, title, intro] = await Promise.all(
    keys.map((key) => translateForLocale(locale, key)),
  );
  const text = `${greeting}

${requestReceived}

${codeLabel}

${code}

${validity}

${ignore}

Logivya ${securitySystem}`;

  const html = `<!doctype html>
<html lang="${locale}" dir="${localeMetadata[locale].direction}">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden">
            <tr>
              <td style="padding:28px 32px;background:#111827;color:#ffffff">
                <div style="font-size:22px;font-weight:800;letter-spacing:5px">LOGIVYA</div>
                <div style="margin-top:8px;color:#fdba74;font-size:13px;font-weight:700;letter-spacing:2px">${securitySystem}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827">${title}</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">${intro}</p>
                <div style="margin:24px 0;padding:22px;border-radius:18px;background:#fff7ed;text-align:center">
                  <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#ea580c">${code}</div>
                </div>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#475569">${validity}</p>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b">${ignore}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
