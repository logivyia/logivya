import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import argon2 from "argon2";

import {
  MIN_PASSWORD_LENGTH,
  passwordCharacterCount,
  validatePasswordPolicy,
} from "@logivya/validation/password-policy";
import {
  authPasswordErrorCode,
  changePasswordSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/features/auth/schemas";
import { hashPassword, PasswordPolicyValidationError, verifyPassword } from "@/server/security/passwords";

const root = process.cwd();

const acceptedPasswords = [
  "abcdefgh",
  "12345678",
  "!!!!!!!!",
  "password",
  "merhaba1",
  "Abcdefgh",
  "qwertyui",
  "testtest",
  "abcd1234",
  "+1234567",
  "772233++",
  "Logivya1",
  "şifre123",
  "пароль12",
  "δοκιμή123",
  "äöüß1234",
  "nomatch1",
] as const;

const rejectedPasswords = ["1234567", "abcdefg", "!!!!!!!", "abc"] as const;

function registrationInput(password: unknown, passwordConfirmation: unknown = password) {
  return {
    name: "Password Policy Test",
    email: "password-policy@example.com",
    phone: "+905551112233",
    password,
    passwordConfirmation,
    termsAccepted: "on",
    privacyAccepted: "on",
    kvkkAccepted: "on",
  };
}

async function main() {
for (const password of acceptedPasswords) {
  const policy = validatePasswordPolicy(password);
  assert.equal(policy.valid, true, `${password} must satisfy the minimum-eight policy`);
  assert.ok(passwordCharacterCount(password) >= MIN_PASSWORD_LENGTH);
  assert.equal(registerSchema.safeParse(registrationInput(password)).success, true, `${password} must pass registration`);
}

for (const password of rejectedPasswords) {
  const policy = validatePasswordPolicy(password);
  assert.deepEqual(policy, { valid: false, code: "PASSWORD_TOO_SHORT", characterCount: Array.from(password).length });
  const parsed = registerSchema.safeParse(registrationInput(password));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.equal(authPasswordErrorCode(parsed.error), "PASSWORD_TOO_SHORT");
}

assert.deepEqual(validatePasswordPolicy(""), { valid: false, code: "PASSWORD_REQUIRED", characterCount: 0 });
assert.deepEqual(validatePasswordPolicy(null), { valid: false, code: "PASSWORD_INVALID_TYPE", characterCount: 0 });

const mismatch = registerSchema.safeParse(registrationInput("abcdefgh", "abcdefgh1"));
assert.equal(mismatch.success, false);
if (!mismatch.success) assert.equal(authPasswordErrorCode(mismatch.error), "PASSWORD_CONFIRMATION_MISMATCH");

assert.equal(resetPasswordSchema.safeParse({
  identifier: "password-policy@example.com",
  code: "123456",
  password: "testtest",
  passwordConfirmation: "testtest",
}).success, true);

assert.equal(changePasswordSchema.safeParse({
  currentPassword: "existing-password",
  password: "12345678",
  passwordConfirmation: "12345678",
}).success, true);

const exactPassword = " abcdefgh ";
const exactHash = await hashPassword(exactPassword, "test-pepper");
assert.equal(await verifyPassword(exactHash, exactPassword, "test-pepper"), true);
assert.equal(await verifyPassword(exactHash, exactPassword.trim(), "test-pepper"), false, "Passwords must not be silently trimmed");

await assert.rejects(
  () => hashPassword("abcdefg"),
  (error) => error instanceof PasswordPolicyValidationError && error.code === "PASSWORD_TOO_SHORT",
);

const legacyCompatibleHash = await argon2.hash("ExistingAdmin1!test-pepper", {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 3,
  parallelism: 1,
});
assert.equal(await verifyPassword(legacyCompatibleHash, "ExistingAdmin1!", "test-pepper"), true, "Existing Argon2id hashes must remain valid");

const runtimeFiles = [
  "src/server/security/authentication.ts",
  "src/server/security/passwords.ts",
  "src/features/auth/schemas.ts",
  "src/app/api/auth/register/route.ts",
  "src/app/api/mobile/auth/register/route.ts",
  "src/components/auth-form.tsx",
  "src/components/password-reset-form.tsx",
  "apps/mobile/src/screens/auth/register-screen.tsx",
  "apps/mobile/src/screens/auth/reset-password-screen.tsx",
];
const runtimeSource = (await Promise.all(runtimeFiles.map((file) => readFile(join(root, file), "utf8")))).join("\n");
assert.doesNotMatch(runtimeSource, /\.min\(12|requireUppercase|requireLowercase|requireNumber|requireSymbol/);
assert.doesNotMatch(runtimeSource, /\.regex\(\/\[A-Z\]\//);
assert.doesNotMatch(runtimeSource, /endsWith\s*\(/);
assert.doesNotMatch(runtimeSource, /772233/);

const localeNames = ["tr", "en", "ro", "ru", "az", "tk", "de", "bg", "el", "sr"];
const requiredWebKeys = [
  "auth.passwordRequired",
  "auth.passwordTooShort",
  "auth.passwordConfirmationMismatch",
  "auth.passwordInvalidType",
];
const requiredMobileKeys = [
  "passwordPolicy",
  "passwordRequired",
  "passwordTooShort",
  "passwordConfirmationMismatch",
  "passwordInvalidType",
];

for (const locale of localeNames) {
  const web = JSON.parse(await readFile(join(root, "packages", "locales", `${locale}.json`), "utf8")) as Record<string, string>;
  for (const key of requiredWebKeys) assert.ok(web[key]?.trim(), `${locale} web locale is missing ${key}`);
  if (locale !== "tr" && locale !== "en") {
    const mobile = JSON.parse(await readFile(join(root, "apps", "mobile", "src", "i18n", "locales", `${locale}.json`), "utf8")) as Record<string, string>;
    for (const key of requiredMobileKeys) assert.ok(mobile[key]?.trim(), `${locale} mobile locale is missing ${key}`);
  }
}

const mobileBase = await readFile(join(root, "apps", "mobile", "src", "i18n", "translations.ts"), "utf8");
for (const key of requiredMobileKeys) assert.match(mobileBase, new RegExp(`\\b${key}:`));

console.log(JSON.stringify({
  ok: true,
  policy: `minimum ${MIN_PASSWORD_LENGTH} Unicode code points; no character-class, prefix, or suffix rule`,
  accepted: acceptedPasswords.length,
  rejected: rejectedPasswords.length + 2,
  passwordConfirmation: "PASSWORD_CONFIRMATION_MISMATCH",
  hashStorage: "Argon2id unchanged; exact password preserved",
  locales: localeNames.length,
}, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
