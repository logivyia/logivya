import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { readMobileJson } from "@/server/mobile/request-json";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { createDriverListing, searchDriverListings } from "@/server/freight/driver-service";
import { createDriverListingSchema, driverSearchSchema } from "@/server/freight/marketplace-validation";
import { freightSafeError } from "@/server/freight/response";
import { writeAuditLog } from "@/server/security/audit";
import { enqueueListingMatchingJobs } from "@/server/freight/smart-matching";

function queryInput(request: Request) { return Object.fromEntries([...new URL(request.url).searchParams.entries()].filter(([, value]) => value.trim() !== "")); }

export async function GET(request: Request) {
  try { await requireFreightMarketplaceAccess(request); const parsed = driverSearchSchema.safeParse(queryInput(request)); if (!parsed.success) return mobileValidationError(parsed.error); return mobileSuccess(await searchDriverListings(parsed.data)); }
  catch (error) { return freightSafeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireFreightMarketplaceAccess(request); const body = await readMobileJson(request); if (!body.ok) return body.response;
    const parsed = createDriverListingSchema.safeParse(body.data); if (!parsed.success) return mobileValidationError(parsed.error);
    const result = await createDriverListing({ userId: context.user.id, companyId: context.company.id, defaultCountry: context.company.defaultCountry, defaultCurrency: context.company.defaultCurrency }, parsed.data);
    await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: "freight.driver_listing.created", entityType: "DriverListing", entityId: result.listing.id, after: { status: result.listing.status, listingType: result.listing.listingType, duplicate: result.duplicate } }).catch(() => undefined);
    await enqueueListingMatchingJobs("DRIVER", result.listing.id);
    return mobileSuccess(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return freightSafeError(error); }
}
