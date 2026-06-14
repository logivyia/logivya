export function passwordResetCodeTemplate(code: string) {
  const subject = "Logivya Parola Sıfırlama Kodunuz";
  const text = `Merhaba,

Şifre sıfırlama talebiniz alınmıştır.

Doğrulama Kodunuz:

${code}

Bu kod 10 dakika boyunca geçerlidir.

Eğer bu işlemi siz yapmadıysanız bu e-postayı dikkate almayınız.

Logivya Güvenlik Sistemi`;

  const html = `<!doctype html>
<html lang="tr">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden">
            <tr>
              <td style="padding:28px 32px;background:#111827;color:#ffffff">
                <div style="font-size:22px;font-weight:800;letter-spacing:5px">LOGIVYA</div>
                <div style="margin-top:8px;color:#fdba74;font-size:13px;font-weight:700;letter-spacing:2px">GÜVENLİK SİSTEMİ</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827">Parola sıfırlama kodunuz</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569">Şifre sıfırlama talebiniz alınmıştır. Aşağıdaki doğrulama kodunu Logivya ekranına girin.</p>
                <div style="margin:24px 0;padding:22px;border-radius:18px;background:#fff7ed;text-align:center">
                  <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#ea580c">${code}</div>
                </div>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#475569">Bu kod 10 dakika boyunca geçerlidir ve yalnızca bir kez kullanılabilir.</p>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b">Eğer bu işlemi siz yapmadıysanız bu e-postayı dikkate almayınız.</p>
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
