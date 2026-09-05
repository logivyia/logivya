import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { transitionOwnedDemandMatch } from "@/server/freight/demand-service";
import { smartMatchResultStatusSchema } from "@/server/freight/demand-validation";
import { freightSafeError } from "@/server/freight/response";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = smartMatchResultStatusSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id, matchId } = await params;
    const result = await transitionOwnedDemandMatch(id, matchId, context.user.id, parsed.data.status);
    return mobileSuccess({
      ...result,
      savedAt: result.savedAt?.toISOString() ?? null,
      dismissedAt: result.dismissedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return freightSafeError(error);
  }
}
