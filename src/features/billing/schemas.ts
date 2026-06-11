import { z } from "zod";

const numericId = z.string().regex(/^\d+$/, "validation.numeric");
const phone = z.string().regex(/^\+?[0-9\s()-]{7,30}$/, "validation.phone").optional().or(z.literal(""));
const common = {
  companyName: z.string().trim().max(160).optional(),
  tradeName: z.string().trim().max(160).optional(),
  nationalIdNumber: numericId.optional().or(z.literal("")),
  country: z.string().trim().min(2, "validation.required"),
  city: z.string().trim().min(2, "validation.required"),
  district: z.string().trim().max(120).optional(),
  addressLine1: z.string().trim().min(5, "validation.required"),
  addressLine2: z.string().trim().max(240).optional(),
  postalCode: z.string().trim().max(20).optional(),
  billingEmail: z.string().email("validation.email"),
  billingPhone: phone,
  invoiceType: z.enum(["E_INVOICE", "E_ARCHIVE", "STANDARD_INVOICE"]),
  eInvoiceEligible: z.boolean(),
  eArchiveEligible: z.boolean(),
};

const companyProfile = z.object({
  ...common,
  billingType: z.literal("COMPANY"),
  legalName: z.string().trim().min(2, "validation.required"),
  fullName: z.string().trim().optional(),
  taxOffice: z.string().trim().min(2, "validation.required"),
  taxNumber: numericId,
});
const individualProfile = z.object({
  ...common,
  billingType: z.literal("INDIVIDUAL"),
  fullName: z.string().trim().min(2, "validation.required"),
  legalName: z.string().trim().optional(),
  taxOffice: z.string().trim().optional(),
  taxNumber: numericId.optional().or(z.literal("")),
});

export const billingProfileSchema = z.discriminatedUnion("billingType", [companyProfile, individualProfile])
  .superRefine((profile, context) => validateCountryRules(profile, context));
export type BillingProfileInput = z.infer<typeof billingProfileSchema>;

type CountryRuleContext = z.RefinementCtx;
function validateCountryRules(profile: z.infer<typeof companyProfile> | z.infer<typeof individualProfile>, context: CountryRuleContext) {
  if (profile.country === "TR" && profile.billingType === "INDIVIDUAL" && profile.nationalIdNumber && profile.nationalIdNumber.length !== 11) {
    context.addIssue({ code: "custom", path: ["nationalIdNumber"], message: "validation.trNationalId" });
  }
  if (profile.country === "TR" && profile.billingType === "COMPANY" && profile.taxNumber.length !== 10) {
    context.addIssue({ code: "custom", path: ["taxNumber"], message: "validation.trTaxNumber" });
  }
}
