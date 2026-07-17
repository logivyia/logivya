import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSuccess } from "@/server/mobile/response";

export async function POST(request: Request) {
  await requireMobileAuth(request);
  return mobileSuccess(
    {
      error: "PRIVACY_DELETION_REAUTH_REQUIRED",
      message: "Hesap silme talebi icin uygulamayi guncelleyin ve mevcut parolanizla yeniden dogrulama yapin.",
      requiredEndpoint: "/api/privacy/account-deletion",
      destructiveActionPerformed: false,
    },
    { status: 428 },
  );
}
