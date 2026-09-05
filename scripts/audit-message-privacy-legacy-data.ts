import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
type CountRow = { count: bigint | number };

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

const MESSAGE_ACTION = `(?:CAMPAIGN|MESSAGE|RECIPIENT|GROUP_SYNC|CONTACT_SYNC)`;
const SENSITIVE_JSON_KEY = `"(?:message|body|content|text|caption|preview|recipient(?:Phone|Jid)?|remoteJid|contact(?:Name|Id)?|group(?:Name|Id|Jid)?|rawPayload|templateVariables|targetJid)"[[:space:]]*:`;

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    campaignMetricRows: await count(`SELECT COUNT(*) AS count FROM "CampaignMetric"`),
    messageOperationAuditRows: await count(`SELECT COUNT(*) AS count FROM "AuditLog" WHERE "action" ~* '${MESSAGE_ACTION}' OR "entityType" IN ('MessageCampaign', 'MessageRecipient')`),
    messageAuditRowsWithSensitivePayloadKeys: await count(`
      SELECT COUNT(*) AS count
      FROM "AuditLog"
      WHERE ("action" ~* '${MESSAGE_ACTION}' OR "entityType" IN ('MessageCampaign', 'MessageRecipient'))
        AND CONCAT(COALESCE("beforeState"::text, ''), COALESCE("afterState"::text, ''), COALESCE("metadata"::text, '')) ~* '${SENSITIVE_JSON_KEY}'
    `),
    messageSecurityRowsWithSensitivePayloadKeys: await count(`
      SELECT COUNT(*) AS count
      FROM "SecurityEvent"
      WHERE "type" ~* '${MESSAGE_ACTION}'
        AND CONCAT(COALESCE("metadata"::text, ''), COALESCE("message", '')) ~* '${SENSITIVE_JSON_KEY}'
    `),
    globalMessageReportingViews: await count(`
      SELECT COUNT(*) AS count
      FROM pg_views
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        AND definition ~* '(MessageCampaign|MessageRecipient)'
    `),
    globalMessageMaterializedViews: await count(`
      SELECT COUNT(*) AS count
      FROM pg_matviews
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        AND definition ~* '(MessageCampaign|MessageRecipient)'
    `),
  };

  const blockers = [
    report.messageAuditRowsWithSensitivePayloadKeys,
    report.messageSecurityRowsWithSensitivePayloadKeys,
    report.globalMessageReportingViews,
    report.globalMessageMaterializedViews,
  ];
  const result = {
    ...report,
    privacyCleanupRequired: blockers.some((value) => value > 0),
    note: "Counts only. No message content, recipient identifier, phone number, JID, or row identifier was read into this report.",
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.privacyCleanupRequired) process.exitCode = 2;
}

main().finally(() => prisma.$disconnect());
