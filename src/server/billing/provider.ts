export type BillingCustomerInput = { companyId: string; name: string; email: string };
export type CheckoutInput = { companyId: string; planSlug: string; successUrl: string; cancelUrl: string };
export interface BillingProviderAdapter {
  readonly providerId: string;
  createCustomer(input: BillingCustomerInput): Promise<{ externalCustomerId: string }>;
  createCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }>;
  cancelSubscription(externalSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  verifyWebhook(payload: string, signature: string): Promise<boolean>;
}
