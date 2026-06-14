import { loadEnvConfig } from "@next/env";
import { sendEmail, verifySmtpConnection } from "../src/lib/email/send-email";

loadEnvConfig(process.cwd());

async function main() {
  const to = process.argv[2]?.trim();
  if (!to) {
    console.error("Usage: npm run test:email -- you@example.com");
    process.exit(1);
  }

  const health = await verifySmtpConnection();
  if (!health.ok) {
    console.error("SMTP health check failed");
    console.error(JSON.stringify({
      configured: health.diagnostics.configured,
      missing: health.diagnostics.missing,
      host: health.diagnostics.host,
      port: health.diagnostics.port,
      secure: health.diagnostics.secure,
      fromConfigured: health.diagnostics.fromConfigured,
      error: health.errorCode,
    }, null, 2));
    process.exit(1);
  }

  const result = await sendEmail({
    to,
    subject: "Logivya SMTP Test",
    text: "Bu e-posta Logivya SMTP yapılandırmasını test etmek için gönderildi.",
    html: `<div style="font-family:Arial,sans-serif;color:#111827">
      <h1>Logivya SMTP Test</h1>
      <p>Bu e-posta Logivya SMTP yapılandırmasını test etmek için gönderildi.</p>
    </div>`,
  });

  console.log(JSON.stringify({ ok: true, to, providerId: result.providerId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
