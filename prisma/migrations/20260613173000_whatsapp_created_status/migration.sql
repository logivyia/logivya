ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'CREATED';

UPDATE "WhatsAppAccount"
SET "status" = 'FAILED',
    "lastError" = 'Baglanti denemesinin suresi doldu. Lutfen tekrar deneyin.',
    "qrCode" = NULL,
    "qrExpiresAt" = NULL,
    "pairingCode" = NULL,
    "pairingCodeExpiresAt" = NULL
WHERE "status" IN ('PENDING_QR', 'PENDING_PAIRING', 'QR_READY', 'PAIRING_CODE_READY', 'CONNECTING')
  AND "updatedAt" < NOW() - INTERVAL '10 minutes';

UPDATE "WhatsAppAccount"
SET "status" = 'CREATED'
WHERE "status" IN ('NEW', 'QR_READY', 'ERROR');
