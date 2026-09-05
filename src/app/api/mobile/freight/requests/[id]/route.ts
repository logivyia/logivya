import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { deleteOwnedDemandRequest, getOwnedDemandRequest, transitionOwnedDemandRequest, updateOwnedDemandNotifications, updateOwnedDemandRequest } from "@/server/freight/demand-service";
import { demandRequestNotificationSchema, demandRequestStatusSchema, updateDemandRequestSchema } from "@/server/freight/demand-validation";
import { freightSafeError } from "@/server/freight/response";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const { id } = await params;
    return mobileSuccess({ request: await getOwnedDemandRequest(id, context.user.id) });
  } catch (error) {
    return freightSafeError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const { id } = await params;
    const status = demandRequestStatusSchema.safeParse(body.data);
    const notification = demandRequestNotificationSchema.safeParse(body.data);
    const update = updateDemandRequestSchema.safeParse(body.data);
    if (!status.success && !notification.success && !update.success) return mobileValidationError(update.error);
    let demandRequest;
    if (status.success) demandRequest = await transitionOwnedDemandRequest(id, context.user.id, status.data.status);
    else if (notification.success) demandRequest = await updateOwnedDemandNotifications(id, context.user.id, notification.data.notificationsEnabled);
    else if (update.success) demandRequest = await updateOwnedDemandRequest({ userId: context.user.id, companyId: context.company.id, defaultCountry: context.company.defaultCountry, defaultCurrency: context.company.defaultCurrency }, id, update.data);
    else return mobileValidationError(update.error);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: status.success ? "marketplace.request.status_changed" : notification.success ? "marketplace.request.notifications_changed" : "marketplace.request.updated",
      entityType: "MarketplaceDemandRequest",
      entityId: id,
      after: { status: demandRequest.status },
    }).catch(() => undefined);
    return mobileSuccess({ request: demandRequest });
  } catch (error) {
    return freightSafeError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const { id } = await params;
    const result = await deleteOwnedDemandRequest(id, context.user.id);
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "marketplace.request.deleted",
      entityType: "MarketplaceDemandRequest",
      entityId: id,
    }).catch(() => undefined);
    return mobileSuccess(result);
  } catch (error) {
    return freightSafeError(error);
  }
}
