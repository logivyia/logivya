import { NextResponse } from "next/server";

import { notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiSession();
    const { id } = await params;
    const revoked = await prisma.trustedDevice.updateMany({
      where: { id, userId: context.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!revoked.count) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_TRUSTED_DEVICE_REVOKED", message: "Guvenilir cihaz yetkisi kaldirildi.", severity: "MEDIUM" });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_trusted_device_revoked", title: "Guvenilir cihaz kaldirildi", message: "Bir cihazin iki adimli dogrulama guveni iptal edildi." });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
