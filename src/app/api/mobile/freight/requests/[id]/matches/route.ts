import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { listOwnedDemandMatches, markOwnedDemandMatchesViewed } from "@/server/freight/demand-service";
import { demandMatchListSchema } from "@/server/freight/demand-validation";
import { freightSafeError } from "@/server/freight/response";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";

function queryInput(request: Request) {
  return Object.fromEntries([...new URL(request.url).searchParams.entries()].filter(([, value]) => value.trim() !== ""));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const parsed = demandMatchListSchema.safeParse(queryInput(request));
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await params;
    return mobileSuccess(await listOwnedDemandMatches(id, context.user.id, parsed.data));
  } catch (error) {
    return freightSafeError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const { id } = await params;
    return mobileSuccess(await markOwnedDemandMatchesViewed(id, context.user.id));
  } catch (error) {
    return freightSafeError(error);
  }
}
