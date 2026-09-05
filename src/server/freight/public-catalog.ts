import "server-only";
import { readLiveMarketplaceEvents } from "./live-feed";
import { safeWebMarketplaceScope, serializeWebListingDetail } from "./web-marketplace";
import { parseMarketplaceFilters } from "../../../shared/marketplace-filters";
import { getFreightListing } from "./service";
import { getVehicleListing } from "./vehicle-service";
import { getDriverListing } from "./driver-service";

export async function readPublicCatalog(params: URLSearchParams) {
  const filters = parseMarketplaceFilters(params);
  const rawCursor = params.get("before");
  const [time, id] = rawCursor?.split("|") ?? [];
  const before = time && id && id.length < 100 && Number.isFinite(Date.parse(time)) ? { time: new Date(time), id } : undefined;
  const requestedLimit = Number(params.get("limit") || 60);
  const limit = Number.isFinite(requestedLimit) ? Math.min(1000, Math.max(1, Math.floor(requestedLimit))) : 60;
  const events = await readLiveMarketplaceEvents(new Date(), limit + 1, undefined, true, safeWebMarketplaceScope(params.get("scope")), { filters, before });
  const descending = events.slice().reverse();
  const page = descending.slice(0, limit);
  const last = page.at(-1);
  // Explicit public projection: no owner/company IDs, source metadata, raw text,
  // contact fields, private demand IDs or encrypted payloads cross this boundary.
  return {
    items: page.map(({ listing: row }) => ({
      id: row.id, kind: row.kind, href: `/explore/${row.kind.toLowerCase()}/${encodeURIComponent(row.id)}`,
      publicTitle: row.publicTitle, publicDescription: row.publicDescription,
      loadingDisplayName: row.loadingDisplayName, deliveryDisplayName: row.deliveryDisplayName,
      originCountry: row.originCountry, destinationCountry: row.destinationCountry,
      vehicleDisplayName: row.vehicleDisplayName, tonnageDisplay: row.tonnageDisplay,
      tonnageAccessibilityLabel: row.tonnageAccessibilityLabel, vehicleCountDisplay: row.vehicleCountDisplay,
      publicAdvertiserName: row.publicAdvertiserName, sourcePlatformDisplay: row.sourcePlatformDisplay,
      listingSummary: row.listingSummary, relevantDate: row.relevantDate, publishedAt: row.publishedAt, updatedAt: row.updatedAt, status: row.status,
    })),
    nextCursor: descending.length > limit && last ? `${last.cursor}|${last.listing.id}` : null,
  };
}

export async function readPublicCatalogDetail(kind: string, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(id)) throw new Error("NOT_FOUND");
  const row = kind === "load" ? await getFreightListing(id, "") : kind === "vehicle" ? await getVehicleListing(id, "") : kind === "driver" ? await getDriverListing(id, "") : null;
  if (!row) throw new Error("NOT_FOUND");
  const result = await serializeWebListingDetail(kind === "load" ? "LOAD" : kind === "vehicle" ? "VEHICLE" : "DRIVER", row, null);
  return { ...result, contact: null, contactAccess: "SIGN_IN_REQUIRED" as const, href: `/explore/${kind}/${id}` };
}
