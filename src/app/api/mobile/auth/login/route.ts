import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/security/passwords";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
  deviceId: z.string().min(3).max(160),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    const ip = clientIp(request);
    enforceMobileRateLimit(`mobile-login:${ip}`, 20, 60 * 60_000);

    const identifier = parsed.data.identifier.toLowerCase();
    const phone = identifier.replace(/\D/g, "");
    logger.info("Mobile login request received", {
      identifierType: identifier.includes("@") ? "email" : "phone",
      platform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
    });

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, ...(phone.length >= 7 ? [{ phone }] : [])] },
    });
    const validPassword = user ? await verifyPassword(user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? "") : false;

    if (!user || user.status !== "ACTIVE" || !validPassword) {
      await prisma.loginAttempt.create({
        data: {
          userId: user?.id,
          email: identifier,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
          success: false,
          failureReason: "MOBILE_INVALID_CREDENTIALS",
        },
      });
      logger.warn("Mobile login rejected", {
        userFound: Boolean(user),
        userStatus: user?.status,
        reason: !user ? "USER_NOT_FOUND" : user.status !== "ACTIVE" ? "USER_NOT_ACTIVE" : "INVALID_PASSWORD",
      });
      return mobileError("UNAUTHORIZED", "E-posta/telefon veya parola hatalı.", { status: 401 });
    }

    const membership = await prisma.companyUser.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      include: { company: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) {
      logger.warn("Mobile login rejected: active membership missing", { userId: user.id });
      return mobileError("FORBIDDEN", "Çalışma alanı bulunamadı.", { status: 403 });
    }

    const tokens = await createMobileSession({
      userId: user.id,
      companyId: membership.companyId,
      role: membership.role,
      deviceId: parsed.data.deviceId,
      platform: parseMobilePlatform(parsed.data.platform),
      appVersion: parsed.data.appVersion,
      userAgent: request.headers.get("user-agent"),
    });
    await prisma.loginAttempt.create({
      data: { userId: user.id, email: user.email, ipAddress: ip, userAgent: request.headers.get("user-agent"), success: true },
    });
    await writeAuditLog(request, {
      companyId: membership.companyId,
      userId: user.id,
      action: "mobile.auth.login",
      entityType: "MobileDeviceSession",
      after: { deviceId: parsed.data.deviceId, platform: parsed.data.platform },
    });

    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: user.email });

    return mobileSuccess({
      tokens,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, locale: user.locale, role: membership.role, isPlatformAdmin },
      company: { id: membership.company.id, name: membership.company.name },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MOBILE_AUTH_SECRET_MISSING") {
      return mobileError("CONFIGURATION_ERROR", "Mobil kimlik doğrulama yapılandırılmamış.", { status: 503 });
    }
    logger.error("Mobile login failed unexpectedly", error);
    return mobileSafeError(error);
  }
}
