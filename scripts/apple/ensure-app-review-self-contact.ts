import { persistWhatsAppContacts } from "../../src/server/whatsapp/contacts";

async function main() {
  const accountId = process.argv[2]?.trim();
  const phone = process.argv[3]?.replace(/\D/g, "");
  if (!accountId || !phone) throw new Error("ACCOUNT_ID_AND_PHONE_REQUIRED");
  const result = await persistWhatsAppContacts(
    accountId,
    [{
      id: `${phone}@s.whatsapp.net`,
      jid: `${phone}@s.whatsapp.net`,
      phoneNumber: phone,
      name: "Logivya App Review Self Test",
    }],
    { source: "APP_REVIEW_SELF_TEST" },
  );
  console.log(JSON.stringify({ ok: result.count === 1, persistedCount: result.count }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
  }));
  process.exitCode = 1;
});
