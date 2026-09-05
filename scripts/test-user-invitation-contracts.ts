import { readFileSync } from "node:fs";
import path from "node:path";

import { CANONICAL_SUBSCRIPTION_PLANS } from "../src/config/subscription-plans";
import {
  createDirectCompanyUserSchema,
  directCompanyUserValidationCode,
  resetCompanyUserTemporaryPasswordSchema,
} from "../src/server/team/direct-company-users";
import { calculateCompanySeatUsage } from "../src/server/team/seat-policy";

const root = process.cwd();
const supportedLocales = [
  "tr",
  "en",
  "ro",
  "ru",
  "az",
  "tk",
  "de",
  "bg",
  "el",
  "sr",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function locale(file: string) {
  return JSON.parse(read(file)) as Record<string, string>;
}

assert(
  CANONICAL_SUBSCRIPTION_PLANS.trial.accountLimit === 1,
  "Trial must include only the owner.",
);
assert(
  CANONICAL_SUBSCRIPTION_PLANS.starter.accountLimit === 2,
  "Starter must include owner plus one member.",
);
assert(
  CANONICAL_SUBSCRIPTION_PLANS.professional.accountLimit === 3,
  "Professional must include owner plus two members.",
);

const starterOwner = calculateCompanySeatUsage({
  limit: CANONICAL_SUBSCRIPTION_PLANS.starter.accountLimit,
  activeMembers: 1,
  suspendedMembers: 0,
  legacyInvitedMembers: 0,
  pendingInvitations: 0,
});
assert(
  starterOwner.used === 1 && starterOwner.available === 1,
  "The Starter owner must occupy the first seat.",
);

const starterFull = calculateCompanySeatUsage({
  limit: CANONICAL_SUBSCRIPTION_PLANS.starter.accountLimit,
  activeMembers: 2,
  suspendedMembers: 0,
  legacyInvitedMembers: 0,
  pendingInvitations: 0,
});
assert(
  starterFull.used === 2 && starterFull.available === 0,
  "Starter must stop at two total accounts.",
);

const professionalFull = calculateCompanySeatUsage({
  limit: CANONICAL_SUBSCRIPTION_PLANS.professional.accountLimit,
  activeMembers: 3,
  suspendedMembers: 0,
  legacyInvitedMembers: 0,
  pendingInvitations: 0,
});
assert(
  professionalFull.used === 3 && professionalFull.available === 0,
  "Professional must stop at three total accounts.",
);

const suspended = calculateCompanySeatUsage({
  limit: 2,
  activeMembers: 1,
  suspendedMembers: 1,
  legacyInvitedMembers: 0,
  pendingInvitations: 0,
});
assert(
  suspended.used === 2,
  "A suspended member must continue to occupy a seat.",
);

const allowedPayload = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  temporaryPassword: "Strong-Temporary-Password-42",
};
assert(
  createDirectCompanyUserSchema.safeParse(allowedPayload).success,
  "The canonical direct-user payload must be accepted.",
);
const unicodePayload = createDirectCompanyUserSchema.safeParse({
  ...allowedPayload,
  firstName: "  Çağrı  ",
  lastName: "  Şahin  ",
  email: "  UNICODE@example.com  ",
});
assert(
  unicodePayload.success,
  "Unicode first and last names must be accepted.",
);
assert(
  unicodePayload.data.firstName === "Çağrı" &&
    unicodePayload.data.lastName === "Şahin" &&
    unicodePayload.data.email === "UNICODE@example.com",
  "The shared schema must trim canonical user fields without combining them.",
);
const missingFirstName = createDirectCompanyUserSchema.safeParse({
  ...allowedPayload,
  firstName: " ",
});
assert(
  !missingFirstName.success &&
    directCompanyUserValidationCode(missingFirstName.error) ===
      "FIRST_NAME_REQUIRED",
  "A missing first name must return FIRST_NAME_REQUIRED.",
);
const missingLastName = createDirectCompanyUserSchema.safeParse({
  ...allowedPayload,
  lastName: " ",
});
assert(
  !missingLastName.success &&
    directCompanyUserValidationCode(missingLastName.error) ===
      "LAST_NAME_REQUIRED",
  "A missing last name must return LAST_NAME_REQUIRED.",
);
for (const forbiddenField of [
  "companyId",
  "tenantId",
  "role",
  "planCode",
  "accountLimit",
  "subscriptionId",
]) {
  assert(
    !createDirectCompanyUserSchema.safeParse({
      ...allowedPayload,
      [forbiddenField]: "attacker-controlled",
    }).success,
    `${forbiddenField} must be rejected by the strict create-user schema.`,
  );
}
assert(
  resetCompanyUserTemporaryPasswordSchema.safeParse({
    temporaryPassword: allowedPayload.temporaryPassword,
  }).success,
  "The temporary-password reset contract must accept only a new temporary password.",
);
assert(
  !resetCompanyUserTemporaryPasswordSchema.safeParse({
    temporaryPassword: allowedPayload.temporaryPassword,
    role: "OWNER",
  }).success,
  "Password-reset clients must not control roles.",
);

const directUsers = read("src/server/team/direct-company-users.ts");
for (const required of [
  'SELECT "id", "ownerId" FROM "Company" WHERE "id" = ${context.companyId} FOR UPDATE',
  "prisma.$transaction",
  'context.actorRole !== "OWNER"',
  "company.ownerId !== context.actorUserId",
  'role: "OPERATOR"',
  "mustChangePassword: true",
  "createdByUserId: context.actorUserId",
  'throw new Error("USER_ALREADY_IN_TENANT")',
  'throw new Error("EMAIL_NOT_AVAILABLE")',
  'new Error("SEAT_LIMIT_REACHED")',
  "hashPassword(input.temporaryPassword",
  "verifyPassword(target.user.passwordHash",
  "userSession.updateMany",
  "mobileDeviceSession.updateMany",
  "trustedDevice.updateMany",
  'action: "USER_CREATED_BY_OWNER"',
  'action: "USER_TEMPORARY_PASSWORD_RESET"',
  'action: "CONCURRENT_SEAT_LIMIT_REJECTION"',
]) {
  assert(
    directUsers.includes(required),
    `Direct-user service is missing: ${required}`,
  );
}
assert(
  !directUsers.includes("subscription.create("),
  "Direct user creation must not create a per-user subscription.",
);
assert(
  !directUsers.includes("company.create("),
  "Direct user creation must not create a second company.",
);
assert(
  !directUsers.includes("trial.create("),
  "Direct user creation must not create a new trial.",
);

const temporaryPassword = read("src/server/auth/temporary-password.ts");
for (const required of [
  "ForcedPasswordChangeChallenge",
  "hashOpaqueToken(token)",
  "verifyPassword(",
  "hashPassword(input.newPassword",
  'throw new Error("PASSWORD_REUSE_NOT_ALLOWED")',
  "mustChangePassword: false",
  "userSession.updateMany",
  "mobileDeviceSession.updateMany",
  "trustedDevice.updateMany",
  'action: "USER_PASSWORD_CHANGED_FIRST_LOGIN"',
]) {
  assert(
    temporaryPassword.includes(required),
    `First-login password service is missing: ${required}`,
  );
}

const webLogin = read("src/app/api/auth/login/route.ts");
const mobileLogin = read("src/app/api/mobile/auth/login/route.ts");
for (const [label, source] of [
  ["web", webLogin],
  ["mobile", mobileLogin],
] as const) {
  assert(
    source.includes("user.mustChangePassword"),
    `${label} login must detect temporary credentials.`,
  );
  assert(
    source.includes("issueTemporaryPasswordChangeChallenge"),
    `${label} login must issue an opaque password-change challenge.`,
  );
  assert(
    source.includes('action: "USER_FIRST_LOGIN"'),
    `${label} first login must be audited.`,
  );
}

const webSession = read("src/server/auth/session.ts");
const mobileSession = read("src/server/mobile/auth.ts");
assert(
  webSession.includes("user.mustChangePassword"),
  "Web protected sessions must reject users awaiting a password change.",
);
assert(
  mobileSession.includes("user.mustChangePassword"),
  "Mobile protected sessions must reject users awaiting a password change.",
);

const invitations = read("src/server/team/company-invitations.ts");
assert(
  invitations.includes("legacyInvitationCreationEnabled"),
  "Legacy invitation creation must have an explicit off switch.",
);
assert(
  invitations.includes("INVITATION_FLOW_DISABLED"),
  "Legacy invitation endpoints must return a stable disabled code.",
);
assert(
  invitations.includes('status: "REVOKED"') &&
    invitations.includes("reservedSeat: false"),
  "Pending legacy invitations must release seats.",
);

const migration = read(
  "prisma/migrations/20260726233000_direct_subaccount_creation/migration.sql",
);
assert(
  migration.includes('"mustChangePassword"'),
  "The migration must persist first-login password state.",
);
assert(
  migration.includes('"ForcedPasswordChangeChallenge"'),
  "The migration must create the password-change challenge table.",
);
assert(
  migration.includes('"reservedSeat" = false'),
  "The migration must release pending invitation reservations.",
);

const webRoute = read("src/app/api/settings/users/route.ts");
const mobileRoute = read("src/app/api/mobile/team/users/route.ts");
for (const [label, source] of [
  ["web", webRoute],
  ["mobile", mobileRoute],
] as const) {
  assert(
    source.includes("createDirectCompanyUserSchema.safeParse"),
    `${label} create-user API must use the strict shared schema.`,
  );
  assert(
    source.includes("createDirectCompanyUser("),
    `${label} create-user API must use the shared transactional service.`,
  );
  assert(
    source.includes("actorRole: membership.role"),
    `${label} create-user API must pass the authenticated tenant role to the OWNER guard.`,
  );
  assert(
    source.includes("requesterPermissions"),
    `${label} user API must expose server-authoritative OWNER permissions.`,
  );
  assert(
    source.includes("occupiedAccounts") &&
      source.includes("accountLimit") &&
      source.includes("availableAccounts"),
    `${label} user API must expose canonical account capacity.`,
  );
  assert(
    !source.includes("listCompanyInvitations"),
    `${label} canonical user API must not depend on the disabled invitation workflow.`,
  );
}
const companyUsers = read("src/server/team/company-users.ts");
for (const required of [
  'action: "USER_ROLE_CHANGE_ATTEMPT_REJECTED"',
  '"OWNER_MEMBER_STATUS_CHANGE_REJECTED"',
  '"OWNER_MEMBER_REMOVAL_REJECTED"',
  '"MEMBER_SELF_MANAGED_AFTER_ACTIVATION"',
  'action: "USER_REMOVED"',
]) {
  assert(
    companyUsers.includes(required),
    `Company-user lifecycle audit is missing: ${required}`,
  );
}
assert(
  !companyUsers.includes('"USER_SUSPENDED"'),
  "Activated members must not be owner-suspended.",
);
assert(
  !companyUsers.includes('"USER_REACTIVATED"'),
  "Activated members must not be owner-reactivated.",
);

const webSubscription = read("src/components/billing-subscriptions-page.tsx");
const mobileSubscription = read(
  "apps/mobile/src/screens/app/subscription-screen.tsx",
);
assert(
  !webSubscription.includes("invitationCardTitle") &&
    !webSubscription.includes("UsersManagementPage"),
  "Web subscription must not render user management.",
);
assert(
  !mobileSubscription.includes("TeamUsers") &&
    !mobileSubscription.includes("canManageTeam"),
  "Mobile subscription must not render user management.",
);

const webNavigation = read("src/components/app-shell.tsx");
const mobileNavigation = read(
  "apps/mobile/src/components/web-parity-tab-bar.tsx",
);
const mobileMore = read("apps/mobile/src/screens/app/more-screen.tsx");
const mobileProfile = read("apps/mobile/src/screens/app/profile-screen.tsx");
const mobileRoles = read("apps/mobile/src/utils/roles.ts");
const mobileAuthStore = read("apps/mobile/src/auth/auth-store.ts");
const platformOwner = read("src/server/auth/platform-owner.ts");
const mobileMe = read("src/app/api/mobile/auth/me/route.ts");
const platformLayout = read("src/app/(platform)/layout.tsx");
assert(
  /href:\s*"\/settings\/users"[\s\S]*?key:\s*"settings\.users"[\s\S]*?icon:\s*UserCog[\s\S]*?ownerOnly:\s*false/u.test(
    webNavigation,
  ),
  "Web navigation must expose Users to shared members with server-authoritative read-only permissions.",
);
assert(
  mobileNavigation.includes('screen: "TeamUsers"'),
  "Mobile navigation must expose tenant Users to shared members.",
);
assert(
  !mobileNavigation.includes('goToModule("users")'),
  "Tenant users must not route into the platform-admin module.",
);
assert(
  mobileRoles.includes(
    "export function canManageOwnerProfile(isPlatformAdmin?: boolean)",
  ) && mobileRoles.includes("return isPlatformAdmin === true;"),
  "Standalone Profile visibility must use a strict backend-derived capability.",
);
assert(
  platformOwner.includes("process.env.SUPER_ADMIN_EMAIL") &&
    !platformOwner.includes('LOGIVYA_PLATFORM_OWNER_EMAIL = "') &&
    mobileMe.includes("getPlatformAdminProfile({") &&
    mobileMe.includes("const { isPlatformAdmin } = platformAdmin") &&
    platformLayout.includes("getPlatformAdminProfile({") &&
    platformLayout.includes("isPlatformAdmin={platformAdmin.isPlatformAdmin}"),
  "Web and mobile must derive administrator discovery from the centralized backend platform-admin profile.",
);
assert(
  !mobileNavigation.includes("burakidim@gmail.com") &&
    !mobileMore.includes("burakidim@gmail.com") &&
    !mobileProfile.includes("burakidim@gmail.com"),
  "Navigation and route guards must not make local email-based authorization decisions.",
);
assert(
  mobileNavigation.includes(
    "const showOwnerProfile = canManageOwnerProfile(isPlatformAdmin)",
  ) &&
    mobileNavigation.includes("...(showOwnerProfile") &&
    mobileNavigation.includes('key: "ProfileHome"'),
  "The hamburger Profile row must be omitted unless the backend-authoritative capability is true.",
);
assert(
  mobileMore.includes("{canManageProfile ? (") &&
    mobileMore.includes(
      "const canManageProfile = canManageOwnerProfile(isPlatformAdmin)",
    ) &&
    mobileMore.includes('screen: "ProfileHome"'),
  "The standalone mobile Profile row must be visible only from the server-authoritative platform-admin claim.",
);
assert(
  mobileProfile.includes("isPlatformAdmin") &&
    mobileProfile.includes("canManageOwnerProfile(isPlatformAdmin)") &&
    mobileProfile.includes("if (!canAccessStandaloneProfile)"),
  "The standalone Profile route must reject ordinary tenant users and deep links.",
);
const webPrimaryNavigation = webNavigation.slice(
  webNavigation.indexOf("const nav ="),
  webNavigation.indexOf("const settingsNav ="),
);
const webSettingsNavigation = webNavigation.slice(
  webNavigation.indexOf("const settingsNav ="),
  webNavigation.indexOf("type NoticeItem"),
);
assert(
  !webPrimaryNavigation.includes('"/settings/profile"') &&
    webSettingsNavigation.includes('href: "/settings/profile"'),
  "Web Profile must appear only inside the collapsible Settings submenu, not as a duplicate primary destination.",
);
assert(
  mobileNavigation.includes('key: "CompanySettings"') &&
    mobileMore.includes('screen: "CompanySettings"') &&
    !mobileNavigation.includes("...(isOwner") &&
    !mobileMore.includes("{isOwner ? ("),
  "Profil Bilgileri navigation must remain available under its existing authorization rule.",
);
assert(
  mobileAuthStore.includes("isPlatformAdmin: false") &&
    mobileAuthStore.includes("clearSession: () =>") &&
    mobileAuthStore.match(/isPlatformAdmin: false/g)?.length >= 2,
  "Profile visibility must default to hidden and clear across logout or account changes.",
);

const webUsers = read("src/components/users-management-page.tsx");
const mobileUsers = read("apps/mobile/src/screens/app/team-users-screen.tsx");
for (const [label, source] of [
  ["web", webUsers],
  ["mobile", mobileUsers],
] as const) {
  assert(
    source.includes("firstName") &&
      source.includes("lastName") &&
      source.includes("temporaryPassword"),
    `${label} direct-user form must contain all four canonical fields.`,
  );
  assert(
    source.includes("seatUsage?.available === 0"),
    `${label} create action must reflect authoritative capacity.`,
  );
  assert(
    !source.includes("newInvitation") && !source.includes("inviteUser"),
    `${label} active UI must not expose the invitation workflow.`,
  );
}
assert(
  webUsers.includes('focusField("firstName")') &&
    webUsers.includes('focusField("lastName")'),
  "Web validation must focus the exact missing name field.",
);
assert(
  mobileUsers.includes('t("firstNameRequiredError")') &&
    mobileUsers.includes('t("lastNameRequiredError")'),
  "Mobile validation must identify the exact missing name field.",
);
const mobileApiClient = read("apps/mobile/src/api/client.ts");
for (const code of [
  "FIRST_NAME_REQUIRED",
  "LAST_NAME_REQUIRED",
  "EMAIL_NOT_AVAILABLE",
  "USER_ALREADY_IN_TENANT",
]) {
  assert(
    mobileApiClient.includes(`code === "${code}"`),
    `Mobile API client must map ${code}.`,
  );
}
assert(
  !mobileBaseText().includes("Ad Soyadı alanını doldurun."),
  "The obsolete combined-name error must not remain in the active mobile catalog.",
);

const requiredWebKeys = [
  "users.directDescription",
  "users.accountsUsed",
  "users.addNewUser",
  "users.temporaryPassword",
  "users.createUser",
  "users.passwordChangePending",
  "auth.passwordChangeTitle",
  "auth.changePasswordAndContinue",
  "api.error.userAlreadyInTenant",
  "api.error.emailNotAvailable",
];
const requiredMobileKeys = [
  "accountsUsed",
  "addNewUser",
  "temporaryPassword",
  "createUser",
  "passwordChangePending",
  "passwordChangeTitle",
  "changePasswordAndContinue",
  "firstNameRequiredError",
  "lastNameRequiredError",
  "nameFieldsRequiredError",
  "emailNotAvailableError",
];
const mobileBase = read("apps/mobile/src/i18n/translations.ts");
for (const key of requiredMobileKeys) {
  assert(
    mobileBase.includes(`${key}:`),
    `Mobile Turkish/English base dictionary is missing ${key}.`,
  );
}
for (const language of supportedLocales) {
  const webDictionary = locale(`packages/locales/${language}.json`);
  for (const key of requiredWebKeys)
    assert(Boolean(webDictionary[key]), `Web ${language} is missing ${key}.`);
  if (language !== "tr" && language !== "en") {
    const mobileDictionary = locale(
      `apps/mobile/src/i18n/locales/${language}.json`,
    );
    for (const key of requiredMobileKeys)
      assert(
        Boolean(mobileDictionary[key]),
        `Mobile ${language} is missing ${key}.`,
      );
  }
}

console.log(
  "Direct sub-account, seat, authorization, password, migration, navigation, and localization contracts passed.",
);

function mobileBaseText() {
  return read("apps/mobile/src/i18n/translations.ts");
}
