import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatRelativeTime } from "../apps/mobile/src/utils/relative-time";

const root = process.cwd();
const dashboardStore = readFileSync(
  path.join(root, "apps/mobile/src/features/dashboard/dashboardStore.ts"),
  "utf8"
);
const marketplaceListingCard = readFileSync(
  path.join(root, "apps/mobile/src/components/live-marketplace-listing-card.tsx"),
  "utf8"
);
const dashboardScreen = readFileSync(
  path.join(root, "apps/mobile/src/screens/app/dashboard-screen.tsx"),
  "utf8"
);
const sectorMarketplaceScreen = readFileSync(
  path.join(root, "apps/mobile/src/screens/app/sector-marketplace-screen.tsx"),
  "utf8"
);
const liveListingRoute = readFileSync(
  path.join(root, "src/app/api/mobile/freight/listings/live/route.ts"),
  "utf8"
);
const liveFeed = readFileSync(
  path.join(root, "src/server/freight/live-feed.ts"),
  "utf8"
);

assert(
  dashboardStore.includes("function normalizeBootstrapDashboard"),
  "The mobile dashboard must normalize bootstrap payloads before rendering."
);
assert(
  dashboardStore.includes("reportedMetrics?.whatsappAccountCount ?? 0"),
  "A missing canonical account metric must fall back safely without counting a partial list."
);
assert(
  dashboardStore.includes("reportedMetrics?.syncedWhatsAppGroupCount ?? 0"),
  "A missing canonical group metric must fall back safely without aggregating a partial list."
);
assert(
  dashboardStore.includes("reportedMetrics?.contactCount ?? 0"),
  "A missing canonical contact metric must fall back safely without aggregating a partial list."
);
assert(
  !dashboardStore.includes("accounts.reduce"),
  "The dashboard must never derive tenant totals from a potentially truncated account list."
);
assert(
  dashboardStore.includes("getMobileMessageHistory().catch"),
  "Message-history failures must not make the entire overview unavailable."
);
assert(
  !dashboardStore.includes(
    "Promise.all([getMobileBootstrap(), getMobileMessageHistory()])"
  ),
  "The dashboard must not couple its essential bootstrap request to message history."
);

assert(
  marketplaceListingCard.includes("formatRelativeTime(listing.updatedAt, locale)"),
  "Live listing cards must use the Android-safe relative-time formatter."
);
assert(
  !marketplaceListingCard.includes("new Intl.RelativeTimeFormat"),
  "The live listing card must not instantiate RelativeTimeFormat without a fallback."
);
assert(
  liveListingRoute.includes("versionCode >= 201"),
  "Android builds with the unsafe live-card renderer must remain server-gated."
);
for (const [name, source] of [
  ["dashboard", dashboardScreen],
  ["sector marketplace", sectorMarketplaceScreen],
] as const) {
  assert(
    source.includes("FlatList"),
    `The ${name} live feed must use virtualized rendering.`
  );
  assert(
    source.includes("liveRefreshInFlight"),
    `The ${name} live feed must prevent overlapping refreshes.`
  );
  assert(
    source.includes("20_000") && !source.includes("5_000"),
    `The ${name} live feed must avoid the previous five-second polling loop.`
  );
  assert(
    source.includes('AppState.currentState === "active"'),
    `The ${name} live feed must pause polling while Android is backgrounded.`
  );
}
assert(
  marketplaceListingCard.includes("memo("),
  "Live listing cards must skip unrelated parent renders."
);
assert(
  liveFeed.includes("events.slice(-take)"),
  "The initial live snapshot must remain bounded to the requested page size."
);

const originalRelativeTimeFormat = Intl.RelativeTimeFormat;
try {
  Object.defineProperty(Intl, "RelativeTimeFormat", {
    configurable: true,
    value: undefined,
  });
  assert.doesNotThrow(
    () => formatRelativeTime(new Date(Date.now() - 120_000).toISOString(), "tr-TR"),
    "Live listing time formatting must not crash when Android lacks Intl.RelativeTimeFormat."
  );
  assert.match(
    formatRelativeTime(new Date(Date.now() - 120_000).toISOString(), "tr-TR"),
    /2 dk önce/,
    "The Android fallback must provide a readable Turkish relative time."
  );
} finally {
  Object.defineProperty(Intl, "RelativeTimeFormat", {
    configurable: true,
    value: originalRelativeTimeFormat,
  });
}

console.log("Mobile dashboard resilience contract passed.");
