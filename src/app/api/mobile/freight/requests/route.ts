import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { createDemandRequest, listOwnedDemandRequests } from "@/server/freight/demand-service";
import { createDemandRequestSchema, demandRequestListSchema } from "@/server/freight/demand-validation";
import { freightSafeError } from "@/server/freight/response";
import { enqueueSmartMatchingJob } from "@/server/freight/smart-matching";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";

function queryInput(request: Request) {
  return Object.fromEntries([...new URL(request.url).searchParams.entries()].filter(([, value]) => value.trim() !== ""));
}

export async function GET(request: Request) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const parsed = demandRequestListSchema.safeParse(queryInput(request));
    if (!parsed.success) return mobileValidationError(parsed.error);
    return mobileSuccess(await listOwnedDemandRequests(context.user.id, parsed.data));
  } catch (error) {
    return freightSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = createDemandRequestSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const result = await createDemandRequest({
      userId: context.user.id,
      companyId: context.company.id,
      defaultCountry: context.company.defaultCountry,
      defaultCurrency: context.company.defaultCurrency,
    }, parsed.data);
    const smartMatchingJob = await enqueueSmartMatchingJob({
      demandId: result.request.id,
      companyId: context.company.id,
      ownerUserId: context.user.id,
    });
    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "marketplace.request.created",
      entityType: "MarketplaceDemandRequest",
      entityId: result.request.id,
      after: { kind: result.request.kind, duplicate: result.duplicate, smartMatchingJobId: smartMatchingJob.id },
    }).catch((auditError) => logger.error("marketplace.request_create_audit_failed", auditError, { requestId: result.request.id }));
    return mobileSuccess({
      ...result,
      initialMatches: 0,
      smartMatchingStarted: true,
      smartMatchingJob: {
        id: smartMatchingJob.id,
        status: smartMatchingJob.status,
        requestedSources: smartMatchingJob.requestedSources,
        createdAt: smartMatchingJob.createdAt.toISOString(),
      },
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return freightSafeError(error);
  }
}
