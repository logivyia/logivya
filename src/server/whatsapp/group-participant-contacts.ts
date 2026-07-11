import { normalizeWhatsAppContactJid, type ProviderContactRecord } from "@/server/whatsapp/contact-normalization";

type GroupParticipantContact = Partial<ProviderContactRecord> & { id?: string | null };
type GroupWithParticipants = { participants?: GroupParticipantContact[] | null };

function normalizeCandidate(value: string | null | undefined) {
  return normalizeWhatsAppContactJid(value?.replace(/:\d+(?=@)/, ""));
}

export function collectGroupParticipantContacts(
  groups: GroupWithParticipants[],
  options: { ownJid?: string | null; knownContacts?: ProviderContactRecord[]; limit?: number } = {},
) {
  const own = normalizeCandidate(options.ownJid)?.jid;
  const limit = Math.min(10_000, Math.max(1, options.limit ?? 10_000));
  const knownByJid = new Map<string, ProviderContactRecord>();
  for (const contact of options.knownContacts ?? []) {
    const normalized = normalizeCandidate(contact.jid || contact.id);
    if (normalized) knownByJid.set(normalized.jid, contact);
  }

  const contacts = new Map<string, ProviderContactRecord>();
  for (const group of groups) {
    for (const participant of group.participants ?? []) {
      const normalized = normalizeCandidate(participant.jid || participant.id);
      if (!normalized || normalized.jid === own || contacts.has(normalized.jid)) continue;
      const known = knownByJid.get(normalized.jid);
      contacts.set(normalized.jid, {
        id: normalized.jid,
        jid: normalized.jid,
        name: participant.name ?? known?.name,
        notify: participant.notify ?? known?.notify,
        verifiedName: participant.verifiedName ?? known?.verifiedName,
      });
      if (contacts.size >= limit) return [...contacts.values()];
    }
  }
  return [...contacts.values()];
}
