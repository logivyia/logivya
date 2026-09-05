import { FacebookGraphError } from "@/server/facebook/graph-api";
import { mobileError, mobileSafeError } from "@/server/mobile/response";

export function facebookSafeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "FACEBOOK_NOT_FOUND" || code === "FACEBOOK_PAGE_NOT_FOUND") {
    return mobileError("NOT_FOUND", "Facebook Sayfaları özelliği veya sayfa bulunamadı.", { status: 404 });
  }
  if (code === "FACEBOOK_NOT_CONFIGURED" || code.includes("FACEBOOK_TOKEN_ENCRYPTION_KEY") || code.includes("FACEBOOK_OAUTH_STATE_SECRET")) {
    return mobileError("CONFIGURATION_ERROR", "Facebook bağlantısı henüz sunucuda yapılandırılmadı.", { status: 503 });
  }
  if (code === "FACEBOOK_RECONNECT_REQUIRED" || (error instanceof FacebookGraphError && [102, 190].includes(error.graphCode || 0))) {
    return mobileError("FACEBOOK_RECONNECT_REQUIRED", "Facebook yetkisinin yenilenmesi gerekiyor. Hesabı tekrar bağlayın.", { status: 409 });
  }
  if (code.startsWith("FACEBOOK_VALIDATION_") || code === "MEDIA_FILE_NOT_FOUND") {
    return mobileError("VALIDATION_ERROR", "Gönderi bilgileri geçerli değil.", { status: 400 });
  }
  if (code === "FACEBOOK_POST_PROCESSING") {
    return mobileError("CONFLICT", "Facebook gönderisi şu anda işleniyor. Tamamlandıktan sonra tekrar deneyin.", { status: 409 });
  }
  if (code === "FACEBOOK_IDEMPOTENCY_CONFLICT") {
    return mobileError("CONFLICT", "Bu Facebook gönderi isteği daha önce farklı bir işlem için kullanıldı.", { status: 409 });
  }
  if (error instanceof FacebookGraphError) {
    return mobileError("FACEBOOK_PROVIDER_ERROR", "Facebook işlemi tamamlanamadı. Sayfa yetkilerini kontrol edip tekrar deneyin.", {
      status: error.status === 429 ? 429 : 502,
      details: { providerCode: error.graphCode, providerSubcode: error.graphSubcode, traceId: error.traceId },
    });
  }
  if (code === "FACEBOOK_GRAPH_TIMEOUT" || code === "FACEBOOK_GRAPH_UNAVAILABLE") {
    return mobileError("FACEBOOK_PROVIDER_UNAVAILABLE", "Facebook hizmetine şu anda ulaşılamıyor. Biraz sonra tekrar deneyin.", { status: 503 });
  }
  return mobileSafeError(error, "Facebook işlemi tamamlanamadı.");
}
