-- PostgreSQL truncated the original 66-byte index identifier to 63 bytes.
-- Rename it to Prisma's canonical 63-byte identifier without rebuilding the index.
ALTER INDEX "NotificationTemplate_scopeKey_eventType_channel_locale_version_"
RENAME TO "NotificationTemplate_scopeKey_eventType_channel_locale_vers_key";
