import { requireApiSession } from "@/server/auth/session";

export async function POST() {
  await requireApiSession();
  return Response.json(
    {
      error: "PRIVACY_DELETION_REAUTH_REQUIRED",
      message: "Hesap silme talebi icin mevcut parolanizla yeniden dogrulama yapin.",
      requiredEndpoint: "/api/privacy/account-deletion",
      destructiveActionPerformed: false,
    },
    { status: 428 },
  );
}
