function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function mfaEmailOtpTemplate(code: string, locale = "tr") {
  const turkish = locale.toLowerCase().startsWith("tr");
  const subject = turkish ? "Logivya doğrulama kodunuz" : "Your Logivya verification code";
  const title = turkish ? "Doğrulama kodu" : "Verification code";
  const message = turkish
    ? "Bu kod 10 dakika geçerlidir. Bu isteği siz başlatmadıysanız kodu paylaşmayın."
    : "This code is valid for 10 minutes. If you did not start this request, do not share it.";
  const safeCode = escapeHtml(code);
  return {
    subject,
    text: `${title}: ${code}\n\n${message}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h1>${title}</h1><p style="font-size:32px;font-weight:700;letter-spacing:8px">${safeCode}</p><p>${message}</p></div>`,
  };
}
