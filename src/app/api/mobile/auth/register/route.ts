import { randomBytes } from "node:crypto";
import { z } from "zod";

import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { ensureSevenDayTrial } from "@/server/billing/trial-service";
import { prisma } from "@/server/db";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { hashPassword } from "@/server/security/passwords";
import {
  acceptCompanyInvitationInTransaction,
  companyInvitationErrorStatus,
  findPendingInvitation,
  findPendingInvitationByCode,
} from "@/server/team/company-invitations";

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
  invitationToken: z.string().min(32).max(200).optional(),
  invitationCode: z.string().trim().min(16).max(32).optional(),
  deviceId: z.string().min(3).max(160),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
})
  .refine((input) => !(input.invitationToken && input.invitationCode), { path: ["invitationCode"], message: "validation.invalid" })
  .refine((input) => input.password === input.passwordConfirmation, { path: ["passwordConfirmation"], message: "validation.passwordMatch" });

const invitationMessages: Record<string, string> = {
  INVITATION_INVALID: "Davet geçersiz veya süresi dolmuş.",
  INVITATION_EXPIRED: "Davetin süresi dolmuş.",
  INVITATION_EMAIL_MISMATCH: "Bu davet farklı bir e-posta adresine ait.",
  INVITATION_ALREADY_USED: "Bu davet daha önce kullanılmış.",
  INVITATION_REVOKED: "Bu davet iptal edilmiş.",
  INVITATION_DECLINED: "Bu davet daha önce reddedilmiş.",
  SEAT_LIMIT_REACHED: "Şirkette kullanılabilir ekip koltuğu kalmamış.",
  RATE_LIMITED: "Çok fazla kayıt denemesi yaptınız. Lütfen daha sonra tekrar deneyin.",
};

export async function POST(request: Request) {
  try {
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;

    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const ipAddress = clientIp(request);
    enforceMobileRateLimit(`mobile-register:${ipAddress}`, 8, 60 * 60_000);
    await enforceOperationRateLimit({ scope: "mobile-register", subject: ipAddress, maxAttempts: 8, windowMs: 60 * 60_000, request });

    const input = parsed.data;
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.replace(/\D/g, "");
    const duplicate = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (duplicate) return mobileError("ACCOUNT_EXISTS", "Bu e-posta veya telefonla kayıtlı hesap var.", { status: 409 });

    const hasInvitation = Boolean(input.invitationToken || input.invitationCode);
    const invitation = input.invitationToken
      ? await findPendingInvitation(input.invitationToken)
      : input.invitationCode
        ? await findPendingInvitationByCode(input.invitationCode)
        : null;
    if (hasInvitation && !invitation) return mobileError("INVITATION_INVALID", invitationMessages.INVITATION_INVALID, { status: 404 });
    if (invitation && invitation.email !== email) {
      return mobileError("INVITATION_EMAIL_MISMATCH", invitationMessages.INVITATION_EMAIL_MISMATCH, { status: 403 });
    }

    const trial = invitation ? null : await prisma.plan.findUnique({ where: { slug: "trial" } });
    if (!invitation && !trial) return mobileError("CONFIGURATION_ERROR", "Deneme paketi yapılandırılmamış.", { status: 503 });

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

      let company;
      let membership;
      if (invitation) {
        const accepted = await acceptCompanyInvitationInTransaction(tx, {
          token: input.invitationToken,
          code: input.invitationCode,
          userId: user.id,
          email: user.email,
        });
        company = await tx.company.findUniqueOrThrow({ where: { id: accepted.companyId } });
        membership = accepted.membership;
      } else {
        company = await tx.company.create({
          data: { name: `${user.name} Şirketi`, ownerId: user.id, email: user.email, phone: user.phone },
        });
        membership = await tx.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });
        await ensureSevenDayTrial(tx, { companyId: company.id, planId: trial!.id, userId: user.id });
        await tx.companyBillingProfile.create({
          data: { companyId: company.id, billingType: "COMPANY", companyName: company.name, country: "TR", city: "-", addressLine1: "-", billingEmail: user.email },
        });
        await tx.onboardingChecklist.create({ data: { companyId: company.id } });
      }

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
    await writeAuditLog(request, {
      companyId: result.company.id,
      userId: result.user.id,
      action: invitation ? "mobile.workspace.invitation_registered" : "mobile.workspace.registered",
      entityType: "Company",
      entityId: result.company.id,
    });
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
    if (error instanceof Error && invitationMessages[error.message]) {
      return mobileError(error.message, invitationMessages[error.message], { status: companyInvitationErrorStatus(error.message) });
    }
    return mobileSafeError(error, "Kayıt tamamlanamadı.");
  }
}
