import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateMfaLoginDecision,
  type MfaMethodType,
} from "../src/server/security/mfa-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

const passed: string[] = [];

function test(name: string, run: () => void) {
  run();
  passed.push(name);
}

function decision(input: {
  methods?: MfaMethodType[];
  policy?:
    "NONE" | "REQUIRE_ANY_MFA" | "REQUIRE_TOTP" | "REQUIRE_TOTP_FOR_ADMINS";
  role?: string;
  preferred?: MfaMethodType | null;
  legacyRequired?: boolean;
}) {
  return evaluateMfaLoginDecision({
    enabledMethods: input.methods ?? [],
    companyPolicy: input.policy ?? "NONE",
    role: input.role ?? "MEMBER",
    preferredMethod: input.preferred,
    legacyRequired: input.legacyRequired,
  });
}

const webLogin = source("src/app/api/auth/login/route.ts");
const mobileLogin = source("src/app/api/mobile/auth/login/route.ts");
const webSelect = source("src/app/api/auth/mfa/login/select/route.ts");
const mobileSelect = source("src/app/api/mobile/auth/mfa/select/route.ts");
const loginMethodService = source("src/server/security/mfa-login-method.ts");
const challengeService = source("src/server/auth/mfa-challenge.ts");
const mfaService = source("src/server/security/mfa.ts");
const policyService = source("src/server/security/mfa-policy.ts");
const webSession = source("src/server/auth/session.ts");
const mobileSession = source("src/server/mobile/auth.ts");
const webDisable = source("src/app/api/auth/mfa/disable/route.ts");
const mobileDisable = source("src/app/api/mobile/auth/mfa/disable/route.ts");
const webVerify = source("src/app/api/auth/mfa/login/verify/route.ts");
const mobileVerify = source("src/app/api/mobile/auth/mfa/verify/route.ts");
const webLoginUi = source("src/components/auth-form.tsx");
const mobileLoginUi = source("apps/mobile/src/screens/auth/login-screen.tsx");
const webSecurityUi = source("src/components/security-settings-page.tsx");
const mobileSecurityUi = source(
  "apps/mobile/src/screens/app/security-screen.tsx",
);
const webStatus = source("src/app/api/auth/mfa/status/route.ts");
const mobileStatus = source("src/app/api/mobile/auth/mfa/status/route.ts");
const webPolicy = source("src/app/api/settings/security-policy/route.ts");
const mobilePolicy = source(
  "src/app/api/mobile/company/security-policy/route.ts",
);
const securityEvents = source("src/server/security/events.ts");
const adminSecurityEvents = source(
  "src/app/api/admin/security/events/route.ts",
);
const trLocale = source("packages/locales/tr.json");
const mobileTranslations = source("apps/mobile/src/i18n/translations.ts");
const migration = source(
  "prisma/migrations/20260721160000_optional_multi_factor_authentication/migration.sql",
);

test("1. Password-only login", () => {
  const result = decision({});
  assert(
    !result.mfaRequired &&
      !result.setupRequired &&
      result.selectedMethod === null,
    "Password-only users must not receive an MFA challenge",
  );
});

test("2. TOTP-only login", () => {
  const result = decision({ methods: ["TOTP"] });
  assert(
    result.mfaRequired && result.selectedMethod === "TOTP",
    "TOTP-only users must use TOTP",
  );
});

test("3. Email-OTP-only login", () => {
  const result = decision({ methods: ["EMAIL_OTP"] });
  assert(
    result.mfaRequired && result.selectedMethod === "EMAIL_OTP",
    "Email-only users must use email OTP",
  );
});

test("4. Both methods with TOTP preferred", () => {
  const result = decision({
    methods: ["TOTP", "EMAIL_OTP"],
    preferred: "TOTP",
  });
  assert(
    result.selectedMethod === "TOTP" && result.enabledMethods.length === 2,
    "TOTP preference must be preserved",
  );
});

test("5. Both methods with email preferred", () => {
  const result = decision({
    methods: ["TOTP", "EMAIL_OTP"],
    preferred: "EMAIL_OTP",
  });
  assert(
    result.selectedMethod === "EMAIL_OTP" && result.enabledMethods.length === 2,
    "Email preference must be preserved",
  );
});

test("6. Alternate enabled method selection", () => {
  assert(
    webSelect.includes("chooseMfaChallengeMethod") &&
      mobileSelect.includes("chooseMfaChallengeMethod"),
    "Web and mobile must use the backend alternate-method selector",
  );
  assert(
    loginMethodService.includes("selectMfaChallengeMethod") &&
      loginMethodService.includes("resolveMfaLoginDecision"),
    "The shared selector must validate enabled methods and organization policy",
  );
  assert(
    webLoginUi.includes("mfaUseAnotherMethod") &&
      mobileLoginUi.includes("mfaUseAnotherMethod"),
    "Both clients must expose the alternate method action",
  );
});

test("7. Disable TOTP while email remains", () => {
  const result = decision({ methods: ["EMAIL_OTP"] });
  assert(
    result.mfaRequired && result.selectedMethod === "EMAIL_OTP",
    "Email OTP must remain active after TOTP is disabled",
  );
  assert(
    webDisable.includes("disableMfaMethod") &&
      mobileDisable.includes("disableMfaMethod"),
    "Both clients must use the central disable policy",
  );
  assert(
    webDisable.includes("verificationMethod") &&
      mobileDisable.includes("verificationMethod") &&
      webDisable.includes("verifyEmailStepUp") &&
      mobileDisable.includes("verifyEmailStepUp"),
    "Both disable APIs must allow an enabled email factor to verify TOTP removal",
  );
  assert(
    webSecurityUi.includes('sendEmailStepUp("TOTP")') &&
      mobileSecurityUi.includes('sendEmailDisableCode("TOTP")'),
    "Web and mobile must expose the email verification step before TOTP removal",
  );
});

test("8. Disable email while TOTP remains", () => {
  const result = decision({ methods: ["TOTP"] });
  assert(
    result.mfaRequired && result.selectedMethod === "TOTP",
    "TOTP must remain active after email OTP is disabled",
  );
  assert(
    webSecurityUi.includes('sendEmailStepUp("EMAIL_OTP")') &&
      mobileSecurityUi.includes('sendEmailDisableCode("EMAIL_OTP")'),
    "Web and mobile must send a method-owned email code before email MFA removal",
  );
});

test("9. Disable final method and return to password-only", () => {
  const result = decision({ methods: [] });
  assert(
    !result.mfaRequired && result.selectedMethod === null,
    "Removing the final optional method must restore password-only login",
  );
  for (const route of [webDisable, mobileDisable]) {
    assert(
      route.includes("verifySettingsPassword") &&
        route.includes("notifyMfaSecurityChange") &&
        route.includes("revokeUserSecuritySessions"),
      "Final method removal must verify password, evaluate sessions, and notify the user",
    );
  }
});

test("10. Organization policy NONE", () => {
  const result = decision({ policy: "NONE" });
  assert(
    !result.mfaRequired && result.policySatisfied,
    "NONE must preserve password-only login",
  );
  assert(
    migration.includes("DEFAULT 'NONE'"),
    "Organization policy must default to NONE",
  );
});

test("11. Organization policy REQUIRE_ANY_MFA", () => {
  const missing = decision({ policy: "REQUIRE_ANY_MFA" });
  const email = decision({ policy: "REQUIRE_ANY_MFA", methods: ["EMAIL_OTP"] });
  assert(
    missing.setupRequired && missing.requiredEnrollmentMethods.length === 2,
    "REQUIRE_ANY_MFA must allow either enrollment method",
  );
  assert(
    !email.setupRequired && email.policySatisfied,
    "Email OTP must satisfy REQUIRE_ANY_MFA",
  );
});

test("12. Organization policy REQUIRE_TOTP", () => {
  const emailOnly = decision({
    policy: "REQUIRE_TOTP",
    methods: ["EMAIL_OTP"],
  });
  const totp = decision({ policy: "REQUIRE_TOTP", methods: ["TOTP"] });
  assert(
    emailOnly.setupRequired &&
      emailOnly.requiredEnrollmentMethods.join() === "TOTP",
    "REQUIRE_TOTP must not be satisfied by email OTP",
  );
  assert(
    !totp.setupRequired && totp.policySatisfied,
    "TOTP must satisfy REQUIRE_TOTP",
  );
});

test("13. Administrator-only TOTP policy", () => {
  for (const role of ["OWNER", "ADMIN"]) {
    assert(
      decision({ policy: "REQUIRE_TOTP_FOR_ADMINS", role }).setupRequired,
      `${role} must enroll TOTP`,
    );
  }
  assert(
    !decision({ policy: "REQUIRE_TOTP_FOR_ADMINS", role: "MEMBER" })
      .mfaRequired,
    "Regular members must retain optional MFA",
  );
});

test("14. Existing users are not locked out", () => {
  const staleLegacyFlag = decision({ legacyRequired: true });
  assert(
    !staleLegacyFlag.mfaRequired && !staleLegacyFlag.setupRequired,
    "A stale legacy flag without an enabled method must not force migration enrollment",
  );
  assert(
    !/\bDROP\s+(TABLE|COLUMN)\b/iu.test(migration),
    "Optional MFA migration must be additive",
  );
  assert(
    !migration.includes('SET "mfaPolicy" = \'REQUIRE'),
    "Migration must not silently enable an organization policy",
  );
});

test("15. Email OTP is not sent unnecessarily", () => {
  const expectedGuard = 'purpose === "LOGIN" && selectedMethod === "EMAIL_OTP"';
  assert(
    webLogin.includes(expectedGuard) && mobileLogin.includes(expectedGuard),
    "Login may send email OTP only when email is selected",
  );
  assert(
    challengeService.includes('challenge.selectedMethod !== "EMAIL_OTP"') &&
      challengeService.includes("MFA_METHOD_NOT_SELECTED"),
    "Email delivery service must reject unselected email challenges",
  );
});

test("16. Recovery code works", () => {
  assert(
    mfaService.includes('method: "RECOVERY"') &&
      mfaService.includes("usedAt: new Date()"),
    "Recovery codes must be accepted once and consumed",
  );
  assert(
    webVerify.includes("verifyAndConsumeMfaCode") &&
      mobileVerify.includes("verifyAndConsumeMfaCode"),
    "Web and mobile TOTP login must accept the shared recovery-code verifier",
  );
});

test("17. Rate limiting and brute-force protection", () => {
  assert(
    challengeService.includes("MFA_MAX_ATTEMPTS = 5") &&
      challengeService.includes("EMAIL_OTP_RESEND_DELAY_MS"),
    "MFA attempts and email resend must be rate limited",
  );
  assert(
    webDisable.includes("enforceOperationRateLimit") &&
      mobileDisable.includes("enforceOperationRateLimit"),
    "Sensitive method changes must be rate limited",
  );
});

test("18. Web and mobile parity", () => {
  for (const route of [webLogin, mobileLogin]) {
    assert(
      route.includes("resolveMfaLoginDecision") &&
        route.includes("availableMethods") &&
        route.includes("preferredMethod"),
      "Both login APIs must expose the same MFA decision contract",
    );
  }
  for (const status of [webStatus, mobileStatus]) {
    assert(
      status.includes("listMfaMethodState") &&
        !status.includes("policyCompliant") &&
        !status.includes("policyRequiresAnyMfa") &&
        !status.includes("canManageCompanyPolicy") &&
        !status.includes("recoveryCodesRemaining") &&
        !status.includes("trustedDevices"),
      "Settings APIs must expose only the visible MFA method state",
    );
    assert(
      !status.includes("recentEvents") &&
        !status.includes("securityEvent.findMany"),
      "Customer MFA status APIs must not expose the internal security event feed",
    );
  }
  assert(
    webSecurityUi.includes("EMAIL_OTP") &&
      mobileSecurityUi.includes("EMAIL_OTP"),
    "Both security screens must manage email OTP independently",
  );
  for (const ui of [webSecurityUi, mobileSecurityUi]) {
    assert(
      !ui.includes("OrganizationPolicy") &&
        !ui.includes("organizationPolicy") &&
        !ui.includes("mfaActivity") &&
        !ui.includes("security.activity"),
      "Customer security screens must not expose organization policy or security activity controls",
    );
  }
  assert(
    securityEvents.includes("securityEvent.create") &&
      adminSecurityEvents.includes("securityEvent.findMany"),
    "Internal security event collection and administration must remain available",
  );
});

test("19. Correct Turkish localization", () => {
  const required = [
    "İki Adımlı Doğrulama",
    "Authenticator uygulaması",
    "E-posta ile doğrulama",
    "Yalnızca şifre",
    "Başka bir yöntem kullan",
  ];
  for (const label of required)
    assert(
      trLocale.includes(label) || mobileTranslations.includes(label),
      `Missing Turkish MFA label: ${label}`,
    );
});

test("20. Direct API clients cannot bypass organization policy", () => {
  assert(
    webSession.includes("resolveMfaLoginDecision") &&
      webSession.includes("!mfa.policySatisfied"),
    "Web sessions must enforce organization policy on the backend",
  );
  assert(
    mobileSession.includes("resolveMfaLoginDecision") &&
      mobileSession.includes("!mfa.policySatisfied"),
    "Mobile access tokens must enforce organization policy on the backend",
  );
  assert(
    mobileSession.includes("mobileSessionSatisfiesMfaPolicy") &&
      mobileSession.includes("if (!mfaSatisfied)"),
    "Mobile refresh tokens must not bypass organization policy",
  );
  for (const route of [webPolicy, mobilePolicy])
    assert(
      route.includes('role !== "OWNER"'),
      "Only company owners may change MFA policy",
    );
});

assert(
  ![
    policyService,
    challengeService,
    webLogin,
    mobileLogin,
    webSecurityUi,
    mobileSecurityUi,
  ].some((value) => /\bSMS\b/iu.test(value)),
  "SMS must not be part of the MFA implementation",
);
assert(
  passed.length === 20,
  `Expected 20 optional MFA acceptance tests, received ${passed.length}`,
);
console.log(
  `Optional MFA acceptance passed: ${passed.length}/20 scenarios verified.`,
);
for (const name of passed) console.log(`PASS ${name}`);
