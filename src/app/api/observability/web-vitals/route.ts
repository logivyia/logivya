import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/server/observability/logger";
import { keyedIdentifierHash } from "@/server/observability/privacy";
import { requestLogContext } from "@/server/observability/request-id";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.enum(["TTFB", "FCP", "LCP", "FID", "CLS", "INP"]),
  value: z.number().finite().min(0).max(3_600_000),
  delta: z.number().finite().min(-3_600_000).max(3_600_000),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigationType: z.string().trim().min(1).max(40),
  route: z.string().trim().min(1).max(300).regex(/^\/(?!\/)[^?#]*$/),
  appVersion: z.string().trim().min(1).max(80),
}).strict();

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) return new NextResponse(null, { status: 413 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    await enforceOperationRateLimit({
      scope: "web-vitals",
      subject: keyedIdentifierHash(ipAddress) || "anonymous",
      maxAttempts: 120,
      windowMs: 60 * 60_000,
      request,
    });
  } catch {
    return new NextResponse(null, { status: 202 });
  }

  logger.info("web.performance.metric", {
    ...requestLogContext(request),
    ...parsed.data,
    value: Math.round(parsed.data.value * 1000) / 1000,
    delta: Math.round(parsed.data.delta * 1000) / 1000,
    platform: "web",
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
