import argon2 from "argon2";
import {
  validatePasswordPolicy,
  type PasswordPolicyErrorCode,
} from "@logivya/validation/password-policy";

const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 3, parallelism: 1 } as const;

export class PasswordPolicyValidationError extends Error {
  constructor(public readonly code: PasswordPolicyErrorCode) {
    super(code);
    this.name = "PasswordPolicyValidationError";
  }
}

export async function hashPassword(password: string, pepper = "") {
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) throw new PasswordPolicyValidationError(policy.code);
  return argon2.hash(`${password}${pepper}`, OPTIONS);
}
export async function verifyPassword(hash: string, password: string, pepper = "") {
  return argon2.verify(hash, `${password}${pepper}`);
}
