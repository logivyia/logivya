import { whatsappUserMessage } from "@/server/whatsapp/user-errors";

export function pairingUserMessage(error: unknown) {
  return whatsappUserMessage(error, "pairing");
}
