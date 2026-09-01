import { WORKER_UNREACHABLE_MESSAGE } from "@/server/whatsapp/worker-health";

export function whatsappLastErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("max requests limit exceeded")) return "REDIS_MAX_REQUESTS_EXCEEDED";
  if (message.includes(WORKER_UNREACHABLE_MESSAGE)) return WORKER_UNREACHABLE_MESSAGE;
  if (message.includes("WHATSAPP_WORKER_URL_REQUIRED")) return "WHATSAPP_WORKER_URL_REQUIRED";
  if (["INVALID_WHATSAPP_PHONE", "UNSUPPORTED_PHONE_COUNTRY", "DUPLICATE_PHONE_COUNTRY_CODE", "PHONE_COUNTRY_MISMATCH"].includes(message)) return message;
  if (message === "WHATSAPP_RATE_LIMITED") return "WHATSAPP_RATE_LIMITED";
  if (message === "WHATSAPP_RATE_LIMIT_UNAVAILABLE") return "WHATSAPP_RATE_LIMIT_UNAVAILABLE";
  if (message === "accounts.planLimit") return "accounts.planLimit";
  if (message === "subscription.inactive") return "subscription.inactive";
  return message.slice(0, 500);
}

export function whatsappUserMessage(error: unknown, operation: "qr" | "pairing" | "connection" | "sync" = "connection") {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "WHATSAPP_RECONNECT_REQUIRED") {
    return "WhatsApp baglantisi toparlaniyor. Mesaj kuyruga alindiysa otomatik gonderilecek; sorun surerse baglanti durumunu yenileyin.";
  }
  if (message === "WHATSAPP_CREDENTIALS_MISSING" || message === "AUTH_REQUIRED") {
    return "WhatsApp hesabinizi yeniden baglamaniz gerekiyor.";
  }
  if (message === "WHATSAPP_LOGGED_OUT" || message === "LOGGED_OUT") {
    return "WhatsApp oturumu kapatildi. Lutfen hesabi yeniden baglayin.";
  }
  if (message === "WHATSAPP_TRANSIENT_DISCONNECT" || message === "WHATSAPP_CONNECTION_FAILED" || message === "WHATSAPP_QR_FAILED" || message === "MOBILE_QR_FAILED") {
    return "WhatsApp baglantisi gecici olarak kesildi. Lutfen yeniden baglanmayi deneyin.";
  }
  if (["INVALID_WHATSAPP_PHONE", "PHONE_COUNTRY_MISMATCH"].includes(message)) {
    return "accounts.phoneInvalid";
  }
  if (message === "UNSUPPORTED_PHONE_COUNTRY") {
    return "accounts.countryUnsupported";
  }
  if (message === "DUPLICATE_PHONE_COUNTRY_CODE") {
    return "accounts.countryCodeDuplicate";
  }
  if (message === "WHATSAPP_RATE_LIMITED") {
    return "Kisa surede cok fazla deneme yapildi. Lutfen birkac dakika sonra tekrar deneyin.";
  }
  if (message === "WHATSAPP_RATE_LIMIT_UNAVAILABLE") {
    return "WhatsApp baglanti korumasi su anda hazir degil. Lutfen kisa sure sonra tekrar deneyin.";
  }
  if (message === "accounts.planLimit") {
    return "WhatsApp baglantisi baslatilamadi. Eski basarisiz denemeyi temizleyip tekrar deneyin.";
  }
  if (message === "subscription.inactive") {
    return "Aboneliginiz aktif degil. WhatsApp hesabi baglamak icin paketinizi yenileyin.";
  }
  if (message.includes(WORKER_UNREACHABLE_MESSAGE)) {
    return "WhatsApp baglanti servisine su anda ulasilamiyor. Lutfen kisa sure sonra tekrar deneyin.";
  }
  if (message.includes("WHATSAPP_WORKER_URL_REQUIRED")) {
    return "WhatsApp baglanti servisi production ortaminda tanimli degil. Lutfen yoneticiyle iletisime gecin.";
  }
  if (message.includes("REDIS_MAX_REQUESTS_EXCEEDED") || message.includes("max requests limit exceeded")) {
    return "WhatsApp baglanti kuyrugu su anda Redis kota sinirina takildi. Lutfen kisa sure sonra tekrar deneyin.";
  }

  if (operation === "qr") return "QR kod olusturulamadi. Yeni QR olusturun.";
  if (operation === "pairing") return "Telefon kodu olusturulamadi. Telefon numarasini kontrol edip yeni kod alin.";
  if (operation === "sync") return "Gruplar esitlenemedi. Baglantiyi kontrol edip tekrar deneyin.";
  return "Baglanti basarisiz oldu. Yeni kod veya QR ile tekrar deneyin.";
}
