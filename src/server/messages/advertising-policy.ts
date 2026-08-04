export type AdvertisingDeliveryPolicy = {
  content: string;
  attributionApplied: boolean;
  attributionConfigured: boolean;
};

export const LOGIVYA_MESSAGE_ATTRIBUTION_TEXT = "Bu mesaj logivya.com üzerinden gönderilmiştir.";

export function applyAdvertisingDeliveryPolicy(content: string, advertisingEnabled: boolean): AdvertisingDeliveryPolicy {
  const attribution = LOGIVYA_MESSAGE_ATTRIBUTION_TEXT;
  if (!advertisingEnabled) return { content, attributionApplied: false, attributionConfigured: true };
  if (content.trimEnd().endsWith(attribution)) return { content, attributionApplied: false, attributionConfigured: true };
  return { content: `${content.trimEnd()}\n\n${attribution}`, attributionApplied: true, attributionConfigured: true };
}
