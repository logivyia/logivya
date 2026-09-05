import { randomBytes } from "node:crypto";

import { authPasswordErrorCode } from "@/features/auth/schemas";
import { getRequestLocale } from "@/i18n/server";
import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { getPlatformAdminProfile } from "@/server/auth/platform-admin";
import { createPendingTrialEntitlement } from "@/server/billing/trial-service";
import { prisma } from "@/server/db";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { mobileRegistrationSchema } from "@/server/mobile/registration-schema";
import { issueEmailVerification } from "@/server/auth/email-verification";
import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { readMobileJson } from "@/server/mobile/request-json";
import {
  mobileError,
  mobileSafeError,
  mobileSuccess,
  mobileValidationError,
} from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { requestCorrelationId } from "@/server/observability/request-id";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import {
  hashPassword,
  PasswordPolicyValidationError,
} from "@/server/security/passwords";
import {
  acceptCompanyInvitationInTransaction,
  companyInvitationErrorStatus,
  findPendingInvitation,
  findPendingInvitationByCode,
} from "@/server/team/company-invitations";

const invitationMessages: Record<string, string> = {
  INVITATION_INVALID: "auth.invitationInvalid",
  INVITATION_EXPIRED: "auth.invitationExpired",
  INVITATION_EMAIL_MISMATCH: "auth.invitationEmailMismatch",
  INVITATION_ALREADY_USED: "auth.invitationAlreadyUsed",
  INVITATION_REVOKED: "auth.invitationRevoked",
  INVITATION_DECLINED: "auth.invitationDeclined",
  SEAT_LIMIT_REACHED: "api.error.seatLimitReached",
  RATE_LIMITED: "api.error.rateLimited",
};

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const route = "/api/mobile/auth/register";
  try {
    const requestedLocale = await getRequestLocale(
      request.headers.get("x-logivya-locale"),
    );
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;

    const parsed = mobileRegistrationSchema.safeParse(body.data);
    if (!parsed.success) {
      const code = authPasswordErrorCode(parsed.error);
      if (code) {
        logger.warn(
          code === "PASSWORD_TOO_SHORT"
            ? "PASSWORD_TOO_SHORT_REJECTED"
            : code === "PASSWORD_CONFIRMATION_MISMATCH"
              ? "PASSWORD_CONFIRMATION_FAILED"
              : "REGISTRATION_VALIDATION_FAILED",
          {
            correlationId,
            route,
            platform: "android",
            code,
          },
        );
        return mobileError(code, code, {
          status: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }
      logger.warn("REGISTRATION_VALIDATION_FAILED", {
        correlationId,
        route,
        platform: "android",
        code: "VALIDATION_ERROR",
      });
      return mobileValidationError(parsed.error);
    }
    const ipAddress = clientIp(request);
    enforceMobileRateLimit(`mobile-register:${ipAddress}`, 8, 60 * 60_000);
    await enforceOperationRateLimit({
      scope: "mobile-register",
      subject: ipAddress,
      maxAttempts: 8,
      windowMs: 60 * 60_000,
      request,
    });

    const input = parsed.data;
    await enforceOperationRateLimit({
      scope: "mobile-register-device",
      subject: input.deviceId,
      maxAttempts: 3,
      windowMs: 24 * 60 * 60_000,
      request,
    });
    const email = input.email.trim().toLowerCase();
    const phone = input.phone?.replace(/\D/g, "") || null;
    const duplicate = await prisma.user.findFirst({
      where: { OR: phone ? [{ email }, { phone }] : [{ email }] },
    });
    if (duplicate) {
      return mobileError(
        "ACCOUNT_EXISTS",
        phone
          ? "Bu e-posta veya telefonla kayıtlı hesap var."
          : "Bu e-posta ile kayıtlı hesap var.",
        { status: 409 },
      );
    }

    const hasInvitation = Boolean(
      input.invitationToken || input.invitationCode,
    );
    const invitation = input.invitationToken
      ? await findPendingInvitation(input.invitationToken)
      : input.invitationCode
        ? await findPendingInvitationByCode(input.invitationCode)
        : null;
    if (hasInvitation && !invitation)
      return mobileError(
        "INVITATION_INVALID",
        invitationMessages.INVITATION_INVALID,
        { status: 404 },
      );
    if (invitation && invitation.email !== email) {
      return mobileError(
        "INVITATION_EMAIL_MISMATCH",
        invitationMessages.INVITATION_EMAIL_MISMATCH,
        { status: 403 },
      );
    }

    const passwordHash = await hashPassword(
      input.password,
      process.env.PASSWORD_PEPPER ?? "",
    );
    const userAgent = request.headers.get("user-agent");
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          username: `user-${randomBytes(12).toString("hex")}`,
          phone,
          email,
          passwordHash,
          locale: requestedLocale,
          emailVerifiedAt: invitation ? new Date() : undefined,
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
        company = await tx.company.findUniqueOrThrow({
          where: { id: accepted.companyId },
        });
        membership = accepted.membership;
      } else {
        company = await tx.company.create({
          data: {
            name: user.name.trim(),
            ownerId: user.id,
            email: user.email,
            phone: user.phone,
          },
        });
        membership = await tx.companyUser.create({
          data: {
            companyId: company.id,
            userId: user.id,
            role: "OWNER",
            lifecycleState: "INDEPENDENT_OWNER",
          },
        });
        await createPendingTrialEntitlement(tx, {
          companyId: company.id,
          userId: user.id,
          registrationPhone: phone,
          ipAddress,
          deviceFingerprint: input.deviceId,
        });
        await tx.onboardingChecklist.create({
          data: { companyId: company.id },
        });
      }

      await tx.consentRecord.createMany({
        data: [
          {
            userId: user.id,
            type: "TERMS_OF_SERVICE",
            version: "2026-06-12",
            granted: true,
            ipAddress,
            userAgent,
          },
          {
            userId: user.id,
            type: "PRIVACY_POLICY",
            version: "2026-06-12",
            granted: true,
            ipAddress,
            userAgent,
          },
          {
            userId: user.id,
            type: "KVKK",
            version: "2026-06-12",
            granted: true,
            ipAddress,
            userAgent,
          },
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
    if (!invitation) {
      await issueEmailVerification(request, {
        userId: result.user.id,
        companyId: result.company.id,
        email: result.user.email,
      }).catch((error) =>
        logger.error("EMAIL_VERIFICATION_ISSUE_FAILED", error, {
          correlationId,
          userId: result.user.id,
          companyId: result.company.id,
        }),
      );
    }
    await writeAuditLog(request, {
      companyId: result.company.id,
      userId: result.user.id,
      action: invitation
        ? "mobile.workspace.invitation_registered"
        : "mobile.workspace.registered",
      entityType: "Company",
      entityId: result.company.id,
    });
    const platformAdmin = await getPlatformAdminProfile({
      userId: result.user.id,
      email: result.user.email,
    });
    const { isPlatformAdmin } = platformAdmin;

    logger.info("REGISTRATION_SUCCEEDED", {
      correlationId,
      route,
      platform: input.platform ?? "android",
      appVersion: input.appVersion,
      userId: result.user.id,
      companyId: result.company.id,
    });

    return mobileSuccess(
      {
        tokens,
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          phone: result.user.phone,
          role: result.membership.role,
          isPlatformAdmin,
        },
        company: { id: result.company.id, name: result.company.name },
        role: result.membership.role,
        isAdmin: isPlatformAdmin,
        isPlatformAdmin,
        platformAdminRole: platformAdmin.platformAdminRole,
        adminPermissions: platformAdmin.adminPermissions,
        permissions: PERMISSIONS.filter((permission) =>
          hasPermission(result.membership.role, permission),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PasswordPolicyValidationError) {
      logger.warn(
        error.code === "PASSWORD_TOO_SHORT"
          ? "PASSWORD_TOO_SHORT_REJECTED"
          : "REGISTRATION_VALIDATION_FAILED",
        {
          correlationId,
          route,
          platform: "android",
          code: error.code,
        },
      );
      return mobileError(error.code, error.code, { status: 400 });
    }
    if (error instanceof Error && invitationMessages[error.message]) {
      return mobileError(error.message, invitationMessages[error.message], {
        status: companyInvitationErrorStatus(error.message),
      });
    }
    logger.error("REGISTRATION_FAILED", error, {
      correlationId,
      route,
      platform: "android",
      code: "REGISTRATION_FAILED",
    });
    return mobileSafeError(error, "Kayıt tamamlanamadı.");
  }
}
