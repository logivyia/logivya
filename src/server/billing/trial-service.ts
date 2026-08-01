import { Prisma as PrismaRuntime, type Prisma } from "@prisma/client";

import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { trialEndsAt } from "@/server/billing/trial-policy";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { encryptPrivateValue, keyedPrivateHash } from "@/server/security/private-fields";

type PendingTrialInput = {
  companyId: string;
  userId: string;
  registrationPhone?: string | null;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
};

const IDENTITY_CONSUMING_STATUSES = ["ACTIVE", "CONSUMED", "PAID_USAGE"] as const;
const TRIAL_TRANSACTION_ATTEMPTS = 3;

function isRetryableTrialTransactionError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String(error.code);
  return code === "P2034" || code === "40001";
}

function optionalHash(purpose: string, value?: string | null) {
  const normalized = value?.trim();
  return normalized ? keyedPrivateHash(purpose, normalized) : null;
}

export function normalizeVerifiedPhone(value: string, defaultCountryCallingCode = "90") {
  let digits = value.replace(/\D/gu, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `${defaultCountryCallingCode}${digits.slice(1)}`;
  if (!digits.startsWith(defaultCountryCallingCode) && digits.length === 10) digits = `${defaultCountryCallingCode}${digits}`;
  if (digits.length < 8 || digits.length > 15) throw new Error("VERIFIED_WHATSAPP_PHONE_INVALID");
  return `+${digits}`;
}

function normalizeWhatsAppIdentity(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 200) throw new Error("VERIFIED_WHATSAPP_IDENTITY_INVALID");
  return normalized;
}

export function createPendingTrialEntitlement(tx: Prisma.TransactionClient, input: PendingTrialInput) {
  return tx.trialEntitlement.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      status: "PENDING_IDENTITY",
      registrationPhoneHash: optionalHash("registration-phone", input.registrationPhone),
      registrationIpHash: optionalHash("registration-ip", input.ipAddress),
      deviceFingerprintHash: optionalHash("registration-device", input.deviceFingerprint),
      decisionCode: "AWAITING_VERIFIED_WHATSAPP_IDENTITY",
    },
  });
}

async function acquireIdentityLocks(tx: Prisma.TransactionClient, hashes: string[]) {
  for (const hash of [...new Set(hashes)].sort()) {
    await tx.$queryRaw<Array<{ acquired: boolean }>>`
      WITH identity_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${hash}, 0))
      )
      SELECT TRUE AS "acquired" FROM identity_lock
    `;
  }
}

async function supportingRisk(tx: Prisma.TransactionClient, candidate: {
  id: string;
  registrationPhoneHash: string | null;
  registrationIpHash: string | null;
  deviceFingerprintHash: string | null;
}) {
  const signals: string[] = [];
  let score = 0;
  const status = { in: [...IDENTITY_CONSUMING_STATUSES] };
  const registrationPhoneMatches = candidate.registrationPhoneHash
    ? await tx.trialEntitlement.count({ where: { id: { not: candidate.id }, registrationPhoneHash: candidate.registrationPhoneHash, status } })
    : 0;
  const registrationIpMatches = candidate.registrationIpHash
    ? await tx.trialEntitlement.count({ where: { id: { not: candidate.id }, registrationIpHash: candidate.registrationIpHash, status } })
    : 0;
  const deviceFingerprintMatches = candidate.deviceFingerprintHash
    ? await tx.trialEntitlement.count({ where: { id: { not: candidate.id }, deviceFingerprintHash: candidate.deviceFingerprintHash, status } })
    : 0;
  const checks = [registrationPhoneMatches, registrationIpMatches, deviceFingerprintMatches];
  if (checks[0]) { score += 25; signals.push("REGISTRATION_PHONE_REUSED"); }
  if (checks[1]) { score += 15; signals.push("REGISTRATION_NETWORK_REUSED"); }
  if (checks[2]) { score += 35; signals.push("DEVICE_FINGERPRINT_REUSED"); }
  return { score, signals };
}

async function recordPaidIdentity(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    userId: string;
    accountId: string;
    phoneEncrypted: string;
    phoneHash: string;
    identityHash: string;
    subscriptionId: string;
  },
) {
  const duplicate = await tx.trialEntitlement.findFirst({
    where: {
      OR: [{ phoneHash: input.phoneHash }, { whatsappIdentityHash: input.identityHash }],
      status: { in: [...IDENTITY_CONSUMING_STATUSES] },
      NOT: { companyId: input.companyId, userId: input.userId },
    },
    select: { id: true },
  });
  const status = duplicate ? "INELIGIBLE" : "PAID_USAGE";
  const decisionCode = duplicate ? "IDENTITY_ALREADY_RECORDED" : "PAID_IDENTITY_RECORDED";
  const entitlement = await tx.trialEntitlement.upsert({
    where: { companyId_userId: { companyId: input.companyId, userId: input.userId } },
    create: {
      companyId: input.companyId,
      userId: input.userId,
      whatsappAccountId: input.accountId,
      status,
      phoneEncrypted: input.phoneEncrypted,
      phoneHash: input.phoneHash,
      whatsappIdentityHash: input.identityHash,
      decisionCode,
      consumedAt: new Date(),
    },
    update: {
      whatsappAccountId: input.accountId,
      status,
      phoneEncrypted: input.phoneEncrypted,
      phoneHash: input.phoneHash,
      whatsappIdentityHash: input.identityHash,
      decisionCode,
      consumedAt: new Date(),
    },
  });
  await tx.subscriptionAuditLog.create({
    data: {
      companyId: input.companyId,
      subscriptionId: input.subscriptionId,
      actorUserId: input.userId,
      eventType: "PAID_WHATSAPP_IDENTITY_VERIFIED",
      newState: { entitlementId: entitlement.id, status, accountId: input.accountId },
    },
  });
  return { outcome: "PAID_IDENTITY_RECORDED" as const, entitlement };
}

export async function activateTrialAfterVerifiedWhatsAppConnection(accountId: string) {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: accountId },
    select: { id: true, companyId: true, userId: true, phoneNumber: true, deviceId: true, status: true, lastConnectedAt: true },
  });
  if (!account?.userId || account.status !== "CONNECTED" || !account.phoneNumber || !account.deviceId) {
    return { outcome: "IDENTITY_NOT_READY" as const };
  }

  const phone = normalizeVerifiedPhone(account.phoneNumber);
  const identity = normalizeWhatsAppIdentity(account.deviceId);
  const phoneHash = keyedPrivateHash("verified-whatsapp-phone", phone);
  const identityHash = keyedPrivateHash("verified-whatsapp-identity", identity);
  const phoneEncrypted = encryptPrivateValue(phone);
  const connectedAt = account.lastConnectedAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    await acquireIdentityLocks(tx, [`trial-owner:${account.companyId}:${account.userId}`, phoneHash, identityHash]);
    const company = await tx.company.findUnique({ where: { id: account.companyId }, select: { ownerId: true } });
    const current = await resolveCompanyEntitlements(account.companyId, tx);
    const candidate = await tx.trialEntitlement.findUnique({ where: { companyId_userId: { companyId: account.companyId, userId: account.userId! } } });
    if (!company) return { outcome: "COMPANY_NOT_FOUND" as const };

    if (current?.valid && current.subscription.source !== "TRIAL") {
      return recordPaidIdentity(tx, {
        companyId: account.companyId,
        userId: account.userId!,
        accountId: account.id,
        phoneEncrypted,
        phoneHash,
        identityHash,
        subscriptionId: current.subscription.id,
      });
    }

    if (current?.valid && current.subscription.source === "TRIAL") {
      if (!candidate) return { outcome: "ACTIVE_TRIAL_WITHOUT_ENTITLEMENT" as const };
      const entitlement = await tx.trialEntitlement.update({
        where: { id: candidate.id },
        data: {
          whatsappAccountId: account.id,
          status: "ACTIVE",
          phoneEncrypted,
          phoneHash,
          whatsappIdentityHash: identityHash,
          decisionCode: "TRIAL_ALREADY_ACTIVE",
        },
      });
      return { outcome: "TRIAL_ALREADY_ACTIVE" as const, entitlement };
    }

    if (!candidate || candidate.status !== "PENDING_IDENTITY" || company.ownerId !== account.userId) {
      return { outcome: "NO_PENDING_TRIAL" as const };
    }

    const duplicate = await tx.trialEntitlement.findFirst({
      where: {
        id: { not: candidate.id },
        status: { in: [...IDENTITY_CONSUMING_STATUSES] },
        OR: [{ phoneHash }, { whatsappIdentityHash: identityHash }],
      },
      select: { id: true },
    });
    const risk = await supportingRisk(tx, candidate);
    if (duplicate || (risk.score >= 70 && candidate.decisionCode !== "MANUAL_REVIEW_APPROVED")) {
      const status = duplicate ? "INELIGIBLE" : "BLOCKED";
      const decisionCode = duplicate ? "TRIAL_IDENTITY_ALREADY_USED" : "TRIAL_RISK_REVIEW_REQUIRED";
      const entitlement = await tx.trialEntitlement.update({
        where: { id: candidate.id },
        data: {
          whatsappAccountId: account.id,
          status,
          phoneEncrypted,
          phoneHash,
          whatsappIdentityHash: identityHash,
          riskScore: risk.score,
          riskSignals: risk.signals,
          decisionCode,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: account.companyId,
          userId: account.userId,
          action: "TRIAL_ELIGIBILITY_REJECTED",
          entityType: "TrialEntitlement",
          entityId: entitlement.id,
          metadata: { decisionCode, riskScore: risk.score, riskSignals: risk.signals },
        },
      });
      return { outcome: decisionCode, entitlement };
    }

    const plan = await tx.plan.findUnique({ where: { slug: "trial" } });
    if (!plan?.isActive) throw new Error("TRIAL_PLAN_NOT_CONFIGURED");
    const startedAt = connectedAt;
    const endsAt = trialEndsAt(startedAt);
    const subscription = await tx.subscription.create({
      data: {
        companyId: account.companyId,
        planId: plan.id,
        status: "TRIALING",
        billingPeriod: "TRIAL",
        startsAt: startedAt,
        endsAt,
        trialStartsAt: startedAt,
        trialEndsAt: endsAt,
        currentPeriodStartsAt: startedAt,
        currentPeriodEndsAt: endsAt,
        source: "TRIAL",
        provider: "MANUAL",
      },
    });
    const entitlement = await tx.trialEntitlement.update({
      where: { id: candidate.id },
      data: {
        whatsappAccountId: account.id,
        status: "ACTIVE",
        phoneEncrypted,
        phoneHash,
        whatsappIdentityHash: identityHash,
        riskScore: risk.score,
        riskSignals: risk.signals,
        decisionCode: "TRIAL_STARTED_AFTER_WHATSAPP_CONNECTION",
        startedAt,
        endsAt,
        consumedAt: startedAt,
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        companyId: account.companyId,
        subscriptionId: subscription.id,
        actorUserId: account.userId,
        type: "TRIAL_STARTED",
        message: "7 günlük ücretsiz deneme, doğrulanmış WhatsApp bağlantısı ile başlatıldı.",
      },
    });
    await tx.subscriptionAuditLog.create({
      data: {
        companyId: account.companyId,
        subscriptionId: subscription.id,
        actorUserId: account.userId,
        eventType: "TRIAL_STARTED_AFTER_WHATSAPP_CONNECTION",
        newState: { plan: plan.slug, startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString(), entitlementId: entitlement.id },
      },
    });
    await tx.notification.create({
      data: {
        companyId: account.companyId,
        userId: account.userId,
        type: "TRIAL_STARTED",
        title: "Deneme paketi başladı",
        message: "7 günlük ücretsiz denemeniz WhatsApp bağlantınız doğrulandıktan sonra başladı.",
      },
    });
    return { outcome: "TRIAL_STARTED" as const, entitlement, subscription };
  }, { isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable });
}

export async function safelyEvaluateTrialAfterConnection(accountId: string) {
  for (let attempt = 1; attempt <= TRIAL_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      const result = await activateTrialAfterVerifiedWhatsAppConnection(accountId);
      logger.info("trial.identity_evaluated", { accountId, outcome: result.outcome, attempt });
      return result;
    } catch (error) {
      if (isRetryableTrialTransactionError(error) && attempt < TRIAL_TRANSACTION_ATTEMPTS) {
        logger.warn("trial.identity_evaluation_retry", { accountId, attempt });
        continue;
      }
      logger.error("trial.identity_evaluation_failed", error, { accountId, attempt });
      return { outcome: "TRIAL_ACTIVATION_FAILED" as const };
    }
  }
  return { outcome: "TRIAL_ACTIVATION_FAILED" as const };
}

export async function reconcileConnectedPendingTrials(limit = 100) {
  const take = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const candidates = await prisma.trialEntitlement.findMany({
    where: {
      status: "PENDING_IDENTITY",
      whatsappAccountId: { not: null },
      whatsappAccount: { is: { status: "CONNECTED", archivedAt: null } },
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true, whatsappAccountId: true },
  });

  const results: Array<{ entitlementId: string; accountId: string; outcome: string }> = [];
  for (const candidate of candidates) {
    if (!candidate.whatsappAccountId) continue;
    const result = await safelyEvaluateTrialAfterConnection(candidate.whatsappAccountId);
    results.push({
      entitlementId: candidate.id,
      accountId: candidate.whatsappAccountId,
      outcome: result.outcome,
    });
  }
  return results;
}
