CREATE TABLE "AdminPermission" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminPermission_code_key" ON "AdminPermission"("code");

CREATE TABLE "AdminRolePermission" (
  "id" TEXT NOT NULL,
  "role" "PlatformAdminRole" NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRolePermission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "AdminPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdminRolePermission_role_permissionId_key" ON "AdminRolePermission"("role", "permissionId");
CREATE INDEX "AdminRolePermission_role_idx" ON "AdminRolePermission"("role");

CREATE TABLE "AdminSessionEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "requestId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSessionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminSessionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AdminSessionEvent_userId_createdAt_idx" ON "AdminSessionEvent"("userId", "createdAt");
CREATE INDEX "AdminSessionEvent_type_createdAt_idx" ON "AdminSessionEvent"("type", "createdAt");

CREATE TABLE "TwoFactorRecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TwoFactorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TwoFactorRecoveryCode_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "MfaCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TwoFactorRecoveryCode_codeHash_key" ON "TwoFactorRecoveryCode"("codeHash");
CREATE INDEX "TwoFactorRecoveryCode_userId_usedAt_idx" ON "TwoFactorRecoveryCode"("userId", "usedAt");
CREATE INDEX "TwoFactorRecoveryCode_credentialId_usedAt_idx" ON "TwoFactorRecoveryCode"("credentialId", "usedAt");

CREATE TABLE "RateLimitEvent" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "ipAddress" TEXT,
  "requestId" TEXT,
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RateLimitEvent_scope_createdAt_idx" ON "RateLimitEvent"("scope", "createdAt");
CREATE INDEX "RateLimitEvent_subjectHash_createdAt_idx" ON "RateLimitEvent"("subjectHash", "createdAt");
CREATE INDEX "RateLimitEvent_blocked_createdAt_idx" ON "RateLimitEvent"("blocked", "createdAt");
