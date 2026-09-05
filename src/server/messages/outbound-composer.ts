import { createHash } from "node:crypto";

import {
  countryRegistryVersion,
  getAllCanonicalAttributions,
  getCountryByIso,
  getCountryByLocale,
  inferCountryFromPhoneNumber,
} from "@/lib/international/country-registry";
import { getEffectiveMessagingPlan, requiresMessageAttribution } from "@/server/billing/effective-messaging-plan";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

export const OUTBOUND_TEXT_LIMIT = 4096;
export const STARTER_ATTRIBUTION_VERSION = `country-registry-v${countryRegistryVersion}`;

export type StableRenderedMessage = {
  renderedContent: string;
  attributionApplied: boolean | null;
  attributionLocale: string | null;
  attributionVersion: string | null;
  effectivePlanCode: string | null;
  renderedAt: Date | null;
};

export type OutboundComposition = {
  content: string;
  finalBodyLength: number;
  finalPayloadHash: string;
  attributionApplied: boolean;
  attributionLocale: string | null;
  attributionVersion: string | null;
  effectivePlanCode: string;
  renderedAt: Date;
  reusedStableRendering: boolean;
  entitlements: NonNullable<Awaited<ReturnType<typeof getEffectiveMessagingPlan>>>["entitlements"];
};

function stripCanonicalAttributionSuffixes(content: string) {
  let result = content.trimEnd().normalize("NFC");
  let stripped = false;
  let changed = true;

  while (changed) {
    changed = false;
    for (const attribution of getAllCanonicalAttributions()) {
      if (result === attribution) {
        result = "";
        stripped = true;
        changed = true;
        break;
      }
      if (!result.endsWith(attribution)) continue;

      const prefix = result.slice(0, -attribution.length);
      if (/\s+$/u.test(prefix)) {
        result = prefix.replace(/\s+$/u, "").trimEnd();
        stripped = true;
        changed = true;
        break;
      }
    }
  }

  return { content: result, stripped };
}

export function renderLocalizedAttribution(input: {
  originalText: string;
  locale: string;
  required: boolean;
  legacyCombinedPayload?: boolean;
}) {
  const originalText = input.originalText.normalize("NFC");
  const localeEntry = getCountryByLocale(input.locale) ?? getCountryByLocale("en")!;
  if (!input.required) {
    return {
      content: originalText,
      attributionApplied: false,
      attributionLocale: null,
      attributionVersion: null,
      duplicateCanonicalFooterRemoved: false,
    };
  }

  // Campaign content is the immutable user-authored body. Only legacy records
  // explicitly identified as combined payloads may have a suffix removed.
  const normalized = input.legacyCombinedPayload
    ? stripCanonicalAttributionSuffixes(originalText)
    : { content: originalText.trimEnd(), stripped: false };
  const content = normalized.content
    ? `${normalized.content}\n\n${localeEntry.attribution}`
    : localeEntry.attribution;
  if (content.length > OUTBOUND_TEXT_LIMIT) throw new Error("MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED");
  return {
    content,
    attributionApplied: true,
    attributionLocale: localeEntry.localeId,
    attributionVersion: STARTER_ATTRIBUTION_VERSION,
    duplicateCanonicalFooterRemoved: normalized.stripped,
  };
}

function resolveAttributionLocale(account: {
  messageLocale: string | null;
  countryIso: string | null;
  phoneNumber: string | null;
  company: { defaultLanguage: string };
  senderLocale: string | null;
}) {
  const candidates = [
    { source: "account_locale", entry: getCountryByLocale(account.messageLocale) },
    { source: "company", entry: getCountryByLocale(account.company.defaultLanguage) },
    { source: "sender", entry: getCountryByLocale(account.senderLocale) },
    { source: "account_country", entry: getCountryByIso(account.countryIso) },
    { source: "phone_country", entry: inferCountryFromPhoneNumber(account.phoneNumber) },
    { source: "fallback", entry: getCountryByLocale("en") },
  ];
  const selected = candidates.find((candidate) => candidate.entry);
  return {
    locale: selected?.entry?.localeId ?? "en",
    source: selected?.source ?? "fallback",
    usedFallback: !selected || selected.source === "fallback",
  };
}

export async function composeOutboundMessage(input: {
  companyId: string;
  userId: string;
  whatsappAccountId: string;
  originalText: string;
  messageType: "GROUP" | "CONTACT" | "CAPTION" | "API";
  recipientId?: string;
  transportAdapter?: string;
  existingRendering?: StableRenderedMessage | null;
  now?: Date;
}): Promise<OutboundComposition> {
  const now = input.now ?? new Date();
  const [effectivePlan, account, sender] = await Promise.all([
    getEffectiveMessagingPlan(input.companyId, now),
    prisma.whatsAppAccount.findFirst({
      where: {
        id: input.whatsappAccountId,
        companyId: input.companyId,
        archivedAt: null,
      },
      select: {
        id: true,
        messageLocale: true,
        countryIso: true,
        phoneNumber: true,
        company: { select: { defaultLanguage: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { locale: true },
    }),
  ]);

  if (!account) throw new Error("WHATSAPP_ACCOUNT_OWNERSHIP_MISMATCH");
  if (!effectivePlan?.valid || !effectivePlan.entitlements.messageSend) throw new Error("SUBSCRIPTION_LOCKED");
  const effectivePlanCode = effectivePlan.plan.slug.trim().toLowerCase();

  const stable = input.existingRendering;
  if (
    stable?.renderedContent
    && stable.renderedAt
    && stable.effectivePlanCode === effectivePlanCode
  ) {
    logger.info("message.attribution.rendering_reused", {
      companyId: input.companyId,
      userId: input.userId,
      whatsappAccountId: input.whatsappAccountId,
      recipientId: input.recipientId,
      messageType: input.messageType,
      attributionApplied: stable.attributionApplied === true,
      attributionLocale: stable.attributionLocale,
      attributionVersion: stable.attributionVersion,
      effectivePlanCode: stable.effectivePlanCode,
    });
    return {
      content: stable.renderedContent,
      finalBodyLength: stable.renderedContent.length,
      finalPayloadHash: createHash("sha256").update(stable.renderedContent, "utf8").digest("hex"),
      attributionApplied: stable.attributionApplied === true,
      attributionLocale: stable.attributionLocale,
      attributionVersion: stable.attributionVersion,
      effectivePlanCode: stable.effectivePlanCode,
      renderedAt: stable.renderedAt,
      reusedStableRendering: true,
      entitlements: effectivePlan.entitlements,
    };
  }
  if (stable?.renderedContent && stable.renderedAt && stable.effectivePlanCode) {
    logger.info("message.attribution.rendering_invalidated_by_plan_change", {
      companyId: input.companyId,
      userId: input.userId,
      whatsappAccountId: input.whatsappAccountId,
      recipientId: input.recipientId,
      messageType: input.messageType,
      previousPlanCode: stable.effectivePlanCode,
      effectivePlanCode,
    });
  }

  const localeResolution = resolveAttributionLocale({
    ...account,
    senderLocale: sender?.locale ?? null,
  });
  let rendered: ReturnType<typeof renderLocalizedAttribution>;
  try {
    rendered = renderLocalizedAttribution({
      originalText: input.originalText,
      locale: localeResolution.locale,
      required: requiresMessageAttribution(effectivePlan),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED") {
      logger.warn("message.attribution.length_exceeded", {
        companyId: input.companyId,
        userId: input.userId,
        whatsappAccountId: input.whatsappAccountId,
        recipientId: input.recipientId,
        messageType: input.messageType,
        originalLength: input.originalText.length,
        attributionLocale: localeResolution.locale,
      });
    }
    throw error;
  }
  if (localeResolution.usedFallback) {
    logger.warn("message.attribution.locale_fallback", {
      companyId: input.companyId,
      userId: input.userId,
      whatsappAccountId: input.whatsappAccountId,
      recipientId: input.recipientId,
      messageType: input.messageType,
      countryIso: account.countryIso,
      fallbackLocale: localeResolution.locale,
    });
  }
  if (rendered.duplicateCanonicalFooterRemoved) {
    logger.info("message.attribution.duplicate_prevented", {
      companyId: input.companyId,
      userId: input.userId,
      whatsappAccountId: input.whatsappAccountId,
      recipientId: input.recipientId,
      messageType: input.messageType,
      attributionLocale: rendered.attributionLocale,
    });
  }

  logger.info(rendered.attributionApplied ? "message.attribution.applied" : "message.attribution.skipped", {
    companyId: input.companyId,
    userId: input.userId,
    whatsappAccountId: input.whatsappAccountId,
    recipientId: input.recipientId,
    messageType: input.messageType,
    attributionLocale: rendered.attributionLocale,
    attributionVersion: rendered.attributionVersion,
    effectivePlanCode,
    localeResolutionSource: localeResolution.source,
    localeFallbackUsed: localeResolution.usedFallback,
    duplicateCanonicalFooterRemoved: rendered.duplicateCanonicalFooterRemoved,
    finalBodyLength: rendered.content.length,
    finalPayloadHash: createHash("sha256").update(rendered.content, "utf8").digest("hex"),
    transportAdapter: input.transportAdapter ?? "whatsapp-provider",
  });

  return {
    content: rendered.content,
    finalBodyLength: rendered.content.length,
    finalPayloadHash: createHash("sha256").update(rendered.content, "utf8").digest("hex"),
    attributionApplied: rendered.attributionApplied,
    attributionLocale: rendered.attributionLocale,
    attributionVersion: rendered.attributionVersion,
    effectivePlanCode,
    renderedAt: now,
    reusedStableRendering: false,
    entitlements: effectivePlan.entitlements,
  };
}
