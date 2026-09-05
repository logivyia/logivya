import { NextResponse } from "next/server";

import { getDriverListing } from "@/server/freight/driver-service";
import { getFreightListing } from "@/server/freight/service";
import { getVehicleListing } from "@/server/freight/vehicle-service";
import {
  marketplaceKindFromSegment,
  requireWebMarketplaceAccess,
  serializeWebListingDetail,
  validateOwnedDemandContext,
  webMarketplaceError,
} from "@/server/freight/web-marketplace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const context = await requireWebMarketplaceAccess();
    const { kind: segment, id } = await params;
    const kind = marketplaceKindFromSegment(segment);
    if (!kind || !id || id.length > 100) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const requestIdValue = new URL(request.url).searchParams.get("requestId");
    if (requestIdValue && requestIdValue.length > 100) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const requestId = await validateOwnedDemandContext(
      requestIdValue,
      kind,
      id,
      context.user.id,
      context.company.id,
    );
    const listing = kind === "LOAD"
      ? await getFreightListing(id, context.user.id)
      : kind === "VEHICLE"
        ? await getVehicleListing(id, context.user.id)
        : await getDriverListing(id, context.user.id);
    return NextResponse.json({
      listing: await serializeWebListingDetail(kind, listing, requestId),
    }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) {
    return webMarketplaceError(error);
  }
}
