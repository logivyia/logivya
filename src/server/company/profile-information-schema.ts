import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized || undefined;
};

export const profileInformationSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  phone: z.preprocess(emptyStringToUndefined, z.string().regex(/^\+?[0-9\s()-]{7,30}$/, "validation.phone").optional()),
});

export type ProfileInformationInput = z.infer<typeof profileInformationSchema>;
