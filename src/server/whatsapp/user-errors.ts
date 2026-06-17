import { WORKER_UNREACHABLE_MESSAGE } from "@/server/whatsapp/worker-health";

export function whatsappUserMessage(error: unknown, operation: "qr" | "pairing" | "connection" | "sync" = "connection") {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "WHATSAPP_RECONNECT_REQUIRED") {
    return "WhatsApp baglantisini QR kod veya telefon koduyla yeniden kurun.";
  }
  if (message === "INVALID_WHATSAPP_PHONE") {
    return "Gecerli bir telefon numarasi girin. Turkiye icin 0552... veya +90552... kullanabilirsiniz.";
  }
  if (message === "WHATSAPP_RATE_LIMITED") {
    return "Kisa surede cok fazla deneme yapildi. Lutfen birkac dakika sonra tekrar deneyin.";
  }
  if (message === "WHATSAPP_RATE_LIMIT_UNAVAILABLE") {
    return "WhatsApp baglanti korumasi su anda hazir degil. Lutfen kisa sure sonra tekrar deneyin.";
  }
  if (message === "accounts.planLimit") {
    return "WhatsApp hesap limitinize ulastiniz. Eski basarisiz denemeyi temizleyip tekrar deneyin veya paketinizi yukseltin.";
  }
  if (message === "subscription.inactive") {
    return "Aboneliginiz aktif degil. WhatsApp hesabi baglamak icin paketinizi yenileyin.";
  }
  if (message.includes(WORKER_UNREACHABLE_MESSAGE)) {
    return "WhatsApp baglanti servisine su anda ulasilamiyor. Lutfen kisa sure sonra tekrar deneyin.";
  }

  if (operation === "qr") return "QR kod olusturulamadi. Yeni QR olusturun.";
  if (operation === "pairing") return "Telefon kodu olusturulamadi. Telefon numarasini kontrol edip yeni kod alin.";
  if (operation === "sync") return "Gruplar esitlenemedi. Baglantiyi kontrol edip tekrar deneyin.";
  return "Baglanti basarisiz oldu. Yeni kod veya QR ile tekrar deneyin.";
}
