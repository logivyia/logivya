import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { freightSafeError } from "@/server/freight/response";
import { listOwnedFreightListings } from "@/server/freight/service";
import { freightMineSchema } from "@/server/freight/validation";

function queryInput(request: Request) {
  return Object.fromEntries([...new URL(request.url).searchParams.entries()].filter(([, value]) => value.trim() !== ""));
}

export async function GET(request: Request) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const parsed = freightMineSchema.safeParse(queryInput(request));
    if (!parsed.success) return mobileValidationError(parsed.error);
    return mobileSuccess(await listOwnedFreightListings(context.user.id, parsed.data));
  } catch (error) {
    return freightSafeError(error);
  }
}
