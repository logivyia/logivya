import { buildWhatsAppReferralMessage, redactPublicContactDetails } from "./public-listing-summary";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/min/metadata";

const contactFields = new Set(["contactPhone", "contactType", "phone", "email", "whatsappUrl", "whatsappPrefilledMessage", "telegramHref"]);
const identifierFields = new Set(["id", "listingId", "requestId", "companyId", "ownerUserId", "cursor", "duplicateKey"]);

/** Public descriptions stay contact-free even for subscribers; contact actions
 * use only the separately authorized phone field. Never return raw message data.
 */
export function redactMarketplaceContent<T>(value: T, contactAllowed = false): T {
  function clean(item: unknown, key = ""): unknown {
    if (contactFields.has(key)) return contactAllowed ? item : null;
    if (key === "canCall" || key === "canOpenWhatsApp" || key === "canOpenTelegram") return contactAllowed && Boolean(item);
    if (typeof item === "string") return identifierFields.has(key) ? item : redactPublicContactDetails(item);
    if (Array.isArray(item)) return item.map((part) => clean(part));
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([name, part]) => [name, clean(part, name)]));
    return item;
  }
  return clean(value) as T;
}

export function matchContactActions(listing: { contactPhone?: unknown; title?: unknown; detail?: unknown; kind?: unknown }, contactAllowed: boolean, defaultCountry = "TR") {
  const rawPhone = contactAllowed && typeof listing.contactPhone === "string" ? listing.contactPhone : null;
  const parsed = rawPhone && !rawPhone.startsWith("@") ? parsePhoneNumberFromString(rawPhone, defaultCountry as CountryCode, phoneMetadata) : null;
  const phone = parsed?.isValid() ? parsed.number : rawPhone?.startsWith("@") ? rawPhone : null;
  const callable = Boolean(parsed?.isValid());
  const kind = listing.kind === "VEHICLE" || listing.kind === "DRIVER" ? listing.kind : "LOAD";
  const summary = redactPublicContactDetails([listing.title, listing.detail].filter((value) => typeof value === "string").join(", ")) ?? "İlan";
  return {
    contactPhone: phone,
    telegramHref: phone && /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(phone) ? `https://t.me/${phone.slice(1)}` : null,
    canCall: callable,
    canOpenWhatsApp: callable,
    contactAccess: contactAllowed ? "ALLOWED" : "SUBSCRIPTION_REQUIRED",
    whatsappPrefilledMessage: callable ? buildWhatsAppReferralMessage({ kind, listingSummary: summary }) : null,
  };
}
