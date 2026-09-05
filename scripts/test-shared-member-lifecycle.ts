import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const schema = read("prisma/schema.prisma");
for (const state of [
  "PENDING_ACTIVATION",
  "ACTIVE_SHARED_MEMBER",
  "SUSPENDED_FOR_SECURITY",
  "SHARED_SUBSCRIPTION_EXPIRED",
  "DETACHED",
  "INDEPENDENT_OWNER",
  "REMOVED_BEFORE_ACTIVATION",
]) {
  assert(schema.includes(state), `Schema is missing lifecycle state ${state}.`);
}
assert(schema.includes("SHARED_MEMBER_CONVERSION"));
assert(schema.includes("sourceMembershipId"));
assert(schema.includes("conversionCompanyId"));
assert(schema.includes("MEMBERSHIP\n  USER\n  COMPANY"));
assert(
  /lifecycleState\s+MembershipLifecycleState\s*(?:\r?\n|$)/.test(schema),
  "Lifecycle state must be explicit at creation and must not default to owner.",
);

const lifecycle = read("src/server/team/membership-lifecycle.ts");
for (const capability of [
  "tenant.members.read",
  "tenant.members.create",
  "tenant.members.manage_pending",
  "tenant.subscription.read",
  "tenant.subscription.manage",
  "personal.subscription.request",
  "membership.self_delete",
  "tenant.delete",
]) {
  assert(lifecycle.includes(`"${capability}"`), `Missing capability ${capability}.`);
}
assert(lifecycle.includes('"SHARED_SUBSCRIPTION_EXPIRED"'));
assert(lifecycle.includes('"personal.subscription.request": true'));
assert(lifecycle.includes("MEMBERSHIP_LIFECYCLE_RECONCILED"));
assert(lifecycle.includes('input.userStatus === "SUSPENDED"'));

const directUsers = read("src/server/team/direct-company-users.ts");
assert(directUsers.includes('lifecycleState: "PENDING_ACTIVATION"'));
assert(directUsers.includes("MEMBER_SELF_MANAGED_AFTER_ACTIVATION"));
assert(directUsers.includes("OWNER_ACTIVATED_MEMBER_MANAGEMENT_REJECTED"));

const passwordLifecycle = read("src/server/auth/temporary-password.ts");
assert(passwordLifecycle.includes('lifecycleState: "ACTIVE_SHARED_MEMBER"'));
assert(passwordLifecycle.includes("activationCompletedAt"));
assert(passwordLifecycle.includes("SHARED_MEMBER_ACTIVATED"));

const companyUsers = read("src/server/team/company-users.ts");
assert(companyUsers.includes("OWNER_MEMBER_STATUS_CHANGE_REJECTED"));
assert(companyUsers.includes("OWNER_MEMBER_REMOVAL_REJECTED"));
assert(companyUsers.includes('lifecycleState: "REMOVED_BEFORE_ACTIVATION"'));
assert(!companyUsers.includes("USER_SUSPENDED"));

const requests = read("src/server/billing/manual-subscription-requests.ts");
const checkoutEligibility = read(
  "src/server/billing/checkout-eligibility.ts",
);
assert(requests.includes("ACTIVE_SHARED_MEMBERSHIP_EXISTS"));
assert(
  checkoutEligibility.includes("INDEPENDENT_CONVERSION_NOT_ALLOWED"),
);
assert(
  checkoutEligibility.includes("ACTIVE_SHARED_MEMBERSHIP_EXISTS"),
);
assert(requests.includes('"SHARED_MEMBER_CONVERSION"'));
assert(requests.includes("sourceMembershipId"));

const conversion = read("src/server/billing/shared-member-conversion.ts");
assert(conversion.includes("TransactionIsolationLevel.Serializable"));
assert(conversion.includes('lifecycleState: "INDEPENDENT_OWNER"'));
assert(conversion.includes('lifecycleState: "DETACHED"'));
assert(conversion.includes("userSession.updateMany"));
assert(conversion.includes("mobileDeviceSession.updateMany"));
assert(conversion.includes("trustedDevice.updateMany"));
assert(conversion.includes("mobilePushToken.updateMany"));
assert(conversion.includes("forcedPasswordChangeChallenge.updateMany"));
assert(conversion.includes("mfaLoginChallenge.updateMany"));
assert(conversion.includes("const transitionAt = new Date()"));
assert(
  conversion.includes(
    "request.sourceCompanyId,\n      tx,\n      transitionAt,",
  ),
  "Source entitlement must be evaluated at conversion time, not at a future subscription start.",
);
assert(
  !conversion.includes("const now = input.startsAt"),
  "Security detachment must never be delayed until a future subscription start.",
);
for (const forbiddenCopy of [
  "whatsAppAccount.create",
  "whatsAppGroup.create",
  "contact.create",
  "category.create",
  "messageCampaign.create",
  "supportTicket.create",
]) {
  assert(
    !conversion.includes(forbiddenCopy),
    `Independent conversion must not copy source data via ${forbiddenCopy}.`,
  );
}

const deletion = read("src/server/privacy/requests.ts");
assert(deletion.includes("closeSharedMembership"));
assert(deletion.includes('lifecycleState: "DETACHED"'));
assert(deletion.includes('scope: "MEMBERSHIP"'));
assert(!/closeSharedMembership[\s\S]{0,8000}company\.delete/.test(deletion));

const webUsers = read("src/components/users-management-page.tsx");
const webSubscription = read("src/components/billing-subscriptions-page.tsx");
const mobileUsers = read("apps/mobile/src/screens/app/team-users-screen.tsx");
const mobileSubscription = read(
  "apps/mobile/src/screens/app/subscription-screen.tsx",
);
assert(webUsers.includes("membership.usersReadOnly"));
assert(webSubscription.includes("membership.sharedSubscriptionReadOnly"));
assert(mobileUsers.includes("usersReadOnlySharedMembership"));
assert(mobileSubscription.includes("membershipAccess?.capabilities"));
assert(!mobileSubscription.includes('user?.role === "OWNER"'));

const migration = read(
  "prisma/migrations/20260727183000_shared_member_lifecycle_and_independent_conversion/migration.sql",
);
assert(migration.includes('CREATE TYPE "MembershipLifecycleState"'));
assert(migration.includes('CREATE TYPE "SubscriptionRequestPurpose"'));
assert(migration.includes("PENDING_ACTIVATION"));
assert(migration.includes("SHARED_SUBSCRIPTION_EXPIRED"));
assert(
  !/(?:^|\n)\s*(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i.test(
    migration,
  ),
  "Lifecycle migration must not contain destructive row/table operations.",
);

const requiredWebKeys = [
  "membership.sharedSubscription",
  "membership.sharedSubscriptionExpired",
  "membership.sharedSubscriptionExpiredDescription",
  "membership.sharedSubscriptionReadOnly",
  "membership.subscriptionOwner",
  "membership.usersReadOnly",
  "membership.sharedDeleteScope",
];
const requiredMobileKeys = [
  "sharedSubscription",
  "sharedSubscriptionExpired",
  "sharedSubscriptionExpiredDescription",
  "sharedSubscriptionReadOnly",
  "subscriptionOwner",
  "usersReadOnlySharedMembership",
  "sharedMembershipDeleteScope",
];
for (const locale of ["tr", "en", "ro", "ru", "az", "tk", "de", "bg", "el", "sr"]) {
  const web = JSON.parse(read(`packages/locales/${locale}.json`)) as Record<
    string,
    string
  >;
  for (const key of requiredWebKeys) {
    assert(web[key]?.trim(), `${locale} is missing web translation ${key}.`);
  }
  if (locale !== "tr" && locale !== "en") {
    const mobile = JSON.parse(
      read(`apps/mobile/src/i18n/locales/${locale}.json`),
    ) as Record<string, string>;
    for (const key of requiredMobileKeys) {
      assert(
        mobile[key]?.trim(),
        `${locale} is missing mobile translation ${key}.`,
      );
    }
  }
}
const mobileBase = read("apps/mobile/src/i18n/translations.ts");
for (const key of requiredMobileKeys) {
  assert(
    mobileBase.includes(`${key}:`),
    `Mobile base translations are missing ${key}.`,
  );
}

console.log(
  "Shared-member lifecycle, owner-control lock, isolated conversion, self-detachment, migration and localization contracts passed.",
);
