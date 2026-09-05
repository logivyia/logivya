import { PRODUCT_CONTENT_UPDATED_AT, PRODUCT_CONTENT_VERSION } from "@/config/product-content";
import { mobileSuccess } from "@/server/mobile/response";
import { resolveAllProductFeatures } from "@/server/features/product-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const features = await resolveAllProductFeatures();
  return mobileSuccess({
    version: PRODUCT_CONTENT_VERSION,
    updatedAt: PRODUCT_CONTENT_UPDATED_AT,
    features: Object.values(features).map(({ key, status, providerBlocked }) => ({ key, status, providerBlocked })),
  });
}
