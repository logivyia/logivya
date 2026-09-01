CREATE TYPE "SubscriptionRequestStatus" AS ENUM (
  'DRAFT',
  'AWAITING_PAYMENT',
  'UNDER_REVIEW',
  'APPROVED',
  'ACTIVATED',
  'CLARIFICATION_REQUIRED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "SubscriptionRequestActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

CREATE TYPE "BillingLegalDocumentType" AS ENUM (
  'PRE_INFORMATION_FORM',
  'DISTANCE_SALES_AGREEMENT',
  'REFUND_WITHDRAWAL_POLICY'
);

CREATE TABLE "SubscriptionRequest" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "reviewedByUserId" TEXT,
  "planId" TEXT,
  "activationSubscriptionId" TEXT,
  "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "billingPeriod" "BillingPeriod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "planCode" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "planSnapshot" JSONB NOT NULL,
  "buyerSnapshot" JSONB NOT NULL,
  "sellerSnapshot" JSONB NOT NULL,
  "bankSnapshot" JSONB NOT NULL,
  "paymentReference" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "idempotencyKeyHash" TEXT NOT NULL,
  "customerNote" TEXT,
  "adminCustomerNote" TEXT,
  "adminInternalNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubscriptionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionRequestConsent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT,
  "documentType" "BillingLegalDocumentType" NOT NULL,
  "documentVersion" TEXT NOT NULL,
  "documentHash" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "userAgentSummary" TEXT,
  "ipAddressMasked" TEXT,
  "documentSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionRequestConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionRequestTransition" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fromStatus" "SubscriptionRequestStatus",
  "toStatus" "SubscriptionRequestStatus" NOT NULL,
  "actorType" "SubscriptionRequestActorType" NOT NULL,
  "actorUserId" TEXT,
  "customerNote" TEXT,
  "internalNote" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionRequestTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingSellerConfiguration" (
  "id" TEXT NOT NULL DEFAULT 'logivya',
  "officialName" TEXT,
  "registeredAddress" TEXT,
  "taxOffice" TEXT,
  "taxNumber" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "tradeRegistryNumber" TEXT,
  "tradeRegistryNotApplicable" BOOLEAN NOT NULL DEFAULT false,
  "mersisNumber" TEXT,
  "mersisNotApplicable" BOOLEAN NOT NULL DEFAULT false,
  "legalDocumentsApprovedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingSellerConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionRequest_publicId_key" ON "SubscriptionRequest"("publicId");
CREATE UNIQUE INDEX "SubscriptionRequest_activationSubscriptionId_key" ON "SubscriptionRequest"("activationSubscriptionId");
CREATE UNIQUE INDEX "SubscriptionRequest_paymentReference_key" ON "SubscriptionRequest"("paymentReference");
CREATE UNIQUE INDEX "SubscriptionRequest_companyId_idempotencyKeyHash_key" ON "SubscriptionRequest"("companyId", "idempotencyKeyHash");
CREATE INDEX "SubscriptionRequest_companyId_status_createdAt_idx" ON "SubscriptionRequest"("companyId", "status", "createdAt");
CREATE INDEX "SubscriptionRequest_requestedByUserId_createdAt_idx" ON "SubscriptionRequest"("requestedByUserId", "createdAt");
CREATE INDEX "SubscriptionRequest_status_createdAt_idx" ON "SubscriptionRequest"("status", "createdAt");
CREATE INDEX "SubscriptionRequest_planCode_billingPeriod_idx" ON "SubscriptionRequest"("planCode", "billingPeriod");

CREATE UNIQUE INDEX "SubscriptionRequestConsent_requestId_documentType_key" ON "SubscriptionRequestConsent"("requestId", "documentType");
CREATE INDEX "SubscriptionRequestConsent_userId_acceptedAt_idx" ON "SubscriptionRequestConsent"("userId", "acceptedAt");
CREATE INDEX "SubscriptionRequestConsent_documentHash_idx" ON "SubscriptionRequestConsent"("documentHash");

CREATE INDEX "SubscriptionRequestTransition_requestId_createdAt_idx" ON "SubscriptionRequestTransition"("requestId", "createdAt");
CREATE INDEX "SubscriptionRequestTransition_actorUserId_createdAt_idx" ON "SubscriptionRequestTransition"("actorUserId", "createdAt");
CREATE INDEX "SubscriptionRequestTransition_toStatus_createdAt_idx" ON "SubscriptionRequestTransition"("toStatus", "createdAt");

ALTER TABLE "SubscriptionRequest"
  ADD CONSTRAINT "SubscriptionRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequest"
  ADD CONSTRAINT "SubscriptionRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequest"
  ADD CONSTRAINT "SubscriptionRequest_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequest"
  ADD CONSTRAINT "SubscriptionRequest_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequest"
  ADD CONSTRAINT "SubscriptionRequest_activationSubscriptionId_fkey"
  FOREIGN KEY ("activationSubscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequestConsent"
  ADD CONSTRAINT "SubscriptionRequestConsent_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SubscriptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequestConsent"
  ADD CONSTRAINT "SubscriptionRequestConsent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequestTransition"
  ADD CONSTRAINT "SubscriptionRequestTransition_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SubscriptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequestTransition"
  ADD CONSTRAINT "SubscriptionRequestTransition_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingSellerConfiguration"
  ADD CONSTRAINT "BillingSellerConfiguration_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
