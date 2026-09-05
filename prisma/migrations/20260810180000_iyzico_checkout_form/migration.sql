ALTER TABLE "SubscriptionRequest"
ADD COLUMN IF NOT EXISTS "paymentProvider" "BillingProvider" NOT NULL DEFAULT 'MANUAL';

CREATE INDEX IF NOT EXISTS "SubscriptionRequest_paymentProvider_status_createdAt_idx"
ON "SubscriptionRequest"("paymentProvider", "status", "createdAt");
