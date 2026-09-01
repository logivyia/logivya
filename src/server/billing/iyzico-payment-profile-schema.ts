import { z } from "zod";

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().max(max).optional(),
);

export const iyzicoPaymentProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^\+?[0-9\s()-]{7,30}$/, "validation.phone"),
  identityNumber: z.string().trim().min(5).max(64),
  addressLine1: z.string().trim().min(5).max(255),
  addressLine2: optionalText(255),
  city: z.string().trim().min(2).max(120),
  district: optionalText(120),
  postalCode: optionalText(24),
  country: z.string().trim().min(2).max(80),
});

export type IyzicoPaymentProfileInput = z.infer<typeof iyzicoPaymentProfileSchema>;
