import { z } from "zod";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ confirmation: z.enum(["LOGIVYA HESABIMI KAPAT", "CLOSE MY LOGIVYA ACCOUNT"]) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    if (context.membership.role !== "OWNER") {
      return mobileError("FORBIDDEN", "Sadece hesap sahibi hesap kapatma talebi olusturabilir.", { status: 403 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    await prisma.$transaction([
      prisma.company.update({ where: { id: context.company.id }, data: { securityStatus: "DISABLED", campaignsPausedAt: new Date() } }),
      prisma.userSession.updateMany({ where: { companyId: context.company.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.mobileDeviceSession.updateMany({ where: { companyId: context.company.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "mobile.company.deactivated",
      entityType: "Company",
      entityId: context.company.id,
    });

    return mobileSuccess({ ok: true, message: "Hesap kapatma talebi alindi." });
  } catch (error) {
    return mobileSafeError(error, "Hesap kapatma islemi tamamlanamadi.");
  }
}
