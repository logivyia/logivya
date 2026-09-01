ALTER TABLE "WhatsAppAccount"
  ADD COLUMN IF NOT EXISTS "countryIso" TEXT,
  ADD COLUMN IF NOT EXISTS "messageLocale" TEXT,
  ADD COLUMN IF NOT EXISTS "connectionMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "pairedAt" TIMESTAMP(3);

ALTER TABLE "MessageRecipient"
  ADD COLUMN IF NOT EXISTS "renderedContent" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionApplied" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "attributionLocale" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "effectivePlanCode" TEXT,
  ADD COLUMN IF NOT EXISTS "renderedAt" TIMESTAMP(3);

UPDATE "WhatsAppAccount"
SET "phoneNumber" = '+' || "phoneNumber"
WHERE "phoneNumber" ~ '^[0-9]{7,15}$';

UPDATE "WhatsAppAccount"
SET
  "countryIso" = CASE
    WHEN "phoneNumber" LIKE '+90%' THEN 'TR'
    WHEN "phoneNumber" LIKE '+44%' THEN 'GB'
    WHEN "phoneNumber" LIKE '+40%' THEN 'RO'
    WHEN "phoneNumber" LIKE '+994%' THEN 'AZ'
    WHEN "phoneNumber" LIKE '+993%' THEN 'TM'
    WHEN "phoneNumber" LIKE '+49%' THEN 'DE'
    WHEN "phoneNumber" LIKE '+359%' THEN 'BG'
    WHEN "phoneNumber" LIKE '+30%' THEN 'GR'
    WHEN "phoneNumber" LIKE '+381%' THEN 'RS'
    ELSE "countryIso"
  END
WHERE "countryIso" IS NULL;

UPDATE "WhatsAppAccount"
SET "messageLocale" = CASE "countryIso"
  WHEN 'TR' THEN 'tr'
  WHEN 'GB' THEN 'en'
  WHEN 'RO' THEN 'ro'
  WHEN 'RU' THEN 'ru'
  WHEN 'AZ' THEN 'az'
  WHEN 'TM' THEN 'tk'
  WHEN 'DE' THEN 'de'
  WHEN 'BG' THEN 'bg'
  WHEN 'GR' THEN 'el'
  WHEN 'RS' THEN 'sr'
  ELSE "messageLocale"
END
WHERE "messageLocale" IS NULL AND "countryIso" IS NOT NULL;
