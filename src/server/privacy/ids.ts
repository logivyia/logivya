import { randomBytes } from "node:crypto";

export function privacyPublicId(prefix: "DSR" | "EXP" | "DEL" | "HOLD" | "BR" | "DPIA") {
  return `${prefix}-${randomBytes(9).toString("hex").toUpperCase()}`;
}
