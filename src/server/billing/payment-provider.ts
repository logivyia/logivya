export type CheckoutSessionInput={companyId:string;planSlug:string;billingPeriod:"MONTHLY"|"YEARLY";successUrl:string;cancelUrl:string};
export interface PaymentProvider{
  readonly providerId:"IYZICO"|"PAYTR"|"STRIPE"|"PADDLE";
  createCheckoutSession(input:CheckoutSessionInput):Promise<{id:string;url:string}>;
  verifyWebhook(input:{payload:string;signature:string}):Promise<{valid:boolean;eventId?:string}>;
  getPaymentStatus(providerPaymentId:string):Promise<"PENDING"|"PAID"|"FAILED"|"REFUNDED"|"CANCELED">;
  refundPayment(paymentId:string):Promise<void>;
}
