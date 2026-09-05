-- PostgreSQL truncates identifiers longer than 63 bytes. Align the four
-- affected index names with Prisma's deterministic shortened identifiers so
-- production schema drift checks remain clean.
ALTER INDEX "MarketplaceDemandRequest_originLocationId_destinationLocationId"
  RENAME TO "MarketplaceDemandRequest_originLocationId_destinationLocati_idx";

ALTER INDEX "WhatsAppInboundAttachment_inboundMessageId_providerAttachmentId"
  RENAME TO "WhatsAppInboundAttachment_inboundMessageId_providerAttachme_key";

ALTER INDEX "WhatsAppListingExtraction_listingType_reviewStatus_publishedAt_"
  RENAME TO "WhatsAppListingExtraction_listingType_reviewStatus_publishe_idx";

ALTER INDEX "WhatsAppListingExtraction_publishedListingKind_publishedListing"
  RENAME TO "WhatsAppListingExtraction_publishedListingKind_publishedLis_idx";
