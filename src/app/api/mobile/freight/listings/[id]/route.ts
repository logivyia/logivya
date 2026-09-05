import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { readMobileJson } from "@/server/mobile/request-json";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { freightSafeError } from "@/server/freight/response";
import { getFreightListing, updateOwnedFreightListing } from "@/server/freight/service";
import { updateFreightListingSchema } from "@/server/freight/validation";
import { writeAuditLog } from "@/server/security/audit";
import { logger } from "@/server/observability/logger";
import { demandContextIdFromRequest, requireMarketplaceListingId, validateOwnedDemandContext } from "@/server/freight/demand-context";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const { id: rawId } = await params;
    const id = requireMarketplaceListingId(rawId);
    const requestId = await validateOwnedDemandContext(
      demandContextIdFromRequest(request),
      "LOAD",
      id,
      context.user.id,
      context.company.id,
    );
    return mobileSuccess({ listing: await getFreightListing(id, context.user.id), requestId });
  } catch (error) {
    return freightSafeError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = updateFreightListingSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await params;
    const listing = await updateOwnedFreightListing({
      userId: context.user.id,
      companyId: context.company.id,
      defaultCountry: context.company.defaultCountry,
      defaultCurrency: context.company.defaultCurrency,
    }, id, parsed.data);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "freight.listing.updated",
      entityType: "FreightListing",
      entityId: id,
      after: { status: listing.status },
    }).catch((auditError) => logger.error("freight.update_audit_failed", auditError, { listingId: id }));
    return mobileSuccess({ listing });
  } catch (error) {
    return freightSafeError(error);
  }
}
