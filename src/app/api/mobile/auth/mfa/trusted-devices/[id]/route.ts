import { requireMobileAuth } from "@/server/mobile/auth";
import { prisma } from "@/server/db";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireMobileAuth(request);
    const { id } = await params;
    const revoked = await prisma.trustedDevice.updateMany({ where: { id, userId: context.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!revoked.count) return mobileError("NOT_FOUND", "Cihaz bulunamadi.", { status: 404 });
    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
