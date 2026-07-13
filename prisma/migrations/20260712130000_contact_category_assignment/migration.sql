CREATE TABLE IF NOT EXISTS "CategoryContact" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoryContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CategoryContact_categoryId_contactId_key"
  ON "CategoryContact"("categoryId", "contactId");
CREATE INDEX IF NOT EXISTS "CategoryContact_categoryId_userId_companyId_accountId_idx"
  ON "CategoryContact"("categoryId", "userId", "companyId", "accountId");
CREATE INDEX IF NOT EXISTS "CategoryContact_contactId_categoryId_idx"
  ON "CategoryContact"("contactId", "categoryId");
CREATE INDEX IF NOT EXISTS "CategoryContact_userId_companyId_idx"
  ON "CategoryContact"("userId", "companyId");
CREATE INDEX IF NOT EXISTS "CategoryContact_accountId_idx"
  ON "CategoryContact"("accountId");

DO $$
BEGIN
  ALTER TABLE "CategoryContact"
    ADD CONSTRAINT "CategoryContact_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CategoryContact"
    ADD CONSTRAINT "CategoryContact_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CategoryContact"
    ADD CONSTRAINT "CategoryContact_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CategoryContact"
    ADD CONSTRAINT "CategoryContact_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CategoryContact"
    ADD CONSTRAINT "CategoryContact_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
