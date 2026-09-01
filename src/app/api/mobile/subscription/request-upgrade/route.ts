import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError } from "@/server/mobile/response";

export async function POST(request: Request) {
  try {
    await requireMobileAuth(request);
    return mobileError(
      "SUBSCRIPTION_REQUEST_FLOW_REQUIRED",
      "Abonelik talebi oluşturmak için ödeme bilgileri ve sözleşme onayı adımlarını tamamlayın.",
      { status: 409 },
    );
  } catch {
    return mobileError("UNAUTHORIZED", "api.error.sessionExpired", { status: 401 });
  }
}
