export type AdvertisingDeliveryPolicy = {
  content: string;
  attributionApplied: boolean;
  attributionConfigured: boolean;
};

export function applyAdvertisingDeliveryPolicy(content: string, advertisingEnabled: boolean): AdvertisingDeliveryPolicy {
  const attribution = process.env.MESSAGE_ADVERTISING_ATTRIBUTION_TEXT?.trim() ?? "";
  if (!advertisingEnabled) return { content, attributionApplied: false, attributionConfigured: Boolean(attribution) };
  if (!attribution) return { content, attributionApplied: false, attributionConfigured: false };
  if (content.trimEnd().endsWith(attribution)) return { content, attributionApplied: false, attributionConfigured: true };
  return { content: `${content.trimEnd()}\n\n${attribution}`, attributionApplied: true, attributionConfigured: true };
}
