import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Prisma } from "@prisma/client";

import { calculateMatch } from "../src/server/freight/demand-matching";
import { createDemandRequestSchema } from "../src/server/freight/demand-validation";
import {
  hasInvalidMarketplaceLinkIdentifier,
  normalizeMarketplaceLinkIdentifier,
  parseMarketplaceLinkIdentifier,
} from "../apps/mobile/src/navigation/marketplace-link-context";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const contains = (file: string, pattern: string | RegExp, message: string) => {
  const source = read(file);
  assert(pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern), message);
};

const baseRequest = {
  id: "request-1",
  kind: "LOAD" as const,
  title: "İstanbul Ankara tenteli yük",
  keywordsNormalized: ["parsiyel"],
  originNormalized: "istanbul",
  destinationNormalized: "ankara",
  locationNormalized: null,
  availableFrom: new Date("2099-08-24T00:00:00.000Z"),
  availableUntil: new Date("2099-08-26T00:00:00.000Z"),
  trailerType: "CURTAINSIDER" as const,
  minWeight: new Prisma.Decimal(10),
  maxWeight: new Prisma.Decimal(25),
  driverListingType: null,
  licenseClasses: [],
  employmentType: null,
  internationalRequired: false,
  adrRequired: false,
  ownerUserId: "request-owner",
  companyId: "request-company",
  expiresAt: new Date("2099-09-24T00:00:00.000Z"),
};

assert(createDemandRequestSchema.safeParse({
  kind: "LOAD",
  title: "İstanbul Ankara yük",
  origin: "İstanbul",
  destination: "Ankara",
  keywords: [],
  licenseClasses: [],
  internationalRequired: false,
  adrRequired: false,
  expiresInDays: 30,
}).success, "A targeted load request must pass validation");
assert(!createDemandRequestSchema.safeParse({
  kind: "LOAD",
  title: "Kriteri olmayan yük",
  keywords: [],
  licenseClasses: [],
  internationalRequired: false,
  adrRequired: false,
  expiresInDays: 30,
}).success, "A request without matching criteria must be rejected");
assert(!createDemandRequestSchema.safeParse({
  kind: "DRIVER",
  title: "Şoför talebi",
  origin: "İstanbul",
  keywords: [],
  licenseClasses: ["CE"],
  internationalRequired: false,
  adrRequired: false,
  expiresInDays: 30,
}).success, "Fields from another request kind must be rejected");

const matchingLoad = {
  kind: "LOAD" as const,
  id: "load-1",
  ownerUserId: "listing-owner",
  searchText: "istanbul ankara parsiyel curtainsider",
  originNormalized: "istanbul avrupa",
  destinationNormalized: "ankara sincank",
  dateFrom: new Date("2099-08-25T00:00:00.000Z"),
  dateUntil: new Date("2099-08-25T00:00:00.000Z"),
  trailerType: "CURTAINSIDER" as const,
  weight: 20,
};
const loadMatch = calculateMatch(baseRequest, matchingLoad);
assert(loadMatch && loadMatch.score >= 90, "A route, date, trailer, weight and keyword match must score highly");
assert.equal(calculateMatch(baseRequest, { ...matchingLoad, destinationNormalized: "izmir" }), null, "A wrong destination must not match");
assert.equal(calculateMatch(baseRequest, { ...matchingLoad, weight: 30 }), null, "A load outside the requested weight range must not match");

const vehicleRequest = {
  ...baseRequest,
  id: "request-vehicle",
  kind: "VEHICLE" as const,
  keywordsNormalized: [],
  internationalRequired: true,
  adrRequired: true,
};
const matchingVehicle = {
  ...matchingLoad,
  id: "vehicle-1",
  kind: "VEHICLE" as const,
  international: true,
  adr: true,
};
assert(calculateMatch(vehicleRequest, matchingVehicle), "An international ADR-capable vehicle must match the corresponding request");
assert.equal(calculateMatch(vehicleRequest, { ...matchingVehicle, adr: false }), null, "A vehicle without required ADR suitability must not match");

const driverRequest = {
  ...baseRequest,
  id: "request-driver",
  kind: "DRIVER" as const,
  keywordsNormalized: [],
  originNormalized: null,
  destinationNormalized: null,
  locationNormalized: "istanbul",
  trailerType: null,
  minWeight: null,
  maxWeight: null,
  driverListingType: "DRIVER_AVAILABLE" as const,
  licenseClasses: ["CE"],
  employmentType: "FULL_TIME" as const,
  internationalRequired: true,
  adrRequired: true,
};
const matchingDriver = {
  kind: "DRIVER" as const,
  id: "driver-1",
  ownerUserId: "listing-owner",
  searchText: "uluslararası ce şoför istanbul",
  locationNormalized: "istanbul avrupa",
  dateFrom: new Date("2099-08-24T00:00:00.000Z"),
  dateUntil: null,
  driverListingType: "DRIVER_AVAILABLE" as const,
  licenseClasses: ["C", "CE"],
  employmentType: "FULL_TIME" as const,
  international: true,
  adr: true,
};
assert(calculateMatch(driverRequest, matchingDriver), "A driver satisfying every required qualification must match");
assert.equal(calculateMatch(driverRequest, { ...matchingDriver, licenseClasses: ["C"] }), null, "A driver without the required licence class must not match");

assert.equal(normalizeMarketplaceLinkIdentifier(" request-1 "), "request-1", "Mobile demand context identifiers must be normalized before use");
assert.equal(normalizeMarketplaceLinkIdentifier("x".repeat(101)), null, "Oversized demand context identifiers must fail closed");
assert.equal(parseMarketplaceLinkIdentifier("x".repeat(101)), "", "Invalid deep-link identifiers must not reach listing APIs");
assert.equal(hasInvalidMarketplaceLinkIdentifier(undefined), false, "A listing deep link may omit saved-demand context");
assert.equal(hasInvalidMarketplaceLinkIdentifier(""), true, "An explicitly empty saved-demand context must be rejected");

contains("prisma/schema.prisma", "model MarketplaceDemandRequest", "Demand requests require a dedicated model");
contains("prisma/schema.prisma", "model MarketplaceDemandMatch", "Matches require a durable model");
contains("prisma/schema.prisma", "@@unique([requestId, listingKind, listingId])", "A listing may notify each request only once");
contains("src/server/freight/demand-matching.ts", "marketplace-demand-match:${match.id}", "Notifications require deterministic idempotency keys");
contains("src/server/freight/demand-matching.ts", "readCanonicalListingSummary", "Match notifications must use the canonical public listing summary");
contains("src/server/freight/demand-matching.ts", "listingSummary,", "Match notification payloads must retain the canonical listing summary");
contains("src/server/freight/demand-matching.ts", "ownerUserId === candidate.ownerUserId", "Own listings must not trigger matches");
contains("src/server/freight/demand-matching.ts", "notifiedAt: null", "Failed notification creation must remain retryable");
contains("scripts/notification-worker.ts", "processPendingMarketplaceMatchNotifications", "The worker must recover pending match notifications");
contains("src/server/notifications/service.ts", "body: input.message", "Device pushes must display the matching message body");

for (const route of [
  "src/app/api/mobile/freight/listings/route.ts",
  "src/app/api/mobile/freight/vehicle-listings/route.ts",
  "src/app/api/mobile/freight/driver-listings/route.ts",
]) {
  contains(route, "enqueueListingMatchingJobs", `${route} must durably enqueue listing matching`);
  assert.equal(read(route).includes("matchListingAgainstDemandRequests"), false, `${route} must not synchronously scan demands`);
}
contains("src/server/freight/smart-matching.ts", "listing-v1", "Listing-triggered matching jobs require a stable idempotency key");
contains("src/server/freight/smart-matching.ts", "matchDemandRequestAgainstListing", "The worker must process exact durable demand/listing jobs");

for (const route of [
  "src/app/api/mobile/freight/requests/route.ts",
  "src/app/api/mobile/freight/requests/[id]/route.ts",
  "src/app/api/mobile/freight/requests/[id]/matches/route.ts",
]) contains(route, "requireFreightMarketplaceAccess", `${route} must enforce marketplace access`);

const detailRoutes: Array<[string, "LOAD" | "VEHICLE" | "DRIVER"]> = [
  ["src/app/api/mobile/freight/listings/[id]/route.ts", "LOAD"],
  ["src/app/api/mobile/freight/vehicle-listings/[id]/route.ts", "VEHICLE"],
  ["src/app/api/mobile/freight/driver-listings/[id]/route.ts", "DRIVER"],
];
for (const [route, kind] of detailRoutes) {
  contains(route, "demandContextIdFromRequest(request)", `${route} must parse saved-demand context from the deep-link query`);
  contains(route, new RegExp(`validateOwnedDemandContext\\([\\s\\S]*?"${kind}"`, "u"), `${route} must validate demand ownership and the exact ${kind} match`);
  contains(route, "requestId });", `${route} must return only the validated demand context to mobile`);
}
contains("src/server/freight/demand-context.ts", "ownerUserId, companyId", "Demand context validation must enforce user and tenant ownership");
contains("src/server/freight/demand-context.ts", "requestId, listingKind, listingId", "Demand context validation must bind the exact listing match");
contains("src/server/freight/demand-context.ts", 'status: { not: "DISMISSED" }', "Dismissed matches must not authorize a contextual listing deep link");

const mobileNavigation = read("apps/mobile/src/types/navigation.ts");
for (const route of ["FreightDetails", "VehicleDetails", "DriverDetails"]) {
  assert(new RegExp(`${route}: \\{ listingId: string; requestId\\?: string \\}`, "u").test(mobileNavigation), `${route} must preserve optional saved-demand context`);
}
const mobileLinking = read("apps/mobile/src/navigation/linking.ts");
assert.equal((mobileLinking.match(/requestId: parseMarketplaceLinkIdentifier/gu) ?? []).length, 3, "All three mobile listing deep links must parse requestId");
const mobileClient = read("apps/mobile/src/api/mobileFreight.ts");
assert.equal((mobileClient.match(/queryString\(\{ requestId \}\)/gu) ?? []).length, 3, "All three mobile detail requests must forward saved-demand context to the backend");
for (const screen of [
  "apps/mobile/src/screens/app/freight-details-screen.tsx",
  "apps/mobile/src/screens/app/vehicle-marketplace-screens.tsx",
  "apps/mobile/src/screens/app/driver-marketplace-screens.tsx",
]) {
  contains(screen, "DemandContextBanner", `${screen} must surface validated saved-demand context`);
  contains(screen, "validatedRequestId", `${screen} must use backend-validated context for navigation`);
}
contains("apps/mobile/src/screens/app/demand-request-screens.tsx", "requestId: route.params.requestId", "Opening an internal match from the demand workspace must preserve requestId");

console.log("Marketplace demand matching contracts: PASS");
