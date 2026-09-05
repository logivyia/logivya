import { normalizePhonePairingInput, type NormalizedPhonePairing } from "@/lib/phone/normalize";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

export function parsePhonePairingRequest(body: unknown): NormalizedPhonePairing {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_WHATSAPP_PHONE");
  return normalizePhonePairingInput(body as Record<string, unknown>);
}

export async function persistPhonePairingMetadata(input: {
  accountId: string;
  companyId: string;
  userId: string;
  phone: NormalizedPhonePairing;
  source: "web" | "mobile";
}) {
  const updated = await prisma.whatsAppAccount.updateMany({
    where: { id: input.accountId, companyId: input.companyId, userId: input.userId, archivedAt: null },
    data: {
      phoneNumber: input.phone.e164,
      countryIso: input.phone.countryIso,
      messageLocale: input.phone.locale,
      connectionMethod: "PHONE_CODE",
    },
  });
  if (!updated.count) throw new Error("WHATSAPP_ACCOUNT_NOT_OWNED");
  logger.info("whatsapp.pairing.country_selected", {
    accountId: input.accountId,
    companyId: input.companyId,
    userId: input.userId,
    source: input.source,
    countryIso: input.phone.countryIso,
    locale: input.phone.locale,
  });
}

export function phonePairingErrorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_WHATSAPP_PHONE";
  return [
    "INVALID_WHATSAPP_PHONE",
    "UNSUPPORTED_PHONE_COUNTRY",
    "DUPLICATE_PHONE_COUNTRY_CODE",
    "PHONE_COUNTRY_MISMATCH",
  ].includes(code) ? code : null;
}
