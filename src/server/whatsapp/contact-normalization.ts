export type ProviderContactRecord = {
  id: string;
  jid?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
};

export function normalizeWhatsAppContactJid(value: string | null | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate || candidate.endsWith("@g.us") || candidate.endsWith("@broadcast") || candidate === "status@broadcast") return null;
  if (candidate.endsWith("@s.whatsapp.net")) {
    const phone = candidate.slice(0, -"@s.whatsapp.net".length).replace(/\D/g, "");
    return phone.length >= 7 ? { jid: `${phone}@s.whatsapp.net`, phone } : null;
  }
  if (/^\+?\d{7,20}$/.test(candidate)) {
    const phone = candidate.replace(/\D/g, "");
    return { jid: `${phone}@s.whatsapp.net`, phone };
  }
  return null;
}

export function normalizeProviderContact(contact: ProviderContactRecord) {
  const normalized = normalizeWhatsAppContactJid(contact.phoneNumber || contact.jid || contact.id);
  if (!normalized) return null;
  return {
    externalContactId: normalized.jid,
    phone: normalized.phone,
    name: contact.name?.trim() || contact.verifiedName?.trim() || contact.notify?.trim() || null,
    pushName: contact.notify?.trim() || contact.verifiedName?.trim() || null,
  };
}
