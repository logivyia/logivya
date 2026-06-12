import { WORKER_UNREACHABLE_MESSAGE } from "@/server/whatsapp/worker-health";

export function whatsappUserMessage(error: unknown, operation: "qr" | "pairing" | "connection" | "sync" = "connection") {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "INVALID_WHATSAPP_PHONE") return "Geçerli bir telefon numarası girin. Türkiye için 0552... veya +90552... kullanabilirsiniz.";
  if (message.includes(WORKER_UNREACHABLE_MESSAGE)) return "WhatsApp bağlantı servisine şu anda ulaşılamıyor. Lütfen kısa süre sonra tekrar deneyin.";
  if (operation === "qr") return "QR kod oluşturulamadı. Yeni QR oluşturun.";
  if (operation === "pairing") return "Telefon kodu oluşturulamadı. Telefon numarasını kontrol edip yeni kod alın.";
  if (operation === "sync") return "Gruplar eşitlenemedi. Bağlantıyı kontrol edip tekrar deneyin.";
  return "Bağlantı başarısız oldu. Yeni kod veya QR ile tekrar deneyin.";
}
