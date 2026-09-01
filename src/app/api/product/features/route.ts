import { PRODUCT_CONTENT_UPDATED_AT, PRODUCT_CONTENT_VERSION } from "@/config/product-content";
import { resolveAllProductFeatures } from "@/server/features/product-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const features = await resolveAllProductFeatures();
  return Response.json({
    version: PRODUCT_CONTENT_VERSION,
    updatedAt: PRODUCT_CONTENT_UPDATED_AT,
    features: Object.values(features).map(({ key, status, providerBlocked }) => ({ key, status, providerBlocked })),
  }, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
