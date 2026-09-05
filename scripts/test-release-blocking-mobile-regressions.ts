import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MobileTeamDataContractError,
  normalizeMobileTeamUsersResponse,
} from "../apps/mobile/src/api/mobile-team-normalizer";
import { normalizeMobileWhatsAppAccountResponse } from "../apps/mobile/src/api/mobile-whatsapp-normalizer";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function teamResponse(owner: boolean) {
  return {
    users: [
      {
        id: owner ? "membership-owner" : "membership-member",
        role: owner ? "OWNER" : "OPERATOR",
        status: "ACTIVE",
        lifecycleState: owner ? "INDEPENDENT_OWNER" : "ACTIVE_SHARED_MEMBER",
        canManagePendingCredentials: false,
        isCurrent: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        user: {
          id: owner ? "owner" : "member",
          name: owner ? "Owner User" : "Invited User",
          firstName: owner ? "Owner" : "Invited",
          lastName: "User",
          email: owner ? "owner@example.com" : "member@example.com",
          status: "ACTIVE",
          mustChangePassword: false,
          lastLoginAt: null,
          sessions: [],
        },
      },
    ],
    seatUsage: {
      limit: owner ? 3 : 2,
      activeMembers: 1,
      suspendedMembers: 0,
      legacyInvitedMembers: 0,
      pendingInvitations: 0,
      used: 1,
      available: owner ? 2 : 1,
      planSlug: owner ? "PROFESSIONAL" : "STARTER",
      planName: owner ? "Profesyonel" : "Başlangıç",
    },
    requesterPermissions: {
      canCreateUsers: owner,
      canSuspendUsers: false,
      canRemoveUsers: owner,
      canResetTemporaryPasswords: owner,
    },
  };
}

const owner = normalizeMobileTeamUsersResponse(teamResponse(true));
assert.equal(owner.users[0]?.role, "OWNER");
assert.equal(owner.seatUsage.limit, 3);
assert.equal(owner.requesterPermissions.canCreateUsers, true);

const invited = normalizeMobileTeamUsersResponse(teamResponse(false));
assert.equal(invited.users[0]?.lifecycleState, "ACTIVE_SHARED_MEMBER");
assert.equal(invited.requesterPermissions.canCreateUsers, false);

assert.throws(
  () => normalizeMobileTeamUsersResponse({ ...teamResponse(true), requesterPermissions: undefined }),
  (error) => error instanceof MobileTeamDataContractError
    && error.field === "requesterPermissions",
  "A malformed team response must be contained before React renders it.",
);

const normalizedPairing = normalizeMobileWhatsAppAccountResponse({
  account: {
    id: "wa-account-1",
    status: "PENDING_PHONE_CODE",
    phoneNumber: "+905393565142",
    pairingCode: "ABCD-EFGH",
    pairingCodeExpiresAt: "2026-08-01T12:00:00.000Z",
  },
});
assert.equal(normalizedPairing.account.id, "wa-account-1");
assert.equal(normalizedPairing.account.pairingCode, "ABCD-EFGH");
assert.equal(normalizedPairing.account.groupCount, 0);
assert.throws(
  () => normalizeMobileWhatsAppAccountResponse({ account: { status: "PENDING_PHONE_CODE" } }),
  /MOBILE_WHATSAPP_DATA_CONTRACT:account\.id/,
  "A malformed phone pairing response must be contained before React renders it.",
);

const featureBoundary = read("apps/mobile/src/components/feature-error-boundary.tsx");
assert(!featureBoundary.includes("clearRecoverableAppCache"));
assert(!featureBoundary.includes("clearMobileSessionState"));
assert(!featureBoundary.includes("reportMobileRecoveryIncident"));
assert(featureBoundary.includes('recoveryStage: "feature-error-boundary"'));

const profileNavigator = read("apps/mobile/src/navigation/profile-navigator.tsx");
assert(profileNavigator.includes('feature="subscription"'));
assert(profileNavigator.includes('feature="team-users"'));
const whatsappNavigator = read("apps/mobile/src/navigation/whatsapp-navigator.tsx");
assert(whatsappNavigator.includes('feature="whatsapp-phone-connect"'));

const mobileRoles = read("apps/mobile/src/utils/roles.ts");
assert(mobileRoles.includes("return isPlatformAdmin === true"));
const mobileMore = read("apps/mobile/src/screens/app/more-screen.tsx");
assert(mobileMore.includes("canManageOwnerProfile(isPlatformAdmin)"));
assert(mobileMore.includes("canManageProfile ?"));
assert(mobileMore.includes('title={t("companySettings")}'));
const mobileCompanyProfileRoute = read("src/app/api/mobile/company/profile/route.ts");
assert(mobileCompanyProfileRoute.includes('requirePermission(membership.role, "manage_company_settings")'));
const mobileCompanyProfileScreen = read("apps/mobile/src/screens/app/company-settings-screen.tsx");
assert(mobileCompanyProfileScreen.includes('permissions.includes("manage_company_settings")'));
assert(
  /editable=\{canEdit(?:\s*&&\s*field\.editable\s*!==\s*false)?\}/.test(mobileCompanyProfileScreen),
  "Company settings fields must remain permission-gated while allowing field-level read-only controls.",
);
const webShell = read("src/components/app-shell.tsx");
assert.match(
  webShell,
  /href:\s*"\/settings\/company"[\s\S]*?key:\s*"settings\.company"[\s\S]*?icon:\s*ContactRound[\s\S]*?ownerOnly:\s*false/u,
  "Company settings must stay available to authorized non-owner workspace members.",
);

const subscriptionStore = read("apps/mobile/src/features/subscription/subscriptionStore.ts");
assert.equal(
  (subscriptionStore.match(/if \(get\(\)\.requesting\) return false;/g) || []).length,
  2,
  "Draft creation and submission must both reject concurrent taps.",
);
assert(subscriptionStore.includes("draftIdempotencyKeys"));

const subscriptionScreen = read("apps/mobile/src/screens/app/subscription-screen.tsx");
assert(subscriptionScreen.includes("disabled={requesting || selected}"));
assert(subscriptionScreen.includes("disabled={requesting || !allAccepted}"));
assert(subscriptionScreen.includes("request.buyerSnapshot.phone ?"));
assert(subscriptionScreen.includes("request.buyerSnapshot.address ?"));

const mobileResponse = read("src/server/mobile/response.ts");
assert(mobileResponse.includes('error.message === "WHATSAPP_ACCOUNT_REQUIRED"'));
assert(mobileResponse.includes('mobileError("WHATSAPP_ACCOUNT_REQUIRED", "api.error.whatsappAccountRequired", { status: 409 })'));

const appReviewAccess = read("scripts/apple/verify-app-review-access.mjs");
assert(appReviewAccess.includes('value.httpStatus === 409'));
assert(appReviewAccess.includes('value.errorCode === "WHATSAPP_ACCOUNT_REQUIRED"'));
assert(!appReviewAccess.includes('name === "contacts" && !hasWhatsappAccount ? true'));
assert(appReviewAccess.includes('"X-Logivya-Version-Code": iosBuildNumber'));
assert(appReviewAccess.includes('appVersion: "/api/mobile/app-version"'));
assert(appReviewAccess.includes("appVersionPolicy?.forceUpdate !== true"));
assert(appReviewAccess.includes("expectedVersion: mobileVersion"));

const appVersionRoute = read("src/app/api/mobile/app-version/route.ts");
assert(appVersionRoute.includes('request.headers.get("x-client-platform")'));
assert(appVersionRoute.includes('platformValue(platform, "CURRENT_VERSION"'));
assert(appVersionRoute.includes("MOBILE_${platform.toUpperCase()}_${suffix}"));

const mobileConfig = read("apps/mobile/src/constants/config.ts");
assert(mobileConfig.includes('Platform.OS === "ios"'));
assert(mobileConfig.includes("Constants.expoConfig?.ios?.buildNumber"));

const iosPreflight = read("scripts/apple/ios-preflight.mjs");
assert(iosPreflight.includes('"WAITING_FOR_REVIEW"'));
assert(iosPreflight.includes("candidateIsSelectedForReview"));
assert(iosPreflight.includes("appReviewReady,"));
assert(!iosPreflight.includes("appReviewReady: false"));

console.log("Mobile team contracts, feature error containment, and subscription request concurrency guards passed.");
