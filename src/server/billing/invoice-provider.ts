export type InvoiceDraft = {
  companyId: string;
  subscriptionId?: string;
  invoiceType: "E_INVOICE" | "E_ARCHIVE" | "STANDARD_INVOICE";
  currency: string;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  billingName: string;
  billingTaxOffice?: string;
  billingTaxNumber?: string;
  billingAddress: string;
  billingEmail: string;
};
export interface InvoiceProvider {
  readonly providerId: string;
  issue(draft: InvoiceDraft): Promise<{ providerInvoiceId: string; invoiceNumber: string; pdfUrl?: string; issuedAt: Date }>;
  cancel(providerInvoiceId: string): Promise<void>;
  getPdfUrl(providerInvoiceId: string): Promise<string | null>;
}
