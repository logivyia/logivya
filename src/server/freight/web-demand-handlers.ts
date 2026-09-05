import { NextResponse } from "next/server";
import { requireWebMarketplaceAccess, webMarketplaceError } from "./web-marketplace";
import { getOwnedDemandRequest, updateOwnedDemandRequest, transitionOwnedDemandRequest, updateOwnedDemandNotifications, listOwnedDemandMatches, markOwnedDemandMatchesViewed, transitionOwnedDemandMatch } from "./demand-service";
import { demandRequestStatusSchema, demandRequestNotificationSchema, updateDemandRequestSchema, demandMatchListSchema, smartMatchResultStatusSchema } from "./demand-validation";
import { assertWebMutationOrigin } from "@/server/security/request-origin";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";

const json = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
const invalid = () => NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
type RouteContext = { params: Promise<{ id: string; matchId?: string }> };

export async function ownedDemand(request: Request, route: RouteContext) {
  try {
    if (request.method !== "GET") assertWebMutationOrigin(request);
    const context = await requireWebMarketplaceAccess();
    const { id } = await route.params;
    if (request.method === "GET") return json({ request: await getOwnedDemandRequest(id, context.user.id) });
    const body: unknown = await request.json().catch(() => null);
    const status = demandRequestStatusSchema.safeParse(body);
    const notification = demandRequestNotificationSchema.safeParse(body);
    const update = updateDemandRequestSchema.safeParse(body);
    let result;
    if (status.success) result = await transitionOwnedDemandRequest(id, context.user.id, status.data.status);
    else if (notification.success) result = await updateOwnedDemandNotifications(id, context.user.id, notification.data.notificationsEnabled);
    else if (update.success) result = await updateOwnedDemandRequest({ userId: context.user.id, companyId: context.company.id, defaultCountry: context.company.defaultCountry, defaultCurrency: context.company.defaultCurrency }, id, update.data);
    else return invalid();
    await writeAuditLog(request, { companyId: context.company.id, userId: context.user.id, action: "marketplace.request.updated", entityType: "MarketplaceDemandRequest", entityId: id, after: { status: result.status } }).catch(() => logger.warn("marketplace.request.audit_failed", { requestId: id }));
    return json({ request: result });
  } catch (error) { return webMarketplaceError(error); }
}

export async function ownedMatches(request: Request, route: RouteContext) {
  try {
    if (request.method !== "GET") assertWebMutationOrigin(request);
    const context = await requireWebMarketplaceAccess();
    const { id, matchId } = await route.params;
    if (request.method === "GET") {
      const input = demandMatchListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!input.success) return invalid();
      return json(await listOwnedDemandMatches(id, context.user.id, input.data));
    }
    if (!matchId) return json(await markOwnedDemandMatchesViewed(id, context.user.id));
    const input = smartMatchResultStatusSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return invalid();
    return json(await transitionOwnedDemandMatch(id, matchId, context.user.id, input.data.status));
  } catch (error) { return webMarketplaceError(error); }
}
