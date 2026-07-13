-- Add the persisted account locale without changing existing user data.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'en';
