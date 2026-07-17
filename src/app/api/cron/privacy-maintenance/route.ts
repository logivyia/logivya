import { processPrivacyExportQueue } from "@/server/privacy/export";
import { runPrivacyRetention } from "@/server/privacy/retention";

async function run(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const exports = await processPrivacyExportQueue(2);
    const retention = await runPrivacyRetention({ dryRun: process.env.PRIVACY_RETENTION_ENFORCEMENT !== "true" });
    return Response.json({ ok: true, exports, retention });
  } catch {
    return Response.json({ error: "PRIVACY_MAINTENANCE_FAILED" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
