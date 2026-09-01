import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { readMobileJson } from "@/server/mobile/request-json";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { marketplaceStatusSchema, updateVehicleListingSchema } from "@/server/freight/marketplace-validation";
import { freightSafeError } from "@/server/freight/response";
import { getVehicleListing, transitionOwnedVehicleListing, updateOwnedVehicleListing } from "@/server/freight/vehicle-service";
import { writeAuditLog } from "@/server/security/audit";
import { demandContextIdFromRequest, requireMarketplaceListingId, validateOwnedDemandContext } from "@/server/freight/demand-context";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const { id: rawId } = await params;
    const id = requireMarketplaceListingId(rawId);
    const requestId = await validateOwnedDemandContext(demandContextIdFromRequest(request), "VEHICLE", id, context.user.id, context.company.id);
    return mobileSuccess({ listing: await getVehicleListing(id, context.user.id), requestId });
  }
  catch (error) { return freightSafeError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request); const body = await readMobileJson(request); if (!body.ok) return body.response; const { id } = await params;
    const statusParsed = marketplaceStatusSchema.safeParse(body.data);
    if (statusParsed.success) {
      const listing = await transitionOwnedVehicleListing(id, context.user.id, statusParsed.data.status);
      await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: "freight.vehicle_listing.status_changed", entityType: "VehicleListing", entityId: id, after: { status: listing.status } }).catch(() => undefined);
      return mobileSuccess({ listing });
    }
    const parsed = updateVehicleListingSchema.safeParse(body.data); if (!parsed.success) return mobileValidationError(parsed.error);
    const listing = await updateOwnedVehicleListing({ userId: context.user.id, companyId: context.company.id, defaultCountry: context.company.defaultCountry, defaultCurrency: context.company.defaultCurrency }, id, parsed.data);
    await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: "freight.vehicle_listing.updated", entityType: "VehicleListing", entityId: id, after: { status: listing.status } }).catch(() => undefined);
    return mobileSuccess({ listing });
  } catch (error) { return freightSafeError(error); }
}
