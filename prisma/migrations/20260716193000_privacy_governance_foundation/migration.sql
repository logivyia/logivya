-- Privacy governance foundation. Additive only: no customer or stable-core tables are dropped.

ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'INFORMATION';
ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'RESTRICTION';
ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'OBJECTION';
ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'PORTABILITY';
ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'CONSENT_WITHDRAWAL';
ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'AUTOMATED_DECISION_REVIEW';
ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'COMPLAINT';
ALTER TYPE "DataRequestType" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TYPE "DataRequestStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "DataRequestStatus" ADD VALUE IF NOT EXISTS 'IDENTITY_VERIFICATION_REQUIRED';
ALTER TYPE "DataRequestStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE "DataRequestStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_USER';
ALTER TYPE "DataRequestStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "DataRequestStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_APPROVED';
ALTER TYPE "DataRequestStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN', 'EXPIRED', 'NOT_REQUIRED', 'PENDING');
CREATE TYPE "PrivacyVerificationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "PrivacyJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELED', 'BLOCKED');
CREATE TYPE "PrivacyDeletionScope" AS ENUM ('USER', 'COMPANY');
CREATE TYPE "LegalReviewStatus" AS ENUM ('DRAFT', 'LEGAL_REVIEW_REQUIRED', 'APPROVED', 'RETIRED');

ALTER TABLE "ConsentRecord"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "purposeCode" TEXT NOT NULL DEFAULT 'LEGACY_NOTICE_ACKNOWLEDGEMENT',
  ADD COLUMN "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
  ADD COLUMN "legalTextVersion" TEXT,
  ADD COLUMN "noticeVersion" TEXT,
  ADD COLUMN "collectionMethod" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "appVersion" TEXT,
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'tr',
  ADD COLUMN "evidence" JSONB,
  ADD COLUMN "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ConsentRecord"
SET
  "status" = CASE WHEN "granted" THEN 'GRANTED'::"ConsentStatus" ELSE 'WITHDRAWN'::"ConsentStatus" END,
  "purposeCode" = CASE
    WHEN "type" = 'MARKETING' THEN 'MARKETING_COMMUNICATIONS'
    WHEN "type" = 'TERMS_OF_SERVICE' THEN 'TERMS_ACKNOWLEDGEMENT'
    WHEN "type" = 'PRIVACY_POLICY' THEN 'PRIVACY_NOTICE_ACKNOWLEDGEMENT'
    WHEN "type" = 'KVKK' THEN 'KVKK_NOTICE_ACKNOWLEDGEMENT'
    ELSE 'LEGACY_NOTICE_ACKNOWLEDGEMENT'
  END,
  "collectedAt" = "createdAt";

ALTER TABLE "ConsentRecord"
  ADD CONSTRAINT "ConsentRecord_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ConsentRecord_userId_purposeCode_collectedAt_idx" ON "ConsentRecord"("userId", "purposeCode", "collectedAt");
CREATE INDEX "ConsentRecord_companyId_purposeCode_collectedAt_idx" ON "ConsentRecord"("companyId", "purposeCode", "collectedAt");

ALTER TABLE "DataSubjectRequest"
  ADD COLUMN "publicId" TEXT,
  ADD COLUMN "identityVerificationStatus" "PrivacyVerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "verificationMethod" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "responseSummary" TEXT,
  ADD COLUMN "extensionReason" TEXT,
  ADD COLUMN "assignedAdminUserId" TEXT,
  ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deadlineAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "DataSubjectRequest"
SET
  "publicId" = 'DSR-' || upper(substr(md5("id"), 1, 12)),
  "receivedAt" = "requestedAt",
  "createdAt" = "requestedAt";

ALTER TABLE "DataSubjectRequest" ALTER COLUMN "publicId" SET NOT NULL;
CREATE UNIQUE INDEX "DataSubjectRequest_publicId_key" ON "DataSubjectRequest"("publicId");
CREATE INDEX "DataSubjectRequest_status_deadlineAt_idx" ON "DataSubjectRequest"("status", "deadlineAt");

CREATE TABLE "PrivacyRequestMessage" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRequestMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyRequestEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyExportJob" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT,
  "status" "PrivacyJobStatus" NOT NULL DEFAULT 'QUEUED',
  "scope" JSONB NOT NULL,
  "objectKey" TEXT,
  "downloadTokenHash" TEXT,
  "encryptionKeyVersion" TEXT,
  "encryptionIv" TEXT,
  "encryptionAuthTag" TEXT,
  "contentType" TEXT NOT NULL DEFAULT 'application/json+gzip',
  "sizeBytes" BIGINT,
  "checksumSha256" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "downloadedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyExportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyDeletionJob" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT,
  "scope" "PrivacyDeletionScope" NOT NULL,
  "status" "PrivacyJobStatus" NOT NULL DEFAULT 'QUEUED',
  "cancelUntil" TIMESTAMP(3) NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "checkpoint" JSONB,
  "result" JSONB,
  "lastError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PrivacyDeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyLegalHold" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "companyId" TEXT,
  "userId" TEXT,
  "requestId" TEXT,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyLegalHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyBreach" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "discoveredAt" TIMESTAMP(3) NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "reportedByUserId" TEXT NOT NULL,
  "affectedSystem" TEXT NOT NULL,
  "dataCategories" TEXT[],
  "dataSubjectCategories" TEXT[],
  "estimatedAffectedCount" INTEGER,
  "riskLevel" TEXT NOT NULL,
  "containmentActions" TEXT,
  "controllerNotificationStatus" TEXT NOT NULL DEFAULT 'ASSESSMENT_REQUIRED',
  "authorityNotificationStatus" TEXT NOT NULL DEFAULT 'ASSESSMENT_REQUIRED',
  "subjectNotificationStatus" TEXT NOT NULL DEFAULT 'ASSESSMENT_REQUIRED',
  "legalReviewStatus" "LegalReviewStatus" NOT NULL DEFAULT 'LEGAL_REVIEW_REQUIRED',
  "legalReviewNotes" TEXT,
  "rootCause" TEXT,
  "remediation" TEXT,
  "evidence" JSONB,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyBreach_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyDpia" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "projectName" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "processingDescription" TEXT NOT NULL,
  "necessityAssessment" TEXT NOT NULL,
  "proportionalityAssessment" TEXT NOT NULL,
  "dataFlow" JSONB NOT NULL,
  "risks" JSONB NOT NULL,
  "safeguards" JSONB NOT NULL,
  "residualRisk" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "legalReviewStatus" "LegalReviewStatus" NOT NULL DEFAULT 'LEGAL_REVIEW_REQUIRED',
  "reviewAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyDpia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyRetentionRun" (
  "id" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "initiatedByUserId" TEXT,
  "counts" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRetentionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyLegalDocument" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "status" "LegalReviewStatus" NOT NULL DEFAULT 'LEGAL_REVIEW_REQUIRED',
  "sourcePath" TEXT NOT NULL,
  "checksumSha256" TEXT,
  "effectiveAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "previousVersion" TEXT,
  "changeSummary" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyLegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivacyExportJob_publicId_key" ON "PrivacyExportJob"("publicId");
CREATE UNIQUE INDEX "PrivacyExportJob_downloadTokenHash_key" ON "PrivacyExportJob"("downloadTokenHash");
CREATE INDEX "PrivacyExportJob_companyId_userId_createdAt_idx" ON "PrivacyExportJob"("companyId", "userId", "createdAt");
CREATE INDEX "PrivacyExportJob_status_createdAt_idx" ON "PrivacyExportJob"("status", "createdAt");
CREATE INDEX "PrivacyExportJob_expiresAt_idx" ON "PrivacyExportJob"("expiresAt");
CREATE UNIQUE INDEX "PrivacyDeletionJob_publicId_key" ON "PrivacyDeletionJob"("publicId");
CREATE INDEX "PrivacyDeletionJob_companyId_status_scheduledFor_idx" ON "PrivacyDeletionJob"("companyId", "status", "scheduledFor");
CREATE INDEX "PrivacyDeletionJob_userId_status_createdAt_idx" ON "PrivacyDeletionJob"("userId", "status", "createdAt");
CREATE UNIQUE INDEX "PrivacyLegalHold_publicId_key" ON "PrivacyLegalHold"("publicId");
CREATE INDEX "PrivacyLegalHold_status_reviewAt_idx" ON "PrivacyLegalHold"("status", "reviewAt");
CREATE INDEX "PrivacyLegalHold_companyId_scopeType_scopeId_idx" ON "PrivacyLegalHold"("companyId", "scopeType", "scopeId");
CREATE INDEX "PrivacyLegalHold_userId_status_idx" ON "PrivacyLegalHold"("userId", "status");
CREATE UNIQUE INDEX "PrivacyBreach_publicId_key" ON "PrivacyBreach"("publicId");
CREATE INDEX "PrivacyBreach_status_riskLevel_discoveredAt_idx" ON "PrivacyBreach"("status", "riskLevel", "discoveredAt");
CREATE INDEX "PrivacyBreach_legalReviewStatus_discoveredAt_idx" ON "PrivacyBreach"("legalReviewStatus", "discoveredAt");
CREATE UNIQUE INDEX "PrivacyDpia_publicId_key" ON "PrivacyDpia"("publicId");
CREATE INDEX "PrivacyDpia_status_legalReviewStatus_updatedAt_idx" ON "PrivacyDpia"("status", "legalReviewStatus", "updatedAt");
CREATE INDEX "PrivacyDpia_reviewAt_idx" ON "PrivacyDpia"("reviewAt");
CREATE INDEX "PrivacyRetentionRun_status_startedAt_idx" ON "PrivacyRetentionRun"("status", "startedAt");
CREATE INDEX "PrivacyRetentionRun_policyVersion_startedAt_idx" ON "PrivacyRetentionRun"("policyVersion", "startedAt");
CREATE UNIQUE INDEX "PrivacyLegalDocument_type_version_locale_key" ON "PrivacyLegalDocument"("type", "version", "locale");
CREATE INDEX "PrivacyLegalDocument_type_locale_active_idx" ON "PrivacyLegalDocument"("type", "locale", "active");
CREATE INDEX "PrivacyLegalDocument_status_updatedAt_idx" ON "PrivacyLegalDocument"("status", "updatedAt");
CREATE INDEX "PrivacyRequestMessage_requestId_createdAt_idx" ON "PrivacyRequestMessage"("requestId", "createdAt");
CREATE INDEX "PrivacyRequestEvent_requestId_createdAt_idx" ON "PrivacyRequestEvent"("requestId", "createdAt");
CREATE INDEX "PrivacyRequestEvent_action_createdAt_idx" ON "PrivacyRequestEvent"("action", "createdAt");

ALTER TABLE "PrivacyRequestMessage" ADD CONSTRAINT "PrivacyRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyRequestEvent" ADD CONSTRAINT "PrivacyRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyExportJob" ADD CONSTRAINT "PrivacyExportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyExportJob" ADD CONSTRAINT "PrivacyExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyExportJob" ADD CONSTRAINT "PrivacyExportJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivacyDeletionJob" ADD CONSTRAINT "PrivacyDeletionJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrivacyDeletionJob" ADD CONSTRAINT "PrivacyDeletionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrivacyDeletionJob" ADD CONSTRAINT "PrivacyDeletionJob_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivacyLegalHold" ADD CONSTRAINT "PrivacyLegalHold_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyLegalHold" ADD CONSTRAINT "PrivacyLegalHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyLegalHold" ADD CONSTRAINT "PrivacyLegalHold_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
