import { NextResponse } from "next/server";

import { logger } from "@/server/observability/logger";
import { runObservabilityRetention } from "@/server/observability/retention";

async function run(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runObservabilityRetention()) });
  } catch (error) {
    logger.error("observability.retention.failed", error);
    return NextResponse.json({ error: "RETENTION_RUN_FAILED" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
