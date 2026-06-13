export type DeleteWhatsAppMessageInput = {
  accountId: string;
  recipientExternalId: string;
  externalMessageId?: string | null;
};

export async function deleteWhatsAppMessageForEveryone(input: DeleteWhatsAppMessageInput) {
  if (!input.externalMessageId) {
    return { ok: false as const, reason: "MISSING_EXTERNAL_MESSAGE_ID" };
  }

  return { ok: false as const, reason: "NOT_SUPPORTED" };
}
