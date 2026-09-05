import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { countryRegistry } from "../src/lib/international/country-registry";
import { deriveCompanyEntitlements } from "../src/server/billing/company-entitlements";
import {
  OUTBOUND_TEXT_LIMIT,
  renderLocalizedAttribution,
  STARTER_ATTRIBUTION_VERSION,
} from "../src/server/messages/outbound-composer";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const fakePlan = (slug: string) => ({ slug } as NonNullable<Parameters<typeof deriveCompanyEntitlements>[0]>);

const expectedTranslations: Record<string, string> = {
  uz: "Bu xabar logivya.com orqali yuborildi.",
  ar: "تم إرسال هذه الرسالة عبر logivya.com.",
  tr: "Bu mesaj logivya.com üzerinden gönderilmiştir.",
  en: "This message was sent via logivya.com.",
  ro: "Acest mesaj a fost trimis prin logivya.com.",
  ru: "Это сообщение отправлено через logivya.com.",
  az: "Bu mesaj logivya.com vasitəsilə göndərilib.",
  tk: "Bu habar logivya.com arkaly ugradyldy.",
  de: "Diese Nachricht wurde über logivya.com gesendet.",
  bg: "Това съобщение е изпратено чрез logivya.com.",
  el: "Αυτό το μήνυμα στάλθηκε μέσω του logivya.com.",
  sr: "Ova poruka je poslata putem logivya.com.",
};

assert.equal(new Set(countryRegistry.map(country => country.localeId)).size, Object.keys(expectedTranslations).length);
for (const country of countryRegistry) {
  assert.equal(country.attribution, expectedTranslations[country.localeId]);
  const rendered = renderLocalizedAttribution({ originalText: "Duyuru", locale: country.localeId, required: true });
  assert.equal(rendered.content, `Duyuru\n\n${country.attribution}`);
  assert.equal(rendered.attributionLocale, country.localeId);
  assert.equal(rendered.attributionVersion, STARTER_ATTRIBUTION_VERSION);
}

const localeVariants: Record<string, string> = {
  "uz-Latn-UZ": "uz",
  "tr-TR": "tr",
  "en-US": "en",
  "en-GB": "en",
  "ro-RO": "ro",
  "ru-RU": "ru",
  "az-AZ": "az",
  "tk-TM": "tk",
  "de-DE": "de",
  "bg-BG": "bg",
  "el-GR": "el",
  "sr-Latn-RS": "sr",
};
for (const [variant, canonical] of Object.entries(localeVariants)) {
  const rendered = renderLocalizedAttribution({ originalText: "Locale", locale: variant, required: true });
  assert.equal(rendered.attributionLocale, canonical);
  assert.equal(rendered.content, `Locale\n\n${expectedTranslations[canonical]}`);
}

const TurkishFooter = expectedTranslations.tr;
const userAuthoredFooterSentence = `Merhaba 👋\nİkinci satır\n\n${TurkishFooter}`;
assert.equal(
  renderLocalizedAttribution({ originalText: userAuthoredFooterSentence, locale: "tr", required: true }).content,
  `${userAuthoredFooterSentence}\n\n${TurkishFooter}`,
  "User-authored content must never be removed based on text matching alone.",
);
assert.equal(
  renderLocalizedAttribution({
    originalText: `Merhaba\n\n${TurkishFooter}\r\n\r\n${TurkishFooter}`,
    locale: "tr",
    required: true,
    legacyCombinedPayload: true,
  }).content,
  `Merhaba\n\n${TurkishFooter}`,
  "Explicitly marked legacy combined payloads must be normalized once.",
);
assert.equal(
  renderLocalizedAttribution({
    originalText: TurkishFooter,
    locale: "tr",
    required: true,
    legacyCombinedPayload: true,
  }).content,
  TurkishFooter,
  "A legacy footer-only payload must not gain leading blank lines.",
);
assert.equal(
  renderLocalizedAttribution({ originalText: "Mesaj", locale: "unsupported", required: true }).content,
  `Mesaj\n\n${expectedTranslations.en}`,
);
assert.equal(
  renderLocalizedAttribution({ originalText: "Mesaj\n\n", locale: "tr", required: true }).content,
  `Mesaj\n\n${TurkishFooter}`,
  "Rendered messages must contain exactly one blank line before the footer.",
);
assert.equal(renderLocalizedAttribution({ originalText: "e\u0301moji 🚀", locale: "tr", required: false }).content, "émoji 🚀");

const maxOriginal = "x".repeat(OUTBOUND_TEXT_LIMIT - TurkishFooter.length - 2);
assert.equal(renderLocalizedAttribution({ originalText: maxOriginal, locale: "tr", required: true }).content.length, OUTBOUND_TEXT_LIMIT);
assert.throws(
  () => renderLocalizedAttribution({ originalText: `${maxOriginal}x`, locale: "tr", required: true }),
  /MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED/,
);

assert.equal(deriveCompanyEntitlements(fakePlan("trial"), true).messageBrandingRequired, true);
assert.equal(deriveCompanyEntitlements(fakePlan("starter"), true).messageBrandingRequired, true);
assert.equal(deriveCompanyEntitlements(fakePlan("STARTER"), true).messageBrandingRequired, true);
assert.equal(deriveCompanyEntitlements(fakePlan("professional"), true).messageBrandingRequired, false);
assert.equal(deriveCompanyEntitlements(fakePlan("enterprise"), true).messageBrandingRequired, false);
assert.equal(deriveCompanyEntitlements(fakePlan("starter"), false).messageBrandingRequired, false);

const workerSource = read("src/worker/index.ts");
const composerSource = read("src/server/messages/outbound-composer.ts");
const campaignsRoute = read("src/app/api/campaigns/route.ts");
const mobileMessages = read("src/server/mobile/messages.ts");
assert(workerSource.includes("composeOutboundMessage({"), "Worker must compose every outbound recipient at delivery time.");
assert(workerSource.includes("existingRendering:"), "Retries must reuse stable rendered payloads.");
assert(workerSource.includes('const partContent = partIndex === 0 ? deliveryPolicy.content : ""'), "The first WhatsApp text or attachment must use canonical rendered content exactly once.");
assert(workerSource.includes("content,"), "Both contact and group send adapters must receive the stable per-part content.");
assert(!workerSource.includes("applyAdvertisingDeliveryPolicy"), "Worker must not use the legacy branding helper.");
assert(workerSource.includes('logger.info("message.outbound_payload.prepared"'), "Worker must log privacy-safe final payload evidence.");
assert(workerSource.includes("finalPayloadHash: deliveryPolicy.finalPayloadHash"), "Worker logs must identify the exact final payload without storing its body.");
assert(campaignsRoute.includes("createMessageDeliveryCampaign"), "Web send paths must converge on the canonical campaign pipeline.");
assert(mobileMessages.includes("createMessageDeliveryCampaign"), "Mobile send paths must converge on the canonical campaign pipeline.");
assert(
  composerSource.includes("stable.effectivePlanCode === effectivePlanCode"),
  "Retries may reuse rendered content only while the effective plan is unchanged.",
);
assert(
  composerSource.includes("message.attribution.rendering_invalidated_by_plan_change"),
  "A plan transition must invalidate stale branding before delivery.",
);
assert(
  composerSource.includes("getEffectiveMessagingPlan(input.companyId, now)"),
  "Scheduled and recurring deliveries must resolve the effective plan at execution time.",
);

console.log("Trial/Starter localized attribution, plan transitions, length safety and worker enforcement contracts passed.");
