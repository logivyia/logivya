export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_POLICY_ERROR_CODES = [
  "PASSWORD_REQUIRED",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_INVALID_TYPE",
] as const;

export type PasswordPolicyErrorCode = (typeof PASSWORD_POLICY_ERROR_CODES)[number];

export type PasswordPolicyResult =
  | { valid: true; characterCount: number }
  | { valid: false; code: PasswordPolicyErrorCode; characterCount: number };

export function passwordCharacterCount(password: string) {
  return Array.from(password).length;
}

export function validatePasswordPolicy(password: unknown): PasswordPolicyResult {
  if (typeof password !== "string") {
    return { valid: false, code: "PASSWORD_INVALID_TYPE", characterCount: 0 };
  }

  const characterCount = passwordCharacterCount(password);
  if (characterCount === 0) {
    return { valid: false, code: "PASSWORD_REQUIRED", characterCount };
  }
  if (characterCount < MIN_PASSWORD_LENGTH) {
    return { valid: false, code: "PASSWORD_TOO_SHORT", characterCount };
  }

  return { valid: true, characterCount };
}

export function isValidPassword(password: unknown): password is string {
  return validatePasswordPolicy(password).valid;
}
