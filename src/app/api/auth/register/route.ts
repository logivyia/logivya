import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { authPasswordErrorCode, registerSchema } from "@/features/auth/schemas";
import { getRequestLocale, getServerTranslator } from "@/i18n/server";
import { createSession } from "@/server/auth/session";
import { ensureSevenDayTrial } from "@/server/billing/trial-service";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { requestCorrelationId } from "@/server/observability/request-id";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { hashPassword, PasswordPolicyValidationError } from "@/server/security/passwords";
import {
  acceptCompanyInvitationInTransaction,
  companyInvitationErrorStatus,
  findPendingInvitation,
  findPendingInvitationByCode,
} from "@/server/team/company-invitations";

const exposedRegistrationErrors = new Set([
  "RATE_LIMITED",
  "INVITATION_INVALID",
  "INVITATION_EXPIRED",
  "INVITATION_EMAIL_MISMATCH",
  "INVITATION_ALREADY_USED",
  "INVITATION_REVOKED",
  "INVITATION_DECLINED",
  "SEAT_LIMIT_REACHED",
]);

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const route = "/api/auth/register";
  try {
    const requestedLocale = await getRequestLocale(request.headers.get("x-logivya-locale"));
    const { t } = await getServerTranslator(requestedLocale);
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) {
      const code = authPasswordErrorCode(parsed.error) ?? "VALIDATION_ERROR";
      logger.warn(code === "PASSWORD_TOO_SHORT" ? "PASSWORD_TOO_SHORT_REJECTED" : code === "PASSWORD_CONFIRMATION_MISMATCH" ? "PASSWORD_CONFIRMATION_FAILED" : "REGISTRATION_VALIDATION_FAILED", {
        correlationId,
        route,
        platform: "web",
        appVersion: request.headers.get("x-logivya-app-version") ?? undefined,
        code,
      });
      return NextResponse.json({ error: code, fields: parsed.error.flatten().fieldErrors, correlationId }, { status: 400 });
    }

    const input = parsed.data;
    const fullName = input.name.trim();
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedPhone = input.phone.replace(/\D/g, "");
    const defaultCompanyName = fullName ? t("registration.defaultCompanyName", { name: fullName }) : t("registration.newCompany");
    const ipAddress = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    await enforceOperationRateLimit({
      scope: "web-register",
      subject: ipAddress ?? "unknown",
      maxAttempts: 8,
      windowMs: 60 * 60 * 1000,
      request,
    });

    const duplicate = await prisma.user.findFirst({ where: { OR: [{ email: normalizedEmail }, { phone: normalizedPhone }] } });
    if (duplicate) {
      const code = duplicate.email === normalizedEmail ? "EMAIL_ALREADY_REGISTERED" : "ACCOUNT_EXISTS";
      return NextResponse.json({ error: code, correlationId }, { status: 409 });
    }

    const hasInvitation = Boolean(input.invitationToken || input.invitationCode);
    const invitation = input.invitationToken
      ? await findPendingInvitation(input.invitationToken)
      : input.invitationCode
        ? await findPendingInvitationByCode(input.invitationCode)
        : null;
    if (hasInvitation && !invitation) return NextResponse.json({ error: "INVITATION_INVALID" }, { status: 404 });
    if (invitation && invitation.email !== normalizedEmail) {
      return NextResponse.json({ error: "INVITATION_EMAIL_MISMATCH" }, { status: 403 });
    }

    const trial = invitation ? null : await prisma.plan.findUnique({ where: { slug: "trial" } });
    if (!invitation && !trial) return NextResponse.json({ error: "auth.trialUnavailable" }, { status: 503 });

    const passwordHash = await hashPassword(input.password, process.env.PASSWORD_PEPPER ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: fullName,
          username: `user-${randomBytes(12).toString("hex")}`,
          phone: normalizedPhone,
          email: normalizedEmail,
          passwordHash,
          locale: requestedLocale,
        },
      });

      let company;
      if (invitation) {
        const accepted = await acceptCompanyInvitationInTransaction(tx, {
          token: input.invitationToken,
          code: input.invitationCode,
          userId: user.id,
          email: user.email,
        });
        company = await tx.company.findUniqueOrThrow({ where: { id: accepted.companyId } });
      } else {
        company = await tx.company.create({
          data: { name: defaultCompanyName, ownerId: user.id, email: user.email, phone: user.phone },
        });
        await tx.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });
        await ensureSevenDayTrial(tx, { companyId: company.id, planId: trial!.id, userId: user.id });
        await tx.companyBillingProfile.create({
          data: {
            companyId: company.id,
            billingType: "COMPANY",
            companyName: company.name,
            country: "TR",
            city: "-",
            addressLine1: "-",
            billingEmail: user.email,
          },
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

      if (input.referralCode && !invitation) {
        const referral = await tx.referralCode.findFirst({ where: { code: input.referralCode, isActive: true } });
        if (referral) {
          await tx.referralSignup.create({
            data: { referralCodeId: referral.id, referredUserId: user.id, referredCompanyId: company.id },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: user.id,
          action: invitation ? "workspace.invitation_registered" : "workspace.registered",
          entityType: "Company",
          entityId: company.id,
          ipAddress,
          userAgent,
        },
      });

      return { user, company };
    });

    await createSession(result.user.id, result.company.id, request);
    logger.info("REGISTRATION_SUCCEEDED", {
      correlationId,
      route,
      platform: "web",
      appVersion: request.headers.get("x-logivya-app-version") ?? undefined,
      userId: result.user.id,
      companyId: result.company.id,
    });
    return NextResponse.json({ ok: true, correlationId }, { status: 201 });
  } catch (error) {
    if (error instanceof PasswordPolicyValidationError) {
      logger.warn(error.code === "PASSWORD_TOO_SHORT" ? "PASSWORD_TOO_SHORT_REJECTED" : "REGISTRATION_VALIDATION_FAILED", {
        correlationId,
        route,
        platform: "web",
        code: error.code,
      });
      return NextResponse.json({ error: error.code, correlationId }, { status: 400 });
    }
    const rawCode = error instanceof Error ? error.message : "errors.generic";
    const code = exposedRegistrationErrors.has(rawCode) ? rawCode : "REGISTRATION_FAILED";
    logger.error("REGISTRATION_FAILED", error, { correlationId, route, platform: "web", code });
    return NextResponse.json({ error: code, correlationId }, { status: code === "REGISTRATION_FAILED" ? 500 : companyInvitationErrorStatus(code) });
  }
}
