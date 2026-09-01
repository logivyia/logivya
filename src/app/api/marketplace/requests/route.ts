import { NextResponse } from "next/server";

import { createDemandRequest, listOwnedDemandRequests } from "@/server/freight/demand-service";
import { createDemandRequestSchema, demandRequestListSchema } from "@/server/freight/demand-validation";
import { enqueueSmartMatchingJob } from "@/server/freight/smart-matching";
import { requireWebMarketplaceAccess, webMarketplaceError } from "@/server/freight/web-marketplace";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { assertWebMutationOrigin } from "@/server/security/request-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireWebMarketplaceAccess();
    const query = Object.fromEntries(
      [...new URL(request.url).searchParams.entries()].filter(([, value]) => value.trim() !== ""),
    );
    const parsed = demandRequestListSchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const result = await listOwnedDemandRequests(context.user.id, parsed.data);
    return NextResponse.json({
      requests: result.requests.map(serializeOwnedRequest),
      pageInfo: result.pageInfo,
    }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) {
    return webMarketplaceError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertWebMutationOrigin(request);
    const context = await requireWebMarketplaceAccess();
    const parsed = createDemandRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
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
    }).catch((auditError) => logger.error("marketplace.web_request_create_audit_failed", auditError, {
      requestId: result.request.id,
    }));
    return NextResponse.json({
      request: serializeOwnedRequest(result.request),
      duplicate: result.duplicate,
      smartMatchingStarted: true,
    }, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return webMarketplaceError(error);
  }
}

function serializeOwnedRequest(value: unknown) {
  const item = value as Record<string, unknown>;
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    origin: item.origin,
    destination: item.destination,
    location: item.location,
    availableFrom: item.availableFrom,
    availableUntil: item.availableUntil,
    trailerType: item.trailerType,
    minWeight: item.minWeight,
    maxWeight: item.maxWeight,
    notificationsEnabled: item.notificationsEnabled,
    status: item.status,
    expiresAt: item.expiresAt,
    matchCount: item.matchCount,
    lastMatchedAt: item.lastMatchedAt,
    createdAt: item.createdAt,
  };
}
