import { NextResponse } from "next/server";

import { getSystemHealthSnapshot } from "@/server/monitoring/health";
import { reconcileHealthIncidents } from "@/server/monitoring/incidents";
import { logger } from "@/server/observability/logger";

async function run(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const snapshot = await getSystemHealthSnapshot();
    const incidents = await reconcileHealthIncidents(snapshot);
    return NextResponse.json({ ok: true, status: snapshot.status, generatedAt: snapshot.generatedAt, incidents });
  } catch (error) {
    logger.error("monitoring.reconciliation.failed", error);
    return NextResponse.json({ error: "MONITORING_RECONCILIATION_FAILED" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
