import { readFileSync } from "node:fs";

import { isAuthorizedLogivyaPlatformAdmin } from "../src/server/auth/platform-owner";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const mobileApi = read("apps/mobile/src/api/mobileAdmin.ts");
const mobileScreen = read("apps/mobile/src/screens/app/platform-module-screen.tsx");
const moreScreen = read("apps/mobile/src/screens/app/more-screen.tsx");
const authStore = read("apps/mobile/src/auth/auth-store.ts");
const sessionCleanup = read("apps/mobile/src/auth/session-cleanup.ts");
const ownerGuard = read("src/server/auth/platform-owner.ts");
const platformGuard = read("src/server/auth/platform-admin.ts");
const snapshotService = read("src/server/admin/module-snapshots.ts");
const snapshotRoute = read("src/app/api/admin/modules/[module]/route.ts");

const requiredModules = [
  "dashboard", "companies", "users", "billing", "subscriptions", "invoices", "payments", "whatsappAccounts", "campaigns", "support",
  "security", "trialRisk", "compliance", "audit", "activity", "notifications", "dataRequests", "metrics", "systemHealth", "backups", "disasterRecovery",
  "settings", "featureFlags", "announcements", "apiUsage", "webhooks", "platformSettings",
];

for (const moduleName of requiredModules) {
  assert(mobileApi.includes(`${moduleName}: {`), `Missing mobile admin module definition: ${moduleName}`);
  assert(moreScreen.includes(`key: "${moduleName}"`), `Missing mobile administrator navigation entry: ${moduleName}`);
}

for (const moduleName of [
  "billing", "whatsapp-accounts", "campaigns", "compliance", "audit", "notifications", "data-requests", "backups", "disaster-recovery",
  "settings", "feature-flags", "announcements", "api-usage", "webhooks", "platform-settings",
]) {
  assert(snapshotService.includes(`"${moduleName}"`), `Missing protected snapshot implementation: ${moduleName}`);
}

assert(snapshotRoute.includes("requirePlatformAdmin"), "Administrator module snapshots must use the centralized backend guard");
assert(snapshotRoute.includes('"Cache-Control": "private, no-store"'), "Administrator responses must not be stored in a shared cache");
assert(ownerGuard.includes('LOGIVYA_PLATFORM_OWNER_EMAIL = "burakidim@gmail.com"'), "The single platform owner email changed unexpectedly");
assert(ownerGuard.includes("trim().toLowerCase()"), "Platform owner email must be normalized server-side");
assert(platformGuard.includes("isAuthorizedLogivyaPlatformAdmin({ email: context.user.email })"), "Platform guard must authorize from the authenticated backend user");
assert(
  isAuthorizedLogivyaPlatformAdmin({ email: " BURAKIDIM@GMAIL.COM " }),
  "The platform owner must be authorized after server-side email normalization",
);
assert(
  !isAuthorizedLogivyaPlatformAdmin({ email: "normal-user@example.com", role: "SUPER_ADMIN", isActive: true }),
  "Roles and client flags must never authorize another email as platform owner",
);

assert(moreScreen.includes("canSeeAdminHub(isPlatformAdmin)"), "Mobile administrator visibility must use the backend session flag");
assert(authStore.includes("isPlatformAdmin: false"), "Logout/session reset must clear the administrator flag");
assert(sessionCleanup.includes("queryClient.clear()"), "Logout must clear cached administrator data");
assert(sessionCleanup.includes("clearTokens"), "Logout must clear secure tokens");

assert(!mobileScreen.includes("definition.endpoint ? definition.endpoint"), "The mobile UI must never display API endpoint paths");
assert(mobileScreen.includes("AdminModuleDetail"), "Mobile admin records must have a functional detail view");
assert(mobileScreen.includes("runModuleAction"), "Supported administrator actions are not wired to the mobile UI");
assert(mobileScreen.includes("reauthenticatePlatformAdmin"), "Critical mobile administrator actions require backend reauthentication");
assert(mobileScreen.includes("ManualSubscriptionPanel"), "Desktop manual subscription management is missing from the mobile administrator UI");
assert(mobileScreen.includes("activateAdminSubscriptionManually"), "Manual subscription activation is not connected to the protected backend endpoint");
assert(mobileScreen.includes("RefreshControl"), "Mobile administrator modules require pull-to-refresh");
assert(mobileScreen.includes("moduleStatus"), "Mobile administrator modules require status filtering");
assert(mobileScreen.includes("modulePage"), "Mobile administrator modules require pagination state");
assert(mobileScreen.includes("if (!isPlatformAdmin)"), "Direct mobile navigation must deny non-administrators");

for (const secret of ["secretEncrypted", "pairingCode", "qrCode", "passwordHash", "refreshToken", "sessionTokenHash", "providerSessionId"]) {
  assert(!snapshotService.includes(secret), `Sensitive field referenced by administrator snapshot service: ${secret}`);
}

for (const supportedAction of ["runAdminCompanyAction", "runAdminUserAction", "runAdminSubscriptionAction", "confirmAdminPayment", "rejectAdminPayment", "runAdminTrialDecision"]) {
  assert(mobileScreen.includes(supportedAction), `Supported mobile administrator mutation is not connected: ${supportedAction}`);
}

console.log("Mobile administrator parity and security contract checks passed.");
