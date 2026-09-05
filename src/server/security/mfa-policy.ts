import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";

export const MFA_METHOD_TYPES = ["TOTP", "EMAIL_OTP"] as const;
export const MFA_POLICY_VALUES = [
  "NONE",
  "REQUIRE_ANY_MFA",
  "REQUIRE_TOTP",
  "REQUIRE_TOTP_FOR_ADMINS",
] as const;

export type MfaMethodType = (typeof MFA_METHOD_TYPES)[number];
export type MfaPolicy = (typeof MFA_POLICY_VALUES)[number];

export function isMfaMethodType(value: unknown): value is MfaMethodType {
  return (
    typeof value === "string" &&
    MFA_METHOD_TYPES.includes(value as MfaMethodType)
  );
}

export function normalizeMfaPolicy(value: unknown): MfaPolicy {
  return typeof value === "string" &&
    MFA_POLICY_VALUES.includes(value as MfaPolicy)
    ? (value as MfaPolicy)
    : "NONE";
}

export function policyRequiresTotp(policy: MfaPolicy, role: string) {
  return (
    policy === "REQUIRE_TOTP" ||
    (policy === "REQUIRE_TOTP_FOR_ADMINS" &&
      (role === "OWNER" || role === "ADMIN"))
  );
}

export function policyRequiresAnyMfa(policy: MfaPolicy, role: string) {
  return policy === "REQUIRE_ANY_MFA" || policyRequiresTotp(policy, role);
}

export function evaluateMfaLoginDecision(input: {
  enabledMethods: readonly MfaMethodType[];
  companyPolicy: unknown;
  role: string;
  legacyRequired?: boolean;
  preferredMethod?: string | null;
}) {
  const enabledMethods = MFA_METHOD_TYPES.filter((method) =>
    input.enabledMethods.includes(method),
  );
  const policy = normalizeMfaPolicy(input.companyPolicy);
  const totpRequired = policyRequiresTotp(policy, input.role);
  const legacyProtectionApplies =
    Boolean(input.legacyRequired) && enabledMethods.length > 0;
  const anyRequired =
    policyRequiresAnyMfa(policy, input.role) || legacyProtectionApplies;
  const policySatisfied =
    !anyRequired ||
    (totpRequired
      ? enabledMethods.includes("TOTP")
      : enabledMethods.length > 0);
  const preferredMethod =
    isMfaMethodType(input.preferredMethod) &&
    enabledMethods.includes(input.preferredMethod)
      ? input.preferredMethod
      : (enabledMethods[0] ?? null);

  return {
    enabledMethods,
    policy,
    policySatisfied,
    mfaRequired: enabledMethods.length > 0 || anyRequired,
    setupRequired: anyRequired && !policySatisfied,
    requiredEnrollmentMethods: totpRequired
      ? (["TOTP"] as MfaMethodType[])
      : [...MFA_METHOD_TYPES],
    selectedMethod: preferredMethod,
  };
}

export async function enabledMfaMethods(userId: string) {
  return prisma.mfaCredential.findMany({
    where: {
      userId,
      status: "ENABLED",
      verifiedAt: { not: null },
      revokedAt: null,
      type: { in: [...MFA_METHOD_TYPES] },
    },
    orderBy: [
      { isPreferred: "desc" },
      { enabledAt: "desc" },
      { createdAt: "desc" },
    ],
  });
}

export async function resolveMfaLoginDecision(input: {
  userId: string;
  companyPolicy: unknown;
  role: string;
  legacyRequired?: boolean;
  preferredMethod?: string | null;
}) {
  const methods = await enabledMfaMethods(input.userId);
  const enabledMethods = methods
    .map((method) => method.type)
    .filter(isMfaMethodType);
  const persistedPreferred =
    methods.find((method) => method.isPreferred)?.type ?? input.preferredMethod;
  const decision = evaluateMfaLoginDecision({
    enabledMethods,
    companyPolicy: input.companyPolicy,
    role: input.role,
    legacyRequired: input.legacyRequired,
    preferredMethod: persistedPreferred,
  });

  return {
    methods,
    ...decision,
  };
}

export async function listMfaMethodState(input: {
  userId: string;
  companyPolicy: unknown;
  role: string;
  preferredMethod?: string | null;
}) {
  const records = await prisma.mfaCredential.findMany({
    where: { userId: input.userId, type: { in: [...MFA_METHOD_TYPES] } },
    orderBy: { createdAt: "desc" },
  });
  const latest = new Map<MfaMethodType, (typeof records)[number]>();
  const active = new Map<MfaMethodType, (typeof records)[number]>();
  for (const record of records) {
    if (!isMfaMethodType(record.type)) continue;
    if (!latest.has(record.type)) latest.set(record.type, record);
    if (
      record.status === "ENABLED" &&
      record.verifiedAt &&
      !record.revokedAt &&
      !active.has(record.type)
    ) {
      active.set(record.type, record);
    }
  }
  const methods = MFA_METHOD_TYPES.map((type) => {
    const record = active.get(type) ?? latest.get(type);
    const status = record?.status ?? "DISABLED";
    return {
      type,
      status,
      enabled: status === "ENABLED" && !record?.revokedAt,
      preferred: Boolean(
        record?.isPreferred && status === "ENABLED" && !record.revokedAt,
      ),
      verifiedAt: record?.verifiedAt ?? null,
      enabledAt: record?.enabledAt ?? null,
      disabledAt: record?.disabledAt ?? null,
      setupExpiresAt: record?.setupExpiresAt ?? null,
    };
  });
  const enabled = methods.filter((method) => method.enabled);
  const policy = normalizeMfaPolicy(input.companyPolicy);
  const totpRequired = policyRequiresTotp(policy, input.role);
  const compliant =
    !policyRequiresAnyMfa(policy, input.role) ||
    (totpRequired
      ? enabled.some((method) => method.type === "TOTP")
      : enabled.length > 0);
  const preferredMethod =
    methods.find((method) => method.preferred)?.type ??
    (isMfaMethodType(input.preferredMethod) &&
    enabled.some((method) => method.type === input.preferredMethod)
      ? input.preferredMethod
      : null) ??
    enabled[0]?.type ??
    null;
  return { methods, preferredMethod, policy, policyCompliant: compliant };
}

export async function synchronizeMfaPreference(
  tx: Prisma.TransactionClient,
  userId: string,
  preferred?: MfaMethodType | null,
) {
  const enabled = await tx.mfaCredential.findMany({
    where: {
      userId,
      status: "ENABLED",
      verifiedAt: { not: null },
      revokedAt: null,
      type: { in: [...MFA_METHOD_TYPES] },
    },
    orderBy: [{ enabledAt: "desc" }, { createdAt: "desc" }],
  });
  const chosen =
    enabled.find((method) => method.type === preferred) ??
    enabled.find((method) => method.isPreferred) ??
    enabled[0] ??
    null;
  await tx.mfaCredential.updateMany({
    where: { userId, isPreferred: true },
    data: { isPreferred: false },
  });
  if (chosen)
    await tx.mfaCredential.update({
      where: { id: chosen.id },
      data: { isPreferred: true },
    });
  await tx.user.update({
    where: { id: userId },
    data: {
      preferredMfaMethod: chosen?.type ?? null,
      mfaRequired: enabled.length > 0,
      mfaRequiredAt: enabled.length > 0 ? new Date() : null,
    },
  });
  return chosen?.type && isMfaMethodType(chosen.type) ? chosen.type : null;
}

export async function setPreferredMfaMethod(
  userId: string,
  method: MfaMethodType,
) {
  return prisma.$transaction(async (tx) => {
    const enabled = await tx.mfaCredential.findFirst({
      where: {
        userId,
        type: method,
        status: "ENABLED",
        verifiedAt: { not: null },
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!enabled) throw new Error("MFA_METHOD_NOT_ENABLED");
    return synchronizeMfaPreference(tx, userId, method);
  });
}

export async function disableMfaMethod(input: {
  userId: string;
  method: MfaMethodType;
  companyPolicy: unknown;
  role: string;
}) {
  const policy = normalizeMfaPolicy(input.companyPolicy);
  const enabled = await enabledMfaMethods(input.userId);
  const target = enabled.find((method) => method.type === input.method);
  if (!target) throw new Error("MFA_METHOD_NOT_ENABLED");
  const remaining = enabled.filter((method) => method.id !== target.id);
  if (policyRequiresTotp(policy, input.role) && input.method === "TOTP")
    throw new Error("MFA_METHOD_REQUIRED_BY_POLICY");
  if (policyRequiresAnyMfa(policy, input.role) && remaining.length === 0)
    throw new Error("MFA_METHOD_REQUIRED_BY_POLICY");
  const now = new Date();
  const preferred = await prisma.$transaction(async (tx) => {
    await tx.mfaCredential.update({
      where: { id: target.id },
      data: {
        status: "DISABLED",
        disabledAt: now,
        revokedAt: now,
        isPreferred: false,
      },
    });
    return synchronizeMfaPreference(tx, input.userId);
  });
  return {
    preferredMethod: preferred,
    remainingMethods: remaining
      .map((method) => method.type)
      .filter(isMfaMethodType),
  };
}
