import { renderLocalizedAttribution } from "@/server/messages/outbound-composer";

export type AdvertisingDeliveryPolicy = {
  content: string;
  attributionApplied: boolean;
  attributionConfigured: boolean;
};

/** @deprecated Use composeOutboundMessage for authoritative delivery-time composition. */
export function applyAdvertisingDeliveryPolicy(
  content: string,
  messageBrandingRequired: boolean,
  locale = "en",
): AdvertisingDeliveryPolicy {
  const rendered = renderLocalizedAttribution({
    originalText: content,
    locale,
    required: messageBrandingRequired,
    legacyCombinedPayload: true,
  });
  return {
    content: rendered.content,
    attributionApplied: rendered.attributionApplied,
    attributionConfigured: messageBrandingRequired,
  };
}
