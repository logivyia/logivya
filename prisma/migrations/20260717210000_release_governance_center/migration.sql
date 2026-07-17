CREATE TYPE "ReleasePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'VALIDATING', 'BLOCKED', 'APPROVED', 'BUILT', 'SUBMITTED', 'ROLLING_OUT', 'COMPLETED', 'ROLLED_BACK');
CREATE TYPE "ReleaseCheckStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'WAIVED_WITH_APPROVAL', 'NOT_APPLICABLE');
CREATE TYPE "ReleaseArtifactType" AS ENUM ('AAB', 'APK', 'IPA', 'ARCHIVE', 'SBOM', 'SOURCE_MAP', 'RELEASE_MANIFEST', 'TEST_REPORT', 'SCREENSHOT', 'OTHER');
CREATE TYPE "StoreProvider" AS ENUM ('GOOGLE_PLAY', 'APP_STORE');
CREATE TYPE "StoreSubmissionStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'REVOKED');
CREATE TYPE "RolloutStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'HALTED', 'COMPLETED', 'ROLLED_BACK');

CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "platform" "ReleasePlatform" NOT NULL,
    "packageId" TEXT NOT NULL,
    "versionCode" INTEGER,
    "versionName" TEXT NOT NULL,
    "gitCommit" TEXT NOT NULL,
    "apiContractVersion" TEXT,
    "buildDate" TIMESTAMP(3),
    "channel" TEXT,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseArtifact" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "type" "ReleaseArtifactType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageUri" TEXT,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "signingCertificateSha256" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReleaseArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseCheck" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ReleaseCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "evidenceUri" TEXT,
    "evidenceSummary" TEXT,
    "waiverReason" TEXT,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReleaseCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreSubmission" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "provider" "StoreProvider" NOT NULL,
    "track" TEXT NOT NULL,
    "status" "StoreSubmissionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "externalId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestExecution" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "suite" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "device" TEXT,
    "status" "ReleaseCheckStatus" NOT NULL,
    "reportUri" TEXT,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolloutStage" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "provider" "StoreProvider" NOT NULL,
    "track" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL,
    "status" "RolloutStatus" NOT NULL DEFAULT 'PLANNED',
    "metrics" JSONB,
    "haltReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RolloutStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Release_releaseId_key" ON "Release"("releaseId");
CREATE UNIQUE INDEX "Release_platform_packageId_versionCode_key" ON "Release"("platform", "packageId", "versionCode");
CREATE INDEX "Release_platform_status_createdAt_idx" ON "Release"("platform", "status", "createdAt");
CREATE INDEX "Release_gitCommit_idx" ON "Release"("gitCommit");
CREATE UNIQUE INDEX "ReleaseArtifact_releaseId_sha256_key" ON "ReleaseArtifact"("releaseId", "sha256");
CREATE INDEX "ReleaseArtifact_releaseId_type_idx" ON "ReleaseArtifact"("releaseId", "type");
CREATE UNIQUE INDEX "ReleaseCheck_releaseId_key_key" ON "ReleaseCheck"("releaseId", "key");
CREATE INDEX "ReleaseCheck_releaseId_status_idx" ON "ReleaseCheck"("releaseId", "status");
CREATE UNIQUE INDEX "StoreSubmission_releaseId_provider_track_key" ON "StoreSubmission"("releaseId", "provider", "track");
CREATE INDEX "StoreSubmission_provider_status_createdAt_idx" ON "StoreSubmission"("provider", "status", "createdAt");
CREATE INDEX "TestExecution_releaseId_status_idx" ON "TestExecution"("releaseId", "status");
CREATE INDEX "TestExecution_suite_createdAt_idx" ON "TestExecution"("suite", "createdAt");
CREATE INDEX "Approval_releaseId_kind_createdAt_idx" ON "Approval"("releaseId", "kind", "createdAt");
CREATE INDEX "Approval_decision_createdAt_idx" ON "Approval"("decision", "createdAt");
CREATE UNIQUE INDEX "RolloutStage_releaseId_provider_track_percentage_key" ON "RolloutStage"("releaseId", "provider", "track", "percentage");
CREATE INDEX "RolloutStage_status_createdAt_idx" ON "RolloutStage"("status", "createdAt");

ALTER TABLE "ReleaseArtifact" ADD CONSTRAINT "ReleaseArtifact_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReleaseCheck" ADD CONSTRAINT "ReleaseCheck_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreSubmission" ADD CONSTRAINT "StoreSubmission_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestExecution" ADD CONSTRAINT "TestExecution_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolloutStage" ADD CONSTRAINT "RolloutStage_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolloutStage" ADD CONSTRAINT "RolloutStage_percentage_check" CHECK ("percentage" >= 0 AND "percentage" <= 100);
