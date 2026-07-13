import { z } from "zod";
import {
  PASSWORD_POLICY_ERROR_CODES,
  validatePasswordPolicy,
  type PasswordPolicyErrorCode,
} from "@logivya/validation/password-policy";

export const PASSWORD_CONFIRMATION_MISMATCH = "PASSWORD_CONFIRMATION_MISMATCH" as const;
export type AuthPasswordErrorCode = PasswordPolicyErrorCode | typeof PASSWORD_CONFIRMATION_MISMATCH;

const passwordErrorCodes = new Set<string>([
  ...PASSWORD_POLICY_ERROR_CODES,
  PASSWORD_CONFIRMATION_MISMATCH,
]);

export const passwordSchema = z.unknown().superRefine((password, context) => {
  const result = validatePasswordPolicy(password);
  if (!result.valid) context.addIssue({ code: "custom", message: result.code });
}).transform((password) => password as string);

const passwordConfirmationSchema = z.custom<string>(
  (value) => typeof value === "string",
  { message: "PASSWORD_INVALID_TYPE" },
);

export function authPasswordErrorCode(error: z.ZodError): AuthPasswordErrorCode | null {
  for (const issue of error.issues) {
    if (passwordErrorCodes.has(issue.message)) return issue.message as AuthPasswordErrorCode;
  }
  return null;
}

export const registerSchema = z.object({
  name: z.string().min(2, "validation.required").max(100),
  email: z.string().email("validation.email"),
  phone: z.string().min(7, "validation.phone").max(30, "validation.phone"),
  password: passwordSchema,
  passwordConfirmation: passwordConfirmationSchema,
  termsAccepted: z.literal("on"),
  privacyAccepted: z.literal("on"),
  kvkkAccepted: z.literal("on"),
  referralCode: z.string().max(40).optional(),
  invitationToken: z.string().min(32).max(200).optional(),
  invitationCode: z.string().trim().min(16).max(32).optional(),
})
  .refine((input) => !(input.invitationToken && input.invitationCode), { path: ["invitationCode"], message: "validation.invalid" })
  .refine((input) => input.password === input.passwordConfirmation, { path: ["passwordConfirmation"], message: PASSWORD_CONFIRMATION_MISMATCH });
export const loginSchema = z.object({ identifier: z.string().min(3, "validation.required").max(254), password: z.string().min(1, "validation.required") });

const identifierSchema = z.string().trim().min(3, "validation.required").max(254).refine(
  (value) => z.string().email().safeParse(value).success || value.replace(/\D/g, "").length >= 7,
  "validation.invalid",
);
export const forgotPasswordSchema = z.object({ identifier: identifierSchema });
export const verifyResetCodeSchema = z.object({
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, "auth.resetInvalidCode"),
});
export const resetPasswordSchema = z.object({
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, "auth.resetInvalidCode"),
  password: passwordSchema,
  passwordConfirmation: passwordConfirmationSchema,
}).refine((input) => input.password === input.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: PASSWORD_CONFIRMATION_MISMATCH,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "PASSWORD_REQUIRED"),
  password: passwordSchema,
  passwordConfirmation: passwordConfirmationSchema,
}).refine((input) => input.password === input.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: PASSWORD_CONFIRMATION_MISMATCH,
});
