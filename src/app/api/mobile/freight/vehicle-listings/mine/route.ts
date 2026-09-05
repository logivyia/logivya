import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { freightSafeError } from "@/server/freight/response";
import { marketplaceMineSchema } from "@/server/freight/marketplace-validation";
import { listOwnedVehicleListings } from "@/server/freight/vehicle-service";

export async function GET(request: Request) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const parsed = marketplaceMineSchema.safeParse(Object.fromEntries([...new URL(request.url).searchParams.entries()].filter(([, value]) => value.trim() !== "")));
    if (!parsed.success) return mobileValidationError(parsed.error);
    return mobileSuccess(await listOwnedVehicleListings(context.user.id, parsed.data));
  } catch (error) { return freightSafeError(error); }
}
