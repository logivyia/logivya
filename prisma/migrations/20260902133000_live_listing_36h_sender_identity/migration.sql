ALTER TABLE "WhatsAppInboundMessage"
  ADD COLUMN IF NOT EXISTS "senderPhoneEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "senderDisplayNameEncrypted" TEXT;

UPDATE "FreightListing" AS listing
SET "expiresAt" = inbound."sourceMessageTimestamp" + INTERVAL '36 hours'
FROM "WhatsAppListingExtraction" AS extraction
JOIN "WhatsAppInboundMessage" AS inbound ON inbound."id" = extraction."inboundMessageId"
WHERE listing."sourceExtractionId" = extraction."id"
  AND listing."source" = 'WHATSAPP'
  AND listing."status" = 'ACTIVE';

UPDATE "VehicleListing" AS listing
SET "expiresAt" = inbound."sourceMessageTimestamp" + INTERVAL '36 hours'
FROM "WhatsAppListingExtraction" AS extraction
JOIN "WhatsAppInboundMessage" AS inbound ON inbound."id" = extraction."inboundMessageId"
WHERE listing."sourceExtractionId" = extraction."id"
  AND listing."source" = 'WHATSAPP'
  AND listing."status" = 'ACTIVE';

UPDATE "DriverListing" AS listing
SET "expiresAt" = inbound."sourceMessageTimestamp" + INTERVAL '36 hours'
FROM "WhatsAppListingExtraction" AS extraction
JOIN "WhatsAppInboundMessage" AS inbound ON inbound."id" = extraction."inboundMessageId"
WHERE listing."sourceExtractionId" = extraction."id"
  AND listing."source" = 'WHATSAPP'
  AND listing."status" = 'ACTIVE';
