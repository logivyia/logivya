import "server-only";

import {
  CHECKOUT_PROFILE_ERROR_CODES,
  evaluateCheckoutIdentity,
} from "@/server/billing/checkout-identity";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { resolveMembershipAccess } from "@/server/team/membership-lifecycle";

export async function getSubscriptionCheckoutEligibility(input: {
  companyId: string;
  userId: string;
  correlationId?: string;
}) {
  const [user, profile, access] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        email: true,
        phone: true,
      },
    }),
    prisma.companyBillingProfile.findUnique({
      where: { companyId: input.companyId },
      select: {
        billingType: true,
        billingPhone: true,
        addressLine1: true,
        addressLine2: true,
        district: true,
        city: true,
        postalCode: true,
        country: true,
      },
    }),
    resolveMembershipAccess(input.companyId, input.userId),
  ]);

  if (!user) {
    return {
      eligible: false,
      missingFields: [...CHECKOUT_PROFILE_ERROR_CODES],
      blockerCode: "USER_NOT_FOUND",
      customer: null,
      membershipAccess: access,
    };
  }

  const identity = evaluateCheckoutIdentity({
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.name,
    email: user.email,
  });
  const blockerCode = access.sharedAccess
    ? "ACTIVE_SHARED_MEMBERSHIP_EXISTS"
    : !access.capabilities["tenant.subscription.manage"]
        && !access.capabilities["personal.subscription.request"]
      ? "INDEPENDENT_CONVERSION_NOT_ALLOWED"
      : null;
  const personalProfile = profile?.billingType === "INDIVIDUAL" ? profile : null;
  const address = personalProfile
    ? [
        personalProfile.addressLine1,
        personalProfile.addressLine2,
        personalProfile.district,
        personalProfile.city,
        personalProfile.postalCode,
        personalProfile.country,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  logger.info("billing.checkout.eligibility_evaluated", {
    correlationId: input.correlationId,
    userId: input.userId,
    companyId: input.companyId,
    eligible: identity.eligible && !blockerCode,
    missingFields: identity.missingFields,
    identitySource: identity.identitySource,
    blockerCode,
  });

  return {
    eligible: identity.eligible && !blockerCode,
    missingFields: identity.missingFields,
    blockerCode,
    customer: {
      ...identity.customer,
      phone:
        user.phone?.trim() || personalProfile?.billingPhone?.trim() || null,
      address,
    },
    identitySource: identity.identitySource,
    membershipAccess: access,
  };
}
