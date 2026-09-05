import { requireMobileAuth } from "@/server/mobile/auth";
import { notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { prisma } from "@/server/db";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireMobileAuth(request);
    const { id } = await params;
    const revoked = await prisma.trustedDevice.updateMany({ where: { id, userId: context.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!revoked.count) return mobileError("NOT_FOUND", "Cihaz bulunamadi.", { status: 404 });
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_TRUSTED_DEVICE_REVOKED", message: "Güvenilir cihaz yetkisi mobil uygulamadan kaldırıldı.", severity: "MEDIUM" });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_trusted_device_revoked", title: "Güvenilir cihaz kaldırıldı", message: "Bir cihazın iki adımlı doğrulama güveni iptal edildi." });
    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
