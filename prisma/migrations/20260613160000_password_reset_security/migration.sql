ALTER TABLE "PasswordResetToken"
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "PasswordResetToken" AS token
SET "email" = "User"."email"
FROM "User"
WHERE token."userId" = "User"."id";

ALTER TABLE "PasswordResetToken"
ALTER COLUMN "email" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "PasswordResetToken_email_createdAt_idx"
ON "PasswordResetToken"("email", "createdAt");
