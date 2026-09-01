import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { readMobileJson } from "@/server/mobile/request-json";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { freightSafeError } from "@/server/freight/response";
import { transitionOwnedFreightListing } from "@/server/freight/service";
import { freightStatusSchema } from "@/server/freight/validation";
import { writeAuditLog } from "@/server/security/audit";
import { logger } from "@/server/observability/logger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = freightStatusSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await params;
    const listing = await transitionOwnedFreightListing(id, context.user.id, parsed.data.status);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "freight.listing.status_changed",
      entityType: "FreightListing",
      entityId: id,
      after: { status: listing.status },
    }).catch((auditError) => logger.error("freight.status_audit_failed", auditError, { listingId: id }));
    return mobileSuccess({ listing });
  } catch (error) {
    return freightSafeError(error);
  }
}
