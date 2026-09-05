-- Persist the canonical product publication matrix so runtime availability is
-- explicit in production instead of depending only on source-code defaults.
INSERT INTO "ProductFeaturePublication" (
  "id", "key", "status", "platformStatus", "providerBlocked", "blockerCode", "note", "effectiveAt", "createdAt", "updatedAt"
) VALUES
  ('pf-whatsapp-accounts', 'WHATSAPP_ACCOUNTS', 'PUBLIC', '{"web":"PUBLIC","android":"PUBLIC","ios":"PUBLIC"}'::jsonb, false, NULL, 'Canonical WhatsApp account capability.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-telegram-accounts', 'TELEGRAM_ACCOUNTS', 'BETA', '{"web":"BETA","android":"BETA","ios":"BETA"}'::jsonb, false, NULL, 'Telegram account capability remains beta.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-facebook-pages', 'FACEBOOK_PAGES', 'INTERNAL', '{"web":"INTERNAL","android":"INTERNAL","ios":"INTERNAL"}'::jsonb, true, 'META_APP_REVIEW_PENDING', 'Keep internal until Meta configuration, permission review, and a designated Page smoke test pass.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-general-marketplace', 'GENERAL_MARKETPLACE', 'PUBLIC', '{"web":"PUBLIC","android":"PUBLIC","ios":"PUBLIC"}'::jsonb, false, NULL, 'General load, vehicle, and driver marketplace.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-live-listings', 'LIVE_LISTINGS', 'BETA', '{"web":"BETA","android":"BETA","ios":"BETA"}'::jsonb, false, NULL, 'Live listing feed is available as beta.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-saved-demands', 'SAVED_DEMANDS', 'PUBLIC', '{"web":"PUBLIC","android":"PUBLIC","ios":"PUBLIC"}'::jsonb, false, NULL, 'Saved marketplace demands.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-intelligent-matching', 'INTELLIGENT_MATCHING', 'BETA', '{"web":"BETA","android":"BETA","ios":"BETA"}'::jsonb, false, NULL, 'Intelligent matching is available as beta.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-home-moving', 'HOME_MOVING', 'BETA', '{"web":"BETA","android":"BETA","ios":"BETA"}'::jsonb, false, NULL, 'Home-moving vertical is available as beta.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-partial-load', 'PARTIAL_LOAD', 'BETA', '{"web":"BETA","android":"BETA","ios":"BETA"}'::jsonb, false, NULL, 'Partial-load vertical is available as beta.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-heavy-haul', 'HEAVY_HAUL', 'BETA', '{"web":"BETA","android":"BETA","ios":"BETA"}'::jsonb, false, NULL, 'Heavy-haul vertical is available as beta.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-image-sending', 'IMAGE_SENDING', 'PUBLIC', '{"web":"PUBLIC","android":"PUBLIC","ios":"PUBLIC"}'::jsonb, false, NULL, 'Image attachment sending with optional caption.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-document-sending', 'DOCUMENT_SENDING', 'PUBLIC', '{"web":"PUBLIC","android":"PUBLIC","ios":"PUBLIC"}'::jsonb, false, NULL, 'Document attachment sending with optional caption.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-video-sending', 'VIDEO_SENDING', 'PUBLIC', '{"web":"PUBLIC","android":"PUBLIC","ios":"PUBLIC"}'::jsonb, false, NULL, 'Video attachment sending with optional caption.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-whatsapp-listing-ingestion', 'WHATSAPP_LISTING_INGESTION', 'INTERNAL', '{"web":"INTERNAL","android":"INTERNAL","ios":"INTERNAL"}'::jsonb, false, NULL, 'Restricted to explicitly approved, tenant-owned source groups during rollout.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-telegram-listing-ingestion', 'TELEGRAM_LISTING_INGESTION', 'INTERNAL', '{"web":"INTERNAL","android":"INTERNAL","ios":"INTERNAL"}'::jsonb, false, NULL, 'Internal until provider and ingestion validation is complete.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf-social-publishing', 'SOCIAL_PUBLISHING', 'INTERNAL', '{"web":"INTERNAL","android":"INTERNAL","ios":"INTERNAL"}'::jsonb, true, 'META_APP_REVIEW_PENDING', 'Facebook publication remains internal pending Meta approval.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
