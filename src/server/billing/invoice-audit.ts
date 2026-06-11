export const INVOICE_AUDIT_ACTIONS = {
  created: "invoice.created",
  issued: "invoice.issued",
  paid: "invoice.paid",
  canceled: "invoice.canceled",
  failed: "invoice.failed",
  pdfDownloaded: "invoice.pdf_downloaded",
  billingProfileUpdated: "billing_profile.updated",
} as const;

export type InvoiceAuditInput = {
  companyId: string;
  userId?: string;
  action: keyof typeof INVOICE_AUDIT_ACTIONS;
  invoiceId?: string;
  metadata?: Record<string, unknown>;
};
export interface InvoiceAuditRepository {
  create(input: {
    companyId: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
export function recordInvoiceAudit(
  auditLogs: InvoiceAuditRepository,
  input: InvoiceAuditInput,
) {
  return auditLogs.create({
    companyId: input.companyId,
    userId: input.userId,
    action: INVOICE_AUDIT_ACTIONS[input.action],
    entityType: input.invoiceId ? "Invoice" : "CompanyBillingProfile",
    entityId: input.invoiceId,
    metadata: input.metadata,
  });
}
