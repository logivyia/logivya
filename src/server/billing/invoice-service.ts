import type { InvoiceProvider, InvoiceDraft } from "@/server/billing/invoice-provider";
import { recordInvoiceAudit, type InvoiceAuditRepository } from "@/server/billing/invoice-audit";

export class InvoiceService {
  constructor(private readonly provider: InvoiceProvider, private readonly auditLogs: InvoiceAuditRepository) {}

  async issue(draft: InvoiceDraft, userId?: string) {
    const issued = await this.provider.issue(draft);
    await recordInvoiceAudit(this.auditLogs, { companyId: draft.companyId, userId, action: "issued", metadata: { provider: this.provider.providerId, ...issued } });
    return issued;
  }
  async cancel(companyId: string, invoiceId: string, providerInvoiceId: string, userId?: string) {
    await this.provider.cancel(providerInvoiceId);
    await recordInvoiceAudit(this.auditLogs, { companyId, userId, invoiceId, action: "canceled", metadata: { provider: this.provider.providerId, providerInvoiceId } });
  }
  async getPdfUrl(companyId: string, invoiceId: string, providerInvoiceId: string, userId?: string) {
    const pdfUrl = await this.provider.getPdfUrl(providerInvoiceId);
    await recordInvoiceAudit(this.auditLogs, { companyId, userId, invoiceId, action: "pdfDownloaded", metadata: { provider: this.provider.providerId } });
    return pdfUrl;
  }
}
