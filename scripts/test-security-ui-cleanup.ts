import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertInOrder(value: string, markers: string[], platform: string) {
  let previous = -1;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    assert(
      index > previous,
      `${platform} security section is missing or out of order: ${marker}`,
    );
    previous = index;
  }
}

function assertAbsent(value: string, markers: string[], scope: string) {
  for (const marker of markers) {
    assert(
      !value.includes(marker),
      `${scope} still contains hidden marker: ${marker}`,
    );
  }
}

const webUi = source("src/components/security-settings-page.tsx");
const mobileUi = source("apps/mobile/src/screens/app/security-screen.tsx");
const webStatus = source("src/app/api/auth/mfa/status/route.ts");
const mobileStatus = source("src/app/api/mobile/auth/mfa/status/route.ts");
const policyService = source("src/server/security/mfa-policy.ts");
const webSessionsRoute = source("src/app/api/auth/sessions/route.ts");
const mobileSessionsRoute = source("src/app/api/mobile/auth/sessions/route.ts");
const webRecoveryRoute = source("src/app/api/auth/mfa/recovery-codes/route.ts");
const mobileRecoveryRoute = source(
  "src/app/api/mobile/auth/mfa/recovery-codes/route.ts",
);
const webLoginVerify = source("src/app/api/auth/mfa/login/verify/route.ts");
const mobileLoginVerify = source("src/app/api/mobile/auth/mfa/verify/route.ts");
const webPolicyRoute = source("src/app/api/settings/security-policy/route.ts");
const mobilePolicyRoute = source(
  "src/app/api/mobile/company/security-policy/route.ts",
);
const eventService = source("src/server/security/events.ts");
const challengeService = source("src/server/auth/mfa-challenge.ts");
const adminEventRoute = source("src/app/api/admin/security/events/route.ts");
const webShell = source("src/components/app-shell.tsx");
const mobileMenu = source("apps/mobile/src/screens/app/more-screen.tsx");
const mobileMfaApi = source("apps/mobile/src/api/mfa-api.ts");
const mobileApiClient = source("apps/mobile/src/api/client.ts");
const mobileResponse = source("src/server/mobile/response.ts");

assertInOrder(
  webUi,
  [
    "security.loginSecurity",
    "security.authenticator",
    "security.emailVerification",
  ],
  "Web",
);
assertInOrder(
  mobileUi,
  [
    "mfaLoginSecurity",
    "mfaAuthenticatorMethod",
    "mfaEmailMethod",
    "<MobileAppLockSettings />",
  ],
  "Mobile",
);

assertAbsent(
  webUi,
  [
    "/api/auth/sessions",
    "/api/auth/mfa/recovery-codes",
    "security.activeSessions",
    "security.currentSession",
    "security.recoveryTitle",
    "security.recoveryRemaining",
    "security.regenerate",
    "logoutEverywhere",
    "revokeSession",
    "sessions.map",
    "organizationPolicy",
    "policyCompliant",
    "policyActionRequired",
    "security.activity",
    "recentEvents",
    "trustedDevices",
  ],
  "Web Security page",
);
assertAbsent(
  mobileUi,
  [
    "getSecuritySessions",
    "regenerateMfaRecoveryCodes",
    "logoutEverywhere",
    "revokeSecuritySession",
    "mfaActiveSessions",
    "mfaCurrentSession",
    "mfaRecoveryRemaining",
    "mfaRegenerate",
    "sessions.map",
    "mfaOrganizationPolicy",
    "mfaPolicyCompliant",
    "mfaPolicyActionRequired",
    "mfaActivity",
    "recentEvents",
    "mfaTrustedDevices",
  ],
  "Mobile Security screen",
);

for (const [platform, ui, confirmationMarker] of [
  ["Web", webUi, "confirmEnrollment"],
  ["Mobile", mobileUi, "confirmMfaEnrollment"],
] as const) {
  assert(
    ui.includes("recoveryCodes.length > 0") &&
      ui.includes("recoveryCodes.join") &&
      ui.includes("setRecoveryCodes([])"),
    `${platform} must show newly generated recovery codes once during enrollment`,
  );
  assert(
    ui.includes(confirmationMarker),
    `${platform} TOTP enrollment confirmation was removed`,
  );
}

for (const [platform, status] of [
  ["Web", webStatus],
  ["Mobile", mobileStatus],
] as const) {
  assert(
    status.includes("listMfaMethodState") &&
      status.includes("pendingMfaEnrollmentStatus"),
    `${platform} MFA status no longer loads visible method state`,
  );
  assertAbsent(
    status,
    [
      "trustedDevice.findMany",
      "recoveryCodesRemaining",
      "trustedDevices",
      "canManageCompanyPolicy",
      "policyRequiresAnyMfa",
      "policyCompliant",
      "securityEvent.findMany",
      "recentEvents",
    ],
    `${platform} MFA status response`,
  );
}

const methodStateStart = policyService.indexOf(
  "export async function listMfaMethodState",
);
const methodStateEnd = policyService.indexOf(
  "export async function setPreferredMfaMethod",
  methodStateStart,
);
const methodState = policyService.slice(methodStateStart, methodStateEnd);
assert(
  methodStateStart >= 0 && methodStateEnd > methodStateStart,
  "MFA method-state implementation was not found",
);
assertAbsent(
  methodState,
  ["recoveryCodes:", "recoveryCodesRemaining"],
  "MFA method-state query",
);
assert(
  policyService.includes("evaluateMfaLoginDecision") &&
    policyService.includes("policyRequiresAnyMfa"),
  "Backend MFA policy enforcement was removed",
);

assert(
  webSessionsRoute.includes("requireApiSession") &&
    webSessionsRoute.includes("listUserSecuritySessions") &&
    webSessionsRoute.includes("revokeAllUserSecuritySessions"),
  "Authenticated web session enforcement API was removed",
);
assert(
  mobileSessionsRoute.includes("requireMobileAuth") &&
    mobileSessionsRoute.includes("listUserSecuritySessions") &&
    mobileSessionsRoute.includes("revokeAllUserSecuritySessions"),
  "Authenticated mobile session enforcement API was removed",
);
assert(
  webRecoveryRoute.includes("requireApiSession") &&
    webRecoveryRoute.includes("verifyPassword") &&
    webRecoveryRoute.includes("enforceOperationRateLimit") &&
    webRecoveryRoute.includes("replaceRecoveryCodes"),
  "Protected web recovery-code regeneration API was weakened",
);
assert(
  mobileRecoveryRoute.includes("requireMobileAuth") &&
    mobileRecoveryRoute.includes("verifyPassword") &&
    mobileRecoveryRoute.includes("enforceOperationRateLimit") &&
    mobileRecoveryRoute.includes("replaceRecoveryCodes"),
  "Protected mobile recovery-code regeneration API was weakened",
);

for (const [platform, verify] of [
  ["Web", webLoginVerify],
  ["Mobile", mobileLoginVerify],
] as const) {
  assert(
    verify.includes("verifyAndConsumeMfaCode") &&
      verify.includes('verification.method === "RECOVERY"') &&
      verify.includes("MFA_RECOVERY_CODE_USED"),
    `${platform} recovery-code login compatibility was removed`,
  );
}

assert(
  webShell.includes("/api/auth/logout"),
  "Standard web logout was removed",
);
assert(
  mobileMenu.includes("await logout()"),
  "Standard mobile logout was removed",
);
assert(
  mobileUi.includes("usePreventScreenCapture") &&
    mobileUi.includes("MobileAppLockSettings"),
  "Mobile PIN, biometric, or screen-capture protections were removed",
);
assert(
  mobileMfaApi.includes("verificationMethod") &&
    mobileUi.includes('sendEmailDisableCode("TOTP")') &&
    mobileUi.includes('sendEmailDisableCode("EMAIL_OTP")'),
  "Mobile MFA removal must support explicit email step-up for both removable methods",
);
for (const code of [
  "PASSWORD_CONFIRMATION_REQUIRED",
  "INVALID_TOTP_CODE",
  "MFA_EMAIL_OTP_INVALID",
  "MFA_METHOD_REQUIRED_BY_POLICY",
]) {
  assert(
    mobileResponse.includes(code) && mobileApiClient.includes(code),
    `Mobile MFA error ${code} must remain actionable instead of becoming a generic server error`,
  );
}

assert(
  webPolicyRoute.includes("prisma.company.update") &&
    mobilePolicyRoute.includes("prisma.company.update"),
  "Internal company security-policy enforcement APIs were removed",
);
assert(
  eventService.includes("securityEvent.create") &&
    challengeService.includes("recordSecurityEvent") &&
    adminEventRoute.includes("securityEvent.findMany"),
  "Backend security audit collection or administrator incident access was removed",
);
assert(
  mobileMfaApi.includes("getSecuritySessions") &&
    mobileMfaApi.includes("regenerateMfaRecoveryCodes"),
  "Preserved internal mobile security API clients were removed instead of only detaching the customer screen",
);

console.log(
  "Security page simplification contracts passed for Web, Android, iOS, hidden-data fetches, MFA recovery, session enforcement, logout, and mobile app lock.",
);
