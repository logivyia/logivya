import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const files = [
  "src/server/freight/web-marketplace.ts",
  "src/server/freight/demand-context.ts",
  "src/app/api/marketplace/listings/live/route.ts",
  "src/app/api/marketplace/listings/[kind]/[id]/route.ts",
  "src/app/api/marketplace/requests/route.ts",
  "src/app/api/marketplace/notifications/route.ts",
  "src/components/marketplace/live-listing-card.tsx",
  "src/components/marketplace/live-marketplace-page.tsx",
  "src/components/marketplace/listing-detail-page.tsx",
  "src/components/marketplace/saved-demands-page.tsx",
  "src/app/(platform)/marketplace/page.tsx",
  "src/app/(platform)/marketplace/requests/page.tsx",
  "src/app/(platform)/marketplace/listings/[kind]/[id]/page.tsx",
];

for (const file of files) assert(existsSync(resolve(root, file)), `${file} must exist`);

function read(file: string) {
  return readFileSync(resolve(root, file), "utf8");
}

const adapter = read("src/server/freight/web-marketplace.ts");
assert(adapter.includes("requireApiSession"), "Web marketplace must use the authenticated web session");
assert(adapter.includes("resolveFreightMarketplaceAccess"), "Web marketplace must preserve the freight feature gate");
assert(adapter.includes("validateOwnedDemandContext"), "Demand-linked listing opens must validate ownership");
const demandContext = read("src/server/freight/demand-context.ts");
assert(demandContext.includes("marketplaceDemandRequest.findFirst"), "Demand-linked listing opens must validate demand ownership");
assert(demandContext.includes("marketplaceDemandMatch.findFirst"), "Demand-linked listing opens must validate the exact match");
assert(!adapter.includes("group.name"), "Unapproved WhatsApp group names must not be public advertiser fallbacks");
assert(adapter.includes("safePublicE164"), "Public contact actions must require a valid E.164 number");
assert(adapter.includes("https://wa.me/"), "WhatsApp actions must use the official compose URL");
assert(adapter.includes("tel:"), "Call actions must use tel links");
assert(adapter.includes("encodeURIComponent(prefilledMessage)"), "WhatsApp text must be URL encoded");
assert(!adapter.includes("item.match.score"), "Public live events must not expose internal match scores");
assert(!adapter.includes("item.match.reasons"), "Public live events must not expose internal match reasons");

const liveFeed = read("src/server/freight/live-feed.ts");
assert(!liveFeed.includes("score: match.score"), "The live feed must not serialize internal match scores");
assert(!liveFeed.includes("reasons: match.reasons"), "The live feed must not serialize internal match reasons");

const liveApi = read("src/app/api/marketplace/listings/live/route.ts");
assert(liveApi.includes("text/event-stream"), "The web feed must expose real-time SSE updates");
assert(liveApi.includes("serializeWebLiveEvents"), "The live feed must use the public allow-list serializer");
assert(liveApi.includes("private, no-store"), "Listing snapshots must not be shared-cacheable");

const detailApi = read("src/app/api/marketplace/listings/[kind]/[id]/route.ts");
assert(detailApi.includes("validateOwnedDemandContext"), "Detail API must validate requestId ownership and match context");
assert(detailApi.includes("serializeWebListingDetail"), "Detail API must strip internal listing diagnostics");

const notificationsApi = read("src/app/api/marketplace/notifications/route.ts");
assert(notificationsApi.includes("ownerUserId: context.user.id"), "Marketplace notifications must be scoped to the current user");
assert(notificationsApi.includes("companyId: context.company.id"), "Marketplace notifications must be tenant scoped");
assert(notificationsApi.includes("matchKeys"), "Notification links must resolve only verified demand/listing matches");

const card = read("src/components/marketplace/live-listing-card.tsx");
for (const field of ["publicAdvertiserName", "publicTitle", "vehicleDisplayName", "tonnageDisplay", "loadingDisplayName", "deliveryDisplayName"]) {
  assert(card.includes(field), `Live listing card must render ${field}`);
}
assert(card.includes("copy.detail"), "Live listing cards must expose a clear details action");
assert(!card.includes("trailerType"), "Live cards must not render raw trailer enums");

const detail = read("src/components/marketplace/listing-detail-page.tsx");
assert(detail.includes("listing.contact.telHref"), "Detail must render a separate call action");
assert(detail.includes("listing.contact.whatsappHref"), "Detail must render a separate WhatsApp action");
for (const diagnostic of ["groupHint", "primarySector", "classificationVersion", "sectorDetails"]) {
  assert(!detail.includes(diagnostic), `Normal web detail must not render ${diagnostic}`);
}

const requests = read("src/components/marketplace/saved-demands-page.tsx");
assert(requests.includes("/api/marketplace/requests"), "Saved demands must load and create through the web adapter");
assert(requests.includes("/api/marketplace/notifications"), "Saved-demand notifications must appear in the web app");
assert(requests.includes("notification.href"), "Saved-demand notifications must link to the exact validated listing");

console.log("Prompt 5 authenticated web marketplace contracts: PASS");
