import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { canReadMarketplaceContact } from "../src/server/freight/contact-access";
import { redactMarketplaceContent, matchContactActions } from "../src/server/freight/contact-privacy";
import { redactPublicContactDetails } from "../src/server/freight/public-listing-summary";

async function main() {
  const originals = { memberships: prisma.companyUser.findMany, subscriptions: prisma.subscription.findMany };
  let members: Array<{ companyId: string }> = [];
  let subscriptions: unknown[] = [];
  let lastWhere: unknown;
  prisma.companyUser.findMany = (async (input: { where: unknown }) => { lastWhere = input.where; return members; }) as typeof prisma.companyUser.findMany;
  prisma.subscription.findMany = (async () => subscriptions) as typeof prisma.subscription.findMany;
  try {
    assert.equal(await canReadMarketplaceContact(null), false);
    assert.equal(await canReadMarketplaceContact("expired-user"), false);
    members = [{ companyId: "company" }];
    assert.equal(await canReadMarketplaceContact("member"), false);
    const now = Date.now();
    const subscription = { status: "TRIALING", startsAt: new Date(now - 86400000), endsAt: new Date(now + 86400000), plan: { slug: "trial" } };
    subscriptions = [subscription];
    assert.equal(await canReadMarketplaceContact("member"), true, "A registered, active trial enables contacts");
    subscriptions = [{ ...subscription, endsAt: new Date(now - 1000) }];
    assert.equal(await canReadMarketplaceContact("member"), false, "Expired trial cannot read contacts");
    subscriptions = [{ ...subscription, status: "ACTIVE", plan: { slug: "professional" } }];
    assert.equal(await canReadMarketplaceContact("member"), true, "Manual or paid active Pro uses the same entitlement");
    subscriptions = [{ ...subscription, status: "CANCELLED" }];
    assert.equal(await canReadMarketplaceContact("member"), false);
    assert.deepEqual(lastWhere, { userId: "member", status: "ACTIVE", lifecycleState: { in: ["INDEPENDENT_OWNER", "ACTIVE_SHARED_MEMBER"] }, user: { status: "ACTIVE" } });
    for (const raw of ["Ara +90 555 111 22 33", "05551112233 05554445566", "https://wa.me/905551112233?text=selam", "www.example.com/contact", "tel:+905551112233", "mail@test.example", "٠٥٥٥١١١٢٢٣٣", "۰۵۵۵۱۱۱۲۲۳۳", "05\u200b551112233", "@business_contact", "Telefon:05551112233!"]) {
      const safe = redactPublicContactDetails(raw) ?? "";
      assert(!safe.includes("1112233") && !safe.includes("wa.me") && !safe.includes("test.example") && !safe.includes("business_contact") && !safe.includes("example.com") && !/[٠-٩۰-۹]/u.test(safe), raw);
    }
    assert.equal(redactPublicContactDetails("Adana → Seyhan 20 ton, 13.60 m, 2026-09-05"), "Adana → Seyhan 20 ton, 13.60 m, 2026-09-05");
    const listing = { id: "listing-123456789", title: "Adana → Adana 05551112233", description: "Ulaşım https://wa.me/905551112233", contactPhone: "+905551112233", canCall: true, canOpenWhatsApp: true, nested: { email: "mail@test.example", explanation: "05551112233" } };
    const safe = redactMarketplaceContent(listing);
    assert.equal(safe.id, listing.id); assert.equal(safe.contactPhone, null); assert.equal(safe.canCall, false); assert.equal(safe.nested.email, null);
    assert(!JSON.stringify(safe).includes("5551112233"));
    const paid = redactMarketplaceContent(listing, true);
    assert.equal(paid.contactPhone, listing.contactPhone); assert(!paid.title.includes("5551112233")); assert(!paid.description.includes("wa.me"));
    assert.equal(matchContactActions(listing, false).canOpenWhatsApp, false);
    assert.match(matchContactActions({ ...listing, kind: "VEHICLE" }, true).whatsappPrefilledMessage ?? "", /Adana → Adana.*araç ilanınız için yazıyorum/u);
    console.log("Contact entitlement, expired trial, nested payload and obfuscated contact redaction checks passed.");
  } finally { prisma.companyUser.findMany = originals.memberships; prisma.subscription.findMany = originals.subscriptions; await prisma.$disconnect(); }
}
void main();
