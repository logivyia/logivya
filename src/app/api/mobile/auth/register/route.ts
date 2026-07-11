import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/security/passwords";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { ensureSevenDayTrial } from "@/server/billing/trial-service";
import { writeAuditLog } from "@/server/security/audit";

const passwordSchema = z.string().min(12).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^A-Za-z0-9]/);
const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(30),
  password: passwordSchema,
  passwordConfirmation: z.string(),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  kvkkAccepted: z.literal(true),
  referralCode: z.string().max(40).optional(),
  deviceId: z.string().min(3).max(160),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
}).refine((input) => input.password === input.passwordConfirmation, { path: ["passwordConfirmation"], message: "validation.passwordMatch" });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const ipAddress = clientIp(request);
    enforceMobileRateLimit(`mobile-register:${ipAddress}`, 8, 60 * 60_000);
    const input = parsed.data;
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.replace(/\D/g, "");
    const duplicate = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (duplicate) return mobileError("ACCOUNT_EXISTS", "Bu e-posta veya telefonla kayıtlı hesap var.", { status: 409 });
    const trial = await prisma.plan.findUnique({ where: { slug: "trial" } });
    if (!trial) return mobileError("CONFIGURATION_ERROR", "Deneme paketi yapılandırılmamış.", { status: 503 });
    const passwordHash = await hashPassword(input.password, process.env.PASSWORD_PEPPER ?? "");
    const userAgent = request.headers.get("user-agent");
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          username: `user-${randomBytes(12).toString("hex")}`,
          phone,
          email,
          passwordHash,
          locale: "tr",
        },
      });
      const company = await tx.company.create({
        data: { name: `${user.name} Şirketi`, ownerId: user.id, email: user.email, phone: user.phone },
      });
      const membership = await tx.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });
      await ensureSevenDayTrial(tx, { companyId: company.id, planId: trial.id, userId: user.id });
      await tx.companyBillingProfile.create({ data: { companyId: company.id, billingType: "COMPANY", companyName: company.name, country: "TR", city: "-", addressLine1: "-", billingEmail: user.email } });
      await tx.onboardingChecklist.create({ data: { companyId: company.id } });
      await tx.consentRecord.createMany({
        data: [
          { userId: user.id, type: "TERMS_OF_SERVICE", version: "2026-06-12", granted: true, ipAddress, userAgent },
          { userId: user.id, type: "PRIVACY_POLICY", version: "2026-06-12", granted: true, ipAddress, userAgent },
          { userId: user.id, type: "KVKK", version: "2026-06-12", granted: true, ipAddress, userAgent },
        ],
      });
      return { user, company, membership };
    });
    const tokens = await createMobileSession({
      userId: result.user.id,
      companyId: result.company.id,
      role: result.membership.role,
      deviceId: input.deviceId,
      platform: parseMobilePlatform(input.platform),
      appVersion: input.appVersion,
      userAgent,
    });
    await writeAuditLog(request, { companyId: result.company.id, userId: result.user.id, action: "mobile.workspace.registered", entityType: "Company", entityId: result.company.id });
    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: result.user.email });

    return mobileSuccess({
      tokens,
      user: { id: result.user.id, name: result.user.name, email: result.user.email, phone: result.user.phone, role: result.membership.role, isPlatformAdmin },
      company: { id: result.company.id, name: result.company.name },
      role: result.membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(result.membership.role, permission)),
    }, { status: 201 });
  } catch (error) {
    return mobileSafeError(error, "Kayıt tamamlanamadı.");
  }
}
