import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { readMobileJson } from "@/server/mobile/request-json";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { getDriverListing, transitionOwnedDriverListing, updateOwnedDriverListing } from "@/server/freight/driver-service";
import { marketplaceStatusSchema, updateDriverListingSchema } from "@/server/freight/marketplace-validation";
import { freightSafeError } from "@/server/freight/response";
import { writeAuditLog } from "@/server/security/audit";
import { demandContextIdFromRequest, requireMarketplaceListingId, validateOwnedDemandContext } from "@/server/freight/demand-context";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const { id: rawId } = await params;
    const id = requireMarketplaceListingId(rawId);
    const requestId = await validateOwnedDemandContext(demandContextIdFromRequest(request), "DRIVER", id, context.user.id, context.company.id);
    return mobileSuccess({ listing: await getDriverListing(id, context.user.id), requestId });
  }
  catch (error) { return freightSafeError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request); const body = await readMobileJson(request); if (!body.ok) return body.response; const { id } = await params;
    const statusParsed = marketplaceStatusSchema.safeParse(body.data);
    if (statusParsed.success) {
      const listing = await transitionOwnedDriverListing(id, context.user.id, statusParsed.data.status);
      await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: "freight.driver_listing.status_changed", entityType: "DriverListing", entityId: id, after: { status: listing.status } }).catch(() => undefined);
      return mobileSuccess({ listing });
    }
    const parsed = updateDriverListingSchema.safeParse(body.data); if (!parsed.success) return mobileValidationError(parsed.error);
    const listing = await updateOwnedDriverListing({ userId: context.user.id, companyId: context.company.id, defaultCountry: context.company.defaultCountry, defaultCurrency: context.company.defaultCurrency }, id, parsed.data);
    await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: "freight.driver_listing.updated", entityType: "DriverListing", entityId: id, after: { status: listing.status } }).catch(() => undefined);
    return mobileSuccess({ listing });
  } catch (error) { return freightSafeError(error); }
}
