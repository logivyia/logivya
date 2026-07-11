import * as nextEnv from "@next/env";
import { getEmailProviderStatus } from "../src/lib/email/email-provider";
import { sendEmail, verifyEmailProviderConnection } from "../src/lib/email/send-email";

nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const to = process.argv[2]?.trim();
  if (!to) {
    console.error("Usage: npm run test:email -- you@example.com");
    process.exit(1);
  }

  const status = getEmailProviderStatus();
  if (!status.configured) {
    console.error("Email provider is not configured.");
    console.error(
      JSON.stringify(
        {
          provider: status.provider,
          configured: status.configured,
          missingVariables: status.missingVariables,
          fromConfigured: status.fromConfigured,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const health = await verifyEmailProviderConnection();
  if (!health.ok) {
    console.error("Email provider health check failed.");
    console.error(
      JSON.stringify(
        {
          provider: status.provider,
          configured: status.configured,
          missingVariables: status.missingVariables,
          fromConfigured: status.fromConfigured,
          error: health.errorCode,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const result = await sendEmail({
    to,
    subject: "Logivya E-posta Testi",
    text: "Bu e-posta Logivya parola sifirlama e-posta servisini test etmek icin gonderildi.",
    html: `<div style="font-family:Arial,sans-serif;color:#111827">
      <h1>Logivya E-posta Testi</h1>
      <p>Bu e-posta Logivya parola sifirlama e-posta servisini test etmek icin gonderildi.</p>
    </div>`,
  });

  console.log(JSON.stringify({ ok: true, to, provider: result.provider, providerId: result.providerId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
