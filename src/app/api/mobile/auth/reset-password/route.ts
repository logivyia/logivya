import { resetPasswordSchema } from "@/features/auth/schemas";
import { completePasswordReset } from "@/server/auth/password-reset";
import { prisma } from "@/server/db";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

export async function POST(request: Request) {
  try {
    const parsed = resetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const completed = await completePasswordReset(request, parsed.data.identifier, parsed.data.code, parsed.data.password);
    if (!completed) return mobileError("RESET_CODE_INVALID", "Kod hatalı, süresi dolmuş veya kullanılmış.", { status: 400 });
    const identifier = parsed.data.identifier.trim().toLowerCase();
    const phone = identifier.replace(/\D/g, "");
    const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, ...(phone.length >= 7 ? [{ phone }] : [])] }, select: { id: true } });
    if (user) await prisma.mobileDeviceSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return mobileSuccess({ message: "Şifreniz başarıyla güncellendi." });
  } catch (error) {
    return mobileSafeError(error, "Şifre sıfırlama tamamlanamadı.");
  }
}
