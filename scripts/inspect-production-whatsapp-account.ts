import assert from "node:assert/strict";
import { Client } from "pg";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const connectionString = process.env.DATABASE_URL;
assert(connectionString, "DATABASE_URL is required");
const phoneDigits = String(option("--phone") || "").replace(/\D/g, "");
const accountId = String(option("--account-id") || "").trim();
assert(phoneDigits.length >= 10 || accountId, "--phone or --account-id is required");

async function main() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const accountResult = await client.query<{
      id: string;
      userId: string | null;
      companyId: string;
      phoneNumber: string | null;
      label: string | null;
      displayName: string | null;
      status: string;
      lastConnectedAt: Date | null;
      lastHeartbeatAt: Date | null;
      archivedAt: Date | null;
    }>(`
      SELECT "id", "userId", "companyId", "phoneNumber", "label", "displayName",
             "status"::text, "lastConnectedAt", "lastHeartbeatAt", "archivedAt"
      FROM "WhatsAppAccount"
      WHERE ($1 <> '' AND regexp_replace(coalesce("phoneNumber", ''), '[^0-9]', '', 'g') = $1)
         OR ($2 <> '' AND "id" = $2)
      ORDER BY "archivedAt" NULLS FIRST, "updatedAt" DESC
    `, [phoneDigits, accountId]);

    const activeAccounts = accountResult.rows.filter((row) => !row.archivedAt);
    if (activeAccounts.length !== 1) {
      console.log(JSON.stringify({
        matchedAccounts: accountResult.rows.map((row) => ({
          id: row.id,
          phoneNumber: row.phoneNumber,
          displayName: row.displayName,
          status: row.status,
          archivedAt: row.archivedAt,
          lastConnectedAt: row.lastConnectedAt,
          lastHeartbeatAt: row.lastHeartbeatAt,
        })),
      }, null, 2));
    }
    assert.equal(activeAccounts.length, 1, `Expected exactly one active account; found ${activeAccounts.length}`);
    const account = activeAccounts[0];
    assert(account.userId, "Target WhatsApp account has no owner user");

    const groupResult = await client.query<{
      id: string;
      externalGroupId: string;
      name: string;
      participantCount: number;
      accountId: string;
      userId: string | null;
      companyId: string;
      ingestionEnabled: boolean;
      ingestionApprovedAt: Date | null;
      logisticsGroupRecommended: boolean;
      logisticsRecommendationConfidence: number | null;
      autoPublicationEnabled: boolean;
      manualReviewRequired: boolean;
      minimumConfidence: number;
      sectorHint: string;
      lastSyncedAt: Date;
    }>(`
      SELECT "id", "externalGroupId", "name", "participantCount", "accountId", "userId", "companyId",
             "ingestionEnabled", "ingestionApprovedAt", "logisticsGroupRecommended",
             "logisticsRecommendationConfidence", "autoPublicationEnabled", "manualReviewRequired",
             "minimumConfidence", "sectorHint"::text, "lastSyncedAt"
      FROM "WhatsAppGroup"
      WHERE "accountId" = $1 AND "isArchived" = false
      ORDER BY "logisticsGroupRecommended" DESC,
               "logisticsRecommendationConfidence" DESC NULLS LAST,
               "participantCount" DESC,
               "name" ASC
    `, [account.id]);

    const controlResult = await client.query(`
      SELECT "globallyPaused", "emergencyKillSwitch", "pauseReason", "staleAlertMinutes"
      FROM "WhatsAppIngestionControl"
      WHERE "id" = 'global'
    `);

    console.log(JSON.stringify({
      account: {
        id: account.id,
        phoneNumber: account.phoneNumber,
        label: account.label,
        displayName: account.displayName,
        status: account.status,
        lastConnectedAt: account.lastConnectedAt,
        lastHeartbeatAt: account.lastHeartbeatAt,
        ownerUserId: account.userId,
        companyId: account.companyId,
      },
      control: controlResult.rows[0] || null,
      groupCount: groupResult.rowCount,
      groups: groupResult.rows.map((row) => ({
        id: row.id,
        externalGroupId: row.externalGroupId,
        name: row.name,
        participantCount: row.participantCount,
        ownershipMatchesAccount: row.userId === account.userId && row.companyId === account.companyId,
        ingestionEnabled: row.ingestionEnabled,
        ingestionApproved: Boolean(row.ingestionApprovedAt),
        recommended: row.logisticsGroupRecommended,
        recommendationConfidence: row.logisticsRecommendationConfidence,
        autoPublicationEnabled: row.autoPublicationEnabled,
        manualReviewRequired: row.manualReviewRequired,
        minimumConfidence: row.minimumConfidence,
        sectorHint: row.sectorHint,
        lastSyncedAt: row.lastSyncedAt,
      })),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
