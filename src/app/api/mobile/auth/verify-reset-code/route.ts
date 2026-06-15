import { verifyResetCodeSchema } from "@/features/auth/schemas";
import { verifyPasswordResetCode } from "@/server/auth/password-reset";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

export async function POST(request: Request) {
  try {
    const parsed = verifyResetCodeSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const result = await verifyPasswordResetCode(request, parsed.data.identifier, parsed.data.code);
    if (result !== "OK") return mobileError("RESET_CODE_INVALID", "Kod hatalı, süresi dolmuş veya kullanılamıyor.", { status: 400, details: { result } });
    return mobileSuccess({ verified: true });
  } catch (error) {
    return mobileSafeError(error, "Kod doğrulanamadı.");
  }
}
