import { writeFileSync } from "node:fs";
import { locales } from "../apps/mobile/src/i18n/config";
import { translate, type TranslationKey } from "../apps/mobile/src/i18n/translations";
const labels = {
  overview: "overview", whatsapp: "whatsappAccounts", telegram: "telegramAccounts", "home-moving": "homeMovingMarketplace", "partial-load": "partialLoadMarketplace", "heavy-haul": "heavyHaulMarketplace", groups: "groups", categories: "categories", support: "support", subscription: "subscription", users: "teamAddUser", "share-load": "createLoad", "find-loads": "findLoads", "my-listings": "myListings", vehicles: "findVehicle", "share-vehicle": "shareVehicle", drivers: "findDriver", requests: "myDemandRequests", login: "login", register: "register", back: "back", refresh: "refresh", liveListings: "liveListings", marketplace: "logisticsMarketplace",
} satisfies Record<string, TranslationKey>;
const descriptions = { "home-moving": "homeMovingMarketplaceDescription", "partial-load": "partialLoadMarketplaceDescription", "heavy-haul": "heavyHaulMarketplaceDescription", telegram: "telegramAccountsDescription", "share-load": "createLoadDescription", "find-loads": "findLoadsDescription", "my-listings": "myListingsUnifiedDescription", vehicles: "findVehicleDescription", "share-vehicle": "shareVehicleDescription", drivers: "findDriverDescription", requests: "myDemandRequestsDescription" } satisfies Record<string, TranslationKey>;
const result = Object.fromEntries(locales.map(locale => [locale, { labels: Object.fromEntries(Object.entries(labels).map(([id,key]) => [id,translate(locale,key)])), descriptions: Object.fromEntries(Object.entries(descriptions).map(([id,key]) => [id,translate(locale,key)])) }]));
writeFileSync("shared/guest-marketplace-labels.json", JSON.stringify(result, null, 2) + "\n");
console.log(`Generated guest labels for ${locales.length} languages from existing translations.`);
