import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const bootstrap = source("src/app/api/mobile/bootstrap/route.ts");
const dashboardApi = source("apps/mobile/src/api/mobileDashboard.ts");
const dashboardStore = source("apps/mobile/src/features/dashboard/dashboardStore.ts");
const dashboardScreen = source("apps/mobile/src/screens/app/dashboard-screen.tsx");
const drawer = source("apps/mobile/src/components/web-parity-tab-bar.tsx");
const mobileLogin = source("apps/mobile/src/screens/auth/login-screen.tsx");
const webLogin = source("src/components/auth-form.tsx");
const mobileSecurity = source("apps/mobile/src/screens/app/security-screen.tsx");
const mobileMfaApi = source("apps/mobile/src/api/mfa-api.ts");
const mobileTrustedDeviceRoute = source("src/app/api/mobile/auth/mfa/trusted-devices/[id]/route.ts");
const translations = source("apps/mobile/src/i18n/translations.ts");
const authSecuritySources = [
  source("src/app/api/auth/login/route.ts"),
  source("src/app/api/mobile/auth/mfa/enroll/route.ts"),
  source("src/app/api/mobile/auth/mfa/status/route.ts"),
  source("src/app/api/mobile/auth/sessions/[kind]/[id]/route.ts"),
];

assert(bootstrap.includes("prisma.whatsAppGroup.count"), "Dashboard WhatsApp groups must be counted by the backend.");
assert(bootstrap.includes("syncedWhatsAppGroupCount"), "Dashboard API must expose an explicit WhatsApp group metric.");
assert(bootstrap.includes("connectedWhatsAppAccountCount"), "Dashboard API must expose an explicit connected-account metric.");
assert(bootstrap.includes("isArchived: false"), "Archived WhatsApp groups must not be counted.");
assert(bootstrap.includes("canSend: true"), "Inaccessible WhatsApp groups must not be counted.");
assert(bootstrap.includes("userId: user.id") && bootstrap.includes("companyId: company.id"), "Dashboard metrics must be tenant and user scoped.");
assert(!bootstrap.includes("participantCount"), "Dashboard group count must never use group participants.");
assert(dashboardApi.includes("syncedWhatsAppGroupCount: number"), "The mobile DTO must type the explicit group metric.");
assert(!dashboardStore.includes("accounts.reduce"), "The mobile dashboard must not aggregate a truncated account list.");
assert(dashboardScreen.includes('t("whatsAppGroupsMetric")'), "The dashboard must label the metric as WhatsApp Groups.");
assert(dashboardScreen.includes("data.dashboardMetrics.showContacts ?"), "The contact card must be entitlement gated.");
assert(dashboardScreen.includes("useFocusEffect") && dashboardScreen.includes("AppState.addEventListener"), "Dashboard metrics must refresh on focus and foreground.");
assert(bootstrap.includes("subscriptionStatus.entitlements.contactMessaging"), "The contact entitlement decision must come from the backend.");
assert(translations.includes('whatsAppGroupsMetric: "WhatsApp Grupları"'), "The Turkish WhatsApp Groups label is missing.");
assert(translations.includes('manageTeamUsers: "Kullanıcı Davet Et"'), "The Turkish user-invitation action is incorrect.");

for (const [name, login] of [["mobile", mobileLogin], ["web", webLogin]] as const) {
  assert(login.includes("normalizeMfaLoginCode"), `${name} login must normalize TOTP and recovery codes.`);
  assert(login.includes("isMfaLoginCodeReady"), `${name} login must validate both MFA code types.`);
  assert(login.includes("? 6 : 64"), `${name} login must allow recovery-code length outside setup mode.`);
  assert(login.includes("A-Z0-9-"), `${name} login must allow canonical recovery-code characters.`);
}

assert(drawer.includes('screen: "Security"'), "The mobile drawer must expose the native Security screen.");
assert(mobileSecurity.includes("usePreventScreenCapture"), "The native Security screen must prevent sensitive screen capture.");
assert(mobileSecurity.includes("mfaDisableConfirm"), "Disabling MFA must require explicit confirmation.");
assert(!mobileSecurity.includes("mfaRevokeDeviceConfirm") && mobileMfaApi.includes("revokeMfaTrustedDevice") && mobileTrustedDeviceRoute.includes("trustedDevice.updateMany"), "Trusted-device UI must stay hidden while its backend revocation capability remains available.");
assert(
  mobileSecurity.includes("secretRevealed") &&
    mobileSecurity.includes("? enrollment.secret") &&
    mobileSecurity.includes('"•••• ••••'),
  "The TOTP setup secret must be masked by default.",
);
assert(mobileSecurity.includes("Clipboard.setStringAsync(\"\")"), "Sensitive mobile clipboard values must be cleared.");
assert(translations.includes('security: "Güvenlik"'), "The Turkish Security label must use correct Unicode.");
assert(!/[ÃÄÅ]\S/u.test(translations), "Mobile translations contain likely mojibake.");
for (const value of authSecuritySources) {
  assert(!/\b(?:Iki adimli|dogrulama|baslatildi|gecersiz|bulunamadi|kapatilamadi)\b/u.test(value), "Authentication or Security UI text contains ASCII-only Turkish.");
}

console.log("Mobile dashboard and security parity contracts passed.");
