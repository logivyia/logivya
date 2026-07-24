type GroupRecipientTarget = {
  accountId: string;
  id: string;
  name: string;
  externalGroupId: string;
};

type ContactRecipientTarget = {
  accountId: string;
  id: string;
  name: string | null;
  pushName: string | null;
  phone: string;
  externalContactId: string;
};

export function buildMessageRecipientRows(
  groups: GroupRecipientTarget[],
  contacts: ContactRecipientTarget[],
) {
  return [
    ...groups.map((group) => ({
      accountId: group.accountId,
      groupId: group.id,
      targetType: "GROUP" as const,
      recipientName: group.name,
      recipientExternalId: group.externalGroupId,
    })),
    ...contacts.map((contact) => ({
      accountId: contact.accountId,
      contactId: contact.id,
      targetType: "CONTACT" as const,
      recipientName: contact.name || contact.pushName || contact.phone,
      recipientExternalId: contact.externalContactId,
    })),
  ];
}
