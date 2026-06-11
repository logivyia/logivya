import type { ZodError } from "zod";

export type Translate = (key: string, variables?: Record<string, string | number>) => string;
export function translateValidationErrors(error: ZodError, t: Translate) {
  return error.issues.map(issue => ({
    path: issue.path.join("."),
    message: t(issue.message),
  }));
}
