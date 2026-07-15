ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "actorType" TEXT NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "actorEmailMasked" TEXT,
  ADD COLUMN IF NOT EXISTS "result" TEXT NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "requestId" TEXT,
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "clientPlatform" TEXT,
  ADD COLUMN IF NOT EXISTS "appVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "releaseVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "beforeState" JSONB,
  ADD COLUMN IF NOT EXISTS "afterState" JSONB,
  ADD COLUMN IF NOT EXISTS "ipAddressMasked" TEXT,
  ADD COLUMN IF NOT EXISTS "userAgentSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "retainedUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorType_createdAt_idx" ON "AuditLog"("actorType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_createdAt_idx" ON "AuditLog"("entityType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_result_createdAt_idx" ON "AuditLog"("result", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

ALTER TABLE "SecurityEvent"
  ADD COLUMN IF NOT EXISTS "result" TEXT NOT NULL DEFAULT 'RECORDED',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "requestId" TEXT,
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "clientPlatform" TEXT,
  ADD COLUMN IF NOT EXISTS "appVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "ipAddressMasked" TEXT,
  ADD COLUMN IF NOT EXISTS "userAgentSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acknowledgedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "investigationNote" TEXT,
  ADD COLUMN IF NOT EXISTS "retainedUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_status_severity_createdAt_idx" ON "SecurityEvent"("status", "severity", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_correlationId_idx" ON "SecurityEvent"("correlationId");

CREATE TABLE IF NOT EXISTS "OperationalAlert" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "service" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "correlationId" TEXT,
  "metadata" JSONB,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "retainedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OperationalAlert_dedupeKey_key" ON "OperationalAlert"("dedupeKey");
CREATE INDEX IF NOT EXISTS "OperationalAlert_status_severity_lastSeenAt_idx" ON "OperationalAlert"("status", "severity", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "OperationalAlert_type_lastSeenAt_idx" ON "OperationalAlert"("type", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "OperationalAlert_service_environment_lastSeenAt_idx" ON "OperationalAlert"("service", "environment", "lastSeenAt");

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only; corrections require a new audit event.' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
