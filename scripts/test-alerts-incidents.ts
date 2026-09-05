import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { operationalAlertDedupeKey } from "../src/server/observability/alerts";
import { canTransitionIncident } from "../src/server/monitoring/incidents";

const base = {
  environment: "test",
  service: "queue",
  type: "QUEUE_BACKLOG",
  windowMinutes: 15,
};
const first = operationalAlertDedupeKey({ ...base, now: 1_000_000 });
const duplicate = operationalAlertDedupeKey({ ...base, now: 1_000_100 });
const later = operationalAlertDedupeKey({ ...base, now: 1_900_001 });
assert.equal(
  first,
  duplicate,
  "Alerts in one cooldown window must deduplicate.",
);
assert.notEqual(
  first,
  later,
  "A later cooldown window must permit a new alert.",
);
assert(first.startsWith("test:queue:QUEUE_BACKLOG:"));

assert.equal(canTransitionIncident("OPEN", "ACKNOWLEDGED"), true);
assert.equal(canTransitionIncident("ACKNOWLEDGED", "INVESTIGATING"), true);
assert.equal(canTransitionIncident("INVESTIGATING", "MITIGATED"), true);
assert.equal(canTransitionIncident("MITIGATED", "RESOLVED"), true);
assert.equal(canTransitionIncident("RESOLVED", "OPEN"), true);
assert.equal(canTransitionIncident("OPEN", "MITIGATED"), false);

const incidentRoute = readFileSync(
  "src/app/api/admin/incidents/[id]/route.ts",
  "utf8",
);
const cronRoute = readFileSync("src/app/api/cron/monitoring/route.ts", "utf8");
const alertSource = readFileSync("src/server/observability/alerts.ts", "utf8");
assert(incidentRoute.includes("requireCriticalAdminAction"));
assert(incidentRoute.includes('"admin.incidents.update"'));
assert(incidentRoute.includes("writeAuditLog"));
assert(cronRoute.includes("CRON_SECRET"));
assert(alertSource.includes("ensureIncidentForAlert"));
assert(alertSource.includes("dedupeKey: { not: dedupeKey }"));
assert(alertSource.includes('data: { status: "RESOLVED", resolvedAt: now }'));
assert(
  alertSource.includes('["RESOLVED", "DISMISSED"].includes(current.status)'),
);

process.stdout.write(
  "Alert deduplication, cooldown and incident transition contracts passed.\n",
);
