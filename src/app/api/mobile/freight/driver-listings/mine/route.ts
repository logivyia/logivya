import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { listOwnedDriverListings } from "@/server/freight/driver-service";
import { marketplaceMineSchema } from "@/server/freight/marketplace-validation";
import { freightSafeError } from "@/server/freight/response";

export async function GET(request: Request) {
  try { const context = await requireFreightMarketplaceAccess(request); const parsed = marketplaceMineSchema.safeParse(Object.fromEntries([...new URL(request.url).searchParams.entries()].filter(([, value]) => value.trim() !== ""))); if (!parsed.success) return mobileValidationError(parsed.error); return mobileSuccess(await listOwnedDriverListings(context.user.id, parsed.data)); }
  catch (error) { return freightSafeError(error); }
}
