import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "validation.required").max(100),
  username: z.string().min(3, "validation.required").max(40).regex(/^[a-z0-9._-]+$/i, "validation.invalid"),
  email: z.string().email("validation.email"),
  phone: z.string().min(7, "validation.phone").max(30, "validation.phone"),
  companyName: z.string().min(2, "validation.required").max(120),
  password: z.string().min(12, "validation.password").max(128).regex(/[A-Z]/, "validation.password").regex(/[a-z]/, "validation.password").regex(/\d/, "validation.password").regex(/[^A-Za-z0-9]/, "validation.password"),
  passwordConfirmation: z.string(),
  termsAccepted: z.literal("on"),
  privacyAccepted: z.literal("on"),
  kvkkAccepted: z.literal("on"),
  marketingAccepted: z.string().optional(),
  referralCode: z.string().max(40).optional(),
}).refine((input) => input.password === input.passwordConfirmation, { path: ["passwordConfirmation"], message: "validation.passwordMatch" });
export const loginSchema = z.object({ identifier: z.string().min(3, "validation.required").max(254), password: z.string().min(1, "validation.required") });
