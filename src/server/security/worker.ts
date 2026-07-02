import { z } from "zod";
import { assertEntityBelongsToCompany } from "@/server/security/tenant";

export const secureJobSchema = z.object({
  id: z.string().min(1),
  companyId: z.string().min(1),
  correlationId: z.string().min(1),
  payload: z.object({ campaignId: z.string().min(1), recipientId: z.string().min(1), channelAccountId: z.string().min(1).optional() }),
  createdAt: z.string().datetime(),
});
export const sendRecipientJobSchema = z.object({
  companyId: z.string().min(1),
  campaignId: z.string().min(1),
  recipientId: z.string().min(1),
  correlationId: z.string().min(1),
  source: z.enum(["web", "mobile", "recurring", "retry", "recoverable-retry"]),
  recoveryRetry: z.boolean().optional(),
});
export function validateReloadedJobOwnership(companyId: string, entities: Array<{ id: string; companyId: string } | null>) {
  entities.forEach(entity => assertEntityBelongsToCompany(companyId, entity));
}
