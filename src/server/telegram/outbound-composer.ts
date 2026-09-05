import { createHash } from "node:crypto";

import { getCountryByLocale } from "@/lib/international/country-registry";
import {
  getEffectiveMessagingPlan,
  requiresMessageAttribution,
} from "@/server/billing/effective-messaging-plan";
import {
  renderLocalizedAttribution,
  type StableRenderedMessage,
} from "@/server/messages/outbound-composer";
import { logger } from "@/server/observability/logger";

export type StableTelegramRenderedMessage = StableRenderedMessage;

export type TelegramOutboundComposition = {
  content: string;
  finalBodyLength: number;
  finalPayloadHash: string;
  attributionApplied: boolean;
  attributionLocale: string | null;
  attributionVersion: string | null;
  effectivePlanCode: string;
  renderedAt: Date;
  reusedStableRendering: boolean;
};

export function renderTelegramDeliveryContent(input: {
  originalText: string;
  companyDefaultLanguage: string;
  senderLocale?: string | null;
  messageBrandingRequired: boolean;
}) {
  const companyLocale = getCountryByLocale(input.companyDefaultLanguage);
  const senderLocale = getCountryByLocale(input.senderLocale);
  const selected = companyLocale
    ? { locale: companyLocale.localeId, source: "company" as const, usedFallback: false }
    : senderLocale
      ? { locale: senderLocale.localeId, source: "sender" as const, usedFallback: false }
      : { locale: "en", source: "fallback" as const, usedFallback: true };
  const rendered = renderLocalizedAttribution({
    originalText: input.originalText,
    locale: selected.locale,
    required: input.messageBrandingRequired,
  });
  return { ...rendered, localeResolution: selected };
}

export async function composeTelegramOutboundMessage(input: {
  companyId: string;
  userId: string;
  telegramAccountId: string;
  deliveryId: string;
  originalText: string;
  companyDefaultLanguage: string;
  senderLocale?: string | null;
  existingRendering?: StableTelegramRenderedMessage | null;
  now?: Date;
}): Promise<TelegramOutboundComposition> {
  const now = input.now ?? new Date();
  const effectivePlan = await getEffectiveMessagingPlan(input.companyId, now);
  const planSlug = effectivePlan?.plan.slug.trim().toLowerCase() ?? "none";
  const effectivePlanCode = effectivePlan?.valid ? planSlug : `inactive:${planSlug}`;
  const stable = input.existingRendering;

  if (
    stable?.renderedContent
    && stable.renderedAt
    && stable.effectivePlanCode === effectivePlanCode
  ) {
    return {
      content: stable.renderedContent,
      finalBodyLength: stable.renderedContent.length,
      finalPayloadHash: createHash("sha256").update(stable.renderedContent, "utf8").digest("hex"),
      attributionApplied: stable.attributionApplied === true,
      attributionLocale: stable.attributionLocale,
      attributionVersion: stable.attributionVersion,
      effectivePlanCode,
      renderedAt: stable.renderedAt,
      reusedStableRendering: true,
    };
  }

  if (stable?.renderedContent && stable.renderedAt && stable.effectivePlanCode) {
    logger.info("telegram.attribution.rendering_invalidated_by_plan_change", {
      companyId: input.companyId,
      userId: input.userId,
      telegramAccountId: input.telegramAccountId,
      deliveryId: input.deliveryId,
      previousPlanCode: stable.effectivePlanCode,
      effectivePlanCode,
    });
  }

  const rendered = renderTelegramDeliveryContent({
    originalText: input.originalText,
    companyDefaultLanguage: input.companyDefaultLanguage,
    senderLocale: input.senderLocale,
    messageBrandingRequired: requiresMessageAttribution(effectivePlan),
  });
  const finalPayloadHash = createHash("sha256").update(rendered.content, "utf8").digest("hex");

  logger.info(rendered.attributionApplied ? "telegram.attribution.applied" : "telegram.attribution.skipped", {
    companyId: input.companyId,
    userId: input.userId,
    telegramAccountId: input.telegramAccountId,
    deliveryId: input.deliveryId,
    attributionLocale: rendered.attributionLocale,
    attributionVersion: rendered.attributionVersion,
    effectivePlanCode,
    localeResolutionSource: rendered.localeResolution.source,
    localeFallbackUsed: rendered.localeResolution.usedFallback,
    finalBodyLength: rendered.content.length,
    finalPayloadHash,
    transportAdapter: "telegram-tdlib",
  });

  return {
    content: rendered.content,
    finalBodyLength: rendered.content.length,
    finalPayloadHash,
    attributionApplied: rendered.attributionApplied,
    attributionLocale: rendered.attributionLocale,
    attributionVersion: rendered.attributionVersion,
    effectivePlanCode,
    renderedAt: now,
    reusedStableRendering: false,
  };
}
