import { z } from "zod";

import {
  PASSWORD_CONFIRMATION_MISMATCH,
  passwordSchema,
} from "@/features/auth/schemas";

export const mobileRegistrationSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(30).optional(),
  password: passwordSchema,
  passwordConfirmation: z.custom<string>(
    (value) => typeof value === "string",
    { message: "PASSWORD_INVALID_TYPE" },
  ),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  kvkkAccepted: z.literal(true),
  referralCode: z.string().max(40).optional(),
  invitationToken: z.string().min(32).max(200).optional(),
  invitationCode: z.string().trim().min(16).max(32).optional(),
  deviceId: z.string().min(3).max(160),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
})
  .refine(
    (input) => !(input.invitationToken && input.invitationCode),
    { path: ["invitationCode"], message: "validation.invalid" },
  )
  .refine(
    (input) => input.platform?.trim().toUpperCase() === "IOS" || Boolean(input.phone?.trim()),
    { path: ["phone"], message: "validation.required" },
  )
  .refine(
    (input) => input.password === input.passwordConfirmation,
    {
      path: ["passwordConfirmation"],
      message: PASSWORD_CONFIRMATION_MISMATCH,
    },
  );
