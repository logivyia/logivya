import type { AnyMessageContent, WAMessage } from "@whiskeysockets/baileys";

import type { WhatsAppOutboundAttachment } from "@/server/whatsapp/provider";

export function buildWhatsAppOutboundPayload(input: {
  content: string;
  attachment?: WhatsAppOutboundAttachment;
}): AnyMessageContent {
  const caption = input.content || undefined;
  if (input.attachment?.kind === "PHOTO") {
    return {
      image: { url: input.attachment.filePath },
      mimetype: input.attachment.mimeType,
      caption,
    };
  }
  if (input.attachment?.kind === "VIDEO") {
    return {
      video: { url: input.attachment.filePath },
      mimetype: input.attachment.mimeType,
      caption,
    };
  }
  if (input.attachment?.kind === "DOCUMENT") {
    return {
      document: { url: input.attachment.filePath },
      mimetype: input.attachment.mimeType,
      fileName: input.attachment.fileName,
      caption,
    };
  }
  return { text: input.content };
}

export function assertWhatsAppMediaUploadResult(
  message: WAMessage,
  attachment: WhatsAppOutboundAttachment | undefined,
) {
  if (!attachment) return;
  const media = attachment.kind === "PHOTO"
    ? message.message?.imageMessage
    : attachment.kind === "VIDEO"
      ? message.message?.videoMessage
      : message.message?.documentMessage;
  if (
    !media
    || (!media.url && !media.directPath)
    || !media.mediaKey
    || !media.fileSha256
    || !media.fileEncSha256
  ) {
    throw new Error("WHATSAPP_MEDIA_UPLOAD_CONFIRMATION_MISSING");
  }
}
