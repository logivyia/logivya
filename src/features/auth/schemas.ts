import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "validation.required").max(100),
  email: z.string().email("validation.email"),
  phone: z.string().min(7, "validation.phone").max(30, "validation.phone"),
  password: z.string().min(12, "validation.password").max(128).regex(/[A-Z]/, "validation.password").regex(/[a-z]/, "validation.password").regex(/\d/, "validation.password").regex(/[^A-Za-z0-9]/, "validation.password"),
  passwordConfirmation: z.string(),
  termsAccepted: z.literal("on"),
  privacyAccepted: z.literal("on"),
  kvkkAccepted: z.literal("on"),
  referralCode: z.string().max(40).optional(),
}).refine((input) => input.password === input.passwordConfirmation, { path: ["passwordConfirmation"], message: "validation.passwordMatch" });
export const loginSchema = z.object({ identifier: z.string().min(3, "validation.required").max(254), password: z.string().min(1, "validation.required") });

const identifierSchema = z.string().trim().min(3, "validation.required").max(254).refine(
  (value) => z.string().email().safeParse(value).success || value.replace(/\D/g, "").length >= 7,
  "validation.invalid",
);
const strongPasswordSchema = z.string().min(12, "validation.password").max(128)
  .regex(/[A-Z]/, "validation.password")
  .regex(/[a-z]/, "validation.password")
  .regex(/\d/, "validation.password")
  .regex(/[^A-Za-z0-9]/, "validation.password");

export const forgotPasswordSchema = z.object({ identifier: identifierSchema });
export const verifyResetCodeSchema = z.object({
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, "auth.resetInvalidCode"),
});
export const resetPasswordSchema = z.object({
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, "auth.resetInvalidCode"),
  password: strongPasswordSchema,
  passwordConfirmation: z.string(),
}).refine((input) => input.password === input.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "validation.passwordMatch",
});
