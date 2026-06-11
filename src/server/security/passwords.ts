import argon2 from "argon2";
import { validateStrongPassword } from "@/server/security/authentication";

const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 3, parallelism: 1 } as const;
export async function hashPassword(password: string, pepper = "") {
  if (!validateStrongPassword(password)) throw new Error("Password does not meet the security policy");
  return argon2.hash(`${password}${pepper}`, OPTIONS);
}
export async function verifyPassword(hash: string, password: string, pepper = "") {
  return argon2.verify(hash, `${password}${pepper}`);
}
