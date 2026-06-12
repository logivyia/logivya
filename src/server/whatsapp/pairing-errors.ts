export function pairingUserMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "INVALID_WHATSAPP_PHONE") return "Geçerli bir telefon numarası girin. Türkiye için 0552... veya +90552... kullanabilirsiniz.";
  if (message.includes("worker is not reachable")) return "WhatsApp bağlantı servisine şu anda ulaşılamıyor. Lütfen kısa süre sonra tekrar deneyin.";
  if (message.includes("timed out")) return "Telefon bağlantı kodu zamanında oluşturulamadı. Lütfen Yeni kod al ile tekrar deneyin.";
  return "WhatsApp telefon bağlantısı kurulamadı. Lütfen Yeni kod al ile temiz bir bağlantı deneyin.";
}
