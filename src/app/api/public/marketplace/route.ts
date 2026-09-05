import { NextResponse } from "next/server";
import { readPublicCatalog, readPublicCatalogDetail } from "@/server/freight/public-catalog";
import { enforcePublicCatalogRateLimit } from "@/server/freight/public-catalog-rate-limit";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    await enforcePublicCatalogRateLimit(request);
    const params = new URL(request.url).searchParams;
    const data = params.has("id") ? { listing: await readPublicCatalogDetail(params.get("kind") ?? "", params.get("id") ?? "") } : await readPublicCatalog(params);
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "RATE_LIMITED" ? 429 : code.endsWith("NOT_FOUND") ? 404 : 503;
    return NextResponse.json({ success: false, error: { code: status === 429 ? "RATE_LIMITED" : status === 404 ? "NOT_FOUND" : "UNAVAILABLE" } }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
