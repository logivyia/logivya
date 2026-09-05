import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { adminAllowsInternalFreight, flagAllowsUser } from "../src/server/freight/access-policy";
import { FREIGHT_INTERNAL_PERMISSION, FREIGHT_PUBLIC_FLAG } from "../src/server/freight/constants";
import { createFreightListingSchema, freightSearchSchema, updateFreightListingSchema } from "../src/server/freight/validation";
import { createDriverListingSchema, createVehicleListingSchema, driverSearchSchema, updateDriverListingSchema, updateVehicleListingSchema, vehicleSearchSchema } from "../src/server/freight/marketplace-validation";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const contains = (file: string, pattern: string | RegExp, message: string) => {
  const source = read(file);
  assert(pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern), message);
};

const validListing = {
  origin: "İstanbul",
  destination: "Ankara",
  loadingDate: "2099-08-24",
  weight: 20,
  trailerType: "CURTAINSIDER",
  vehicleCount: 1,
  priceAmount: 42_000,
  currency: "TRY",
  containerStatus: "NONE",
  contactPhone: "+905551112233",
};

assert(createFreightListingSchema.safeParse(validListing).success, "Valid freight listing must pass validation");
assert(!createFreightListingSchema.safeParse({ ...validListing, weight: 0 }).success, "Zero weight must be rejected");
assert(!createFreightListingSchema.safeParse({ ...validListing, priceAmount: 10, currency: null }).success, "Price requires currency");
assert(!createFreightListingSchema.safeParse({ ...validListing, unexpected: true }).success, "Unknown create fields must be rejected");
assert(updateFreightListingSchema.safeParse({ description: "Güncellenmiş açıklama" }).success, "Eligible listing fields must support partial updates");
assert(!updateFreightListingSchema.safeParse({}).success, "Empty listing updates must be rejected");
assert(!freightSearchSchema.safeParse({ minWeight: 30, maxWeight: 10 }).success, "Invalid weight range must be rejected");
assert(!freightSearchSchema.safeParse({ limit: 51 }).success, "Search page size must be bounded");

const validVehicle = {
  origin: "İstanbul",
  destination: "Ankara",
  availableFrom: "2099-08-24",
  availableUntil: "2099-08-25",
  trailerType: "CURTAINSIDER",
  capacityWeight: 24,
  vehicleCount: 1,
  internationalTransport: true,
  adrSuitable: false,
  priceAmount: 25_000,
  currency: "TRY",
  contactPhone: "+905551112233",
};
assert(createVehicleListingSchema.safeParse(validVehicle).success, "Valid vehicle listing must pass validation");
assert(!createVehicleListingSchema.safeParse({ ...validVehicle, availableUntil: "2099-08-20" }).success, "Vehicle end date before start must fail");
assert.deepEqual(updateVehicleListingSchema.parse({ description: "Yeni açıklama" }), { description: "Yeni açıklama" }, "Partial vehicle update must not reset boolean capabilities");
assert(!vehicleSearchSchema.safeParse({ internationalTransport: "invalid" }).success, "Vehicle boolean filters must be strict");

const validDriver = {
  listingType: "DRIVER_WANTED",
  title: "Uluslararası CE şoför aranıyor",
  location: "İstanbul",
  availableFrom: "2099-08-24",
  licenseClasses: ["CE"],
  experienceYears: 5,
  employmentType: "FULL_TIME",
  internationalExperience: true,
  adrCertificate: false,
  srcCertificate: true,
  psychotechnicalCertificate: true,
  contactPhone: "+905551112233",
};
assert(createDriverListingSchema.safeParse(validDriver).success, "Valid driver listing must pass validation");
assert(!createDriverListingSchema.safeParse({ ...validDriver, licenseClasses: [] }).success, "Driver listing requires a licence class");
assert.deepEqual(updateDriverListingSchema.parse({ description: "Yeni açıklama" }), { description: "Yeni açıklama" }, "Partial driver update must not reset certificate flags");
assert(!driverSearchSchema.safeParse({ limit: 51 }).success, "Driver search page size must be bounded");

assert.equal(flagAllowsUser(undefined, "user-1"), false, "Missing flag must fail closed");
assert.equal(flagAllowsUser({ key: FREIGHT_PUBLIC_FLAG, isEnabled: false, rolloutPercentage: 100 }, "user-1"), false, "Disabled public flag must deny access");
assert.equal(flagAllowsUser({ key: FREIGHT_PUBLIC_FLAG, isEnabled: true, rolloutPercentage: 0 }, "user-1"), false, "Zero rollout must deny access");
assert.equal(flagAllowsUser({ key: FREIGHT_PUBLIC_FLAG, isEnabled: true, rolloutPercentage: 100 }, "user-1"), true, "Full rollout must allow access");
assert.equal(adminAllowsInternalFreight(null), false, "Missing internal administrator must be denied");
assert.equal(adminAllowsInternalFreight({ role: "SUPPORT", permissions: [FREIGHT_INTERNAL_PERMISSION], isActive: false }), false, "Inactive administrator must be denied");
assert.equal(adminAllowsInternalFreight({ role: "SUPPORT", permissions: [FREIGHT_INTERNAL_PERMISSION], isActive: true }), true, "Explicit internal permission must allow access");
assert.equal(adminAllowsInternalFreight({ role: "SUPER_ADMIN", permissions: [], isActive: true }), true, "Active super administrator must allow internal access");

contains("prisma/schema.prisma", "model FreightListing", "FreightListing model is required");
contains("prisma/schema.prisma", "model VehicleListing", "VehicleListing model is required");
contains("prisma/schema.prisma", "model DriverListing", "DriverListing model is required");
contains("prisma/schema.prisma", "@@unique([ownerUserId, clientRequestId])", "Create idempotency constraint is required");
contains("prisma/schema.prisma", "@@index([status, loadingDate, createdAt])", "Active search index is required");
contains("prisma/schema.prisma", "@@index([ownerUserId, status, createdAt])", "Owner listing index is required");

const migration = "prisma/migrations/20260824213000_freight_marketplace_foundation/migration.sql";
contains(migration, /'freight_marketplace_public'[\s\S]*?false,[\s\S]*?0,/u, "Public flag must default to disabled at zero rollout");
contains(migration, /'freight_marketplace_internal'[\s\S]*?true,[\s\S]*?100,/u, "Internal flag must default to enabled for authorized administrators");
contains(migration, "ON CONFLICT (\"key\") DO NOTHING", "Flag seed must be repeat-safe");

const guardedRoutes = [
  "src/app/api/mobile/freight/listings/route.ts",
  "src/app/api/mobile/freight/listings/mine/route.ts",
  "src/app/api/mobile/freight/listings/[id]/route.ts",
  "src/app/api/mobile/freight/listings/[id]/status/route.ts",
  "src/app/api/mobile/freight/vehicle-listings/route.ts",
  "src/app/api/mobile/freight/vehicle-listings/mine/route.ts",
  "src/app/api/mobile/freight/vehicle-listings/[id]/route.ts",
  "src/app/api/mobile/freight/driver-listings/route.ts",
  "src/app/api/mobile/freight/driver-listings/mine/route.ts",
  "src/app/api/mobile/freight/driver-listings/[id]/route.ts",
];
for (const route of guardedRoutes) contains(route, "requireFreightMarketplaceAccess", `${route} must enforce marketplace access`);

contains("src/server/freight/access.ts", "return { enabled: false, audience: null }", "Access failures must fail closed");
contains("src/server/freight/service.ts", 'status: "ACTIVE"', "Public search must only return active listings");
contains("src/server/freight/service.ts", "ownerUserId: actor.userId", "Mutations must scope ownership to the authenticated user");
contains("src/server/freight/service.ts", "serializeListingRows(page, false)", "Search cards must not expose contact phone numbers");
contains("src/server/freight/service.ts", "take: input.limit + 1", "Queries must use bounded cursor pagination");
contains("src/server/freight/vehicle-service.ts", "ownerUserId: actor.userId", "Vehicle mutations must use authenticated ownership");
contains("src/server/freight/vehicle-service.ts", "serializeVehicleRows(page, false)", "Vehicle search cards must hide contact details");
contains("src/server/freight/driver-service.ts", "ownerUserId: actor.userId", "Driver mutations must use authenticated ownership");
contains("src/server/freight/driver-service.ts", "serializeDriverRows(page, false)", "Driver search cards must hide contact details");
contains("src/app/api/admin/feature-flags/freight-marketplace/route.ts", "ENABLE_FREIGHT_MARKETPLACE_PUBLIC", "Public enablement must require explicit confirmation");

const navigator = read("apps/mobile/src/navigation/app-navigator.tsx");
for (const route of ["CreateLoad", "FindLoads", "MyListings", "VehicleMarketplace", "DriverMarketplace"] as const) {
  assert(navigator.includes(`name="${route}"`), `${route} must remain registered in the authenticated navigator`);
}
contains("apps/mobile/src/navigation/app-navigator.tsx", "MarketplaceBottomTabBar", "Mobile freight navigation must use the shared marketplace bottom bar");
const drawer = read("apps/mobile/src/components/web-parity-tab-bar.tsx");
const mainNavSource = drawer.slice(drawer.indexOf("function mainNav"), drawer.indexOf("const DRAWER_BUILD_MARKER"));
assert(!/(CreateLoad|FindLoads|MyListings|VehicleMarketplace|DriverMarketplace)/u.test(mainNavSource), "Marketplace actions must not appear in the hamburger menu");
const bottomBar = read("apps/mobile/src/components/marketplace-bottom-tab-bar.tsx");
assert(/route: "CreateLoad"[\s\S]*?route: "FindLoads"[\s\S]*?route: "MyListings"[\s\S]*?route: "VehicleMarketplace"[\s\S]*?route: "DriverMarketplace"/u.test(bottomBar), "Bottom navigation order must be Yük Paylaş, Yük Bul, İlanlarım, Araç Bul, Şoför Bul");
contains("apps/mobile/src/components/marketplace-bottom-tab-bar.tsx", "center = index === 2", "İlanlarım must remain the emphasized center action");
const dashboard = read("apps/mobile/src/screens/app/dashboard-screen.tsx");
assert(dashboard.indexOf('t("createDemandRequest")') < dashboard.indexOf('t("liveListings")'), "Talep Oluştur must appear before live listings");
assert(
  dashboard.includes("ListHeaderComponent")
    && dashboard.includes("ListFooterComponent")
    && dashboard.slice(dashboard.indexOf("ListHeaderComponent")).includes('t("liveListings")')
    && dashboard.slice(dashboard.indexOf("ListFooterComponent")).includes('t("recentMatches")'),
  "Virtualized live listings must render between the live-list header and recent-match footer",
);
assert(!dashboard.includes('t("quickActions")'), "Legacy vertical marketplace quick actions must remain removed");
const linking = read("apps/mobile/src/navigation/linking.ts");
assert(linking.includes("CreateLoad") && linking.includes('CreateVehicle: "share"'), "Legacy create actions must resolve into canonical marketplace workspaces");
assert(linking.includes("MyListings"), "Canonical listing management must remain deep-linkable after the navigation migration");
contains("apps/mobile/src/features/freight/freightAccessStore.ts", "enabled: false", "Mobile access state must default to hidden");
contains("apps/mobile/src/features/freight/freightAccessStore.ts", "checkedUserId === userId", "Mobile capability must be bound to the authenticated user");

const freightSources = [
  ...guardedRoutes,
  "src/server/freight/access.ts",
  "src/server/freight/service.ts",
  "src/server/freight/vehicle-service.ts",
  "src/server/freight/driver-service.ts",
].map(read).join("\n");
assert(!/(baileys|messageQueue|whatsappAccount|worker\/)/iu.test(freightSources), "Freight module must remain isolated from the stable WhatsApp/message core");

console.log("Freight Marketplace contracts: PASS");
