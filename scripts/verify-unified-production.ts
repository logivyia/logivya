import assert from "node:assert/strict";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
assert(connectionString, "DATABASE_URL is required");

async function main() {
  const client = new Client({ connectionString });

  try {
    await client.connect();

  const tableResult = await client.query<{
    feature_table: string | null;
    facebook_table: string | null;
    ingestion_table: string | null;
  }>(`
    SELECT
      to_regclass('public."ProductFeaturePublication"')::text AS feature_table,
      to_regclass('public."FacebookPublicationJob"')::text AS facebook_table,
      to_regclass('public."WhatsAppInboundMessage"')::text AS ingestion_table
  `);
  const tables = tableResult.rows[0];
  assert(tables.feature_table, "ProductFeaturePublication table is missing");
  assert(tables.facebook_table, "FacebookPublicationJob table is missing");
  assert(tables.ingestion_table, "WhatsAppInboundMessage table is missing");

  const featureResult = await client.query<{
    key: string;
    status: string;
    providerBlocked: boolean;
    blockerCode: string | null;
  }>(`
    SELECT "key", "status"::text, "providerBlocked", "blockerCode"
    FROM "ProductFeaturePublication"
    ORDER BY "key"
  `);
  assert.equal(featureResult.rowCount, 16, "Canonical product publication matrix must contain 16 features");
  const featureByKey = new Map(featureResult.rows.map((row) => [row.key, row]));
  assert.equal(featureByKey.get("WHATSAPP_ACCOUNTS")?.status, "PUBLIC");
  assert.equal(featureByKey.get("FACEBOOK_PAGES")?.status, "INTERNAL");
  assert.equal(featureByKey.get("FACEBOOK_PAGES")?.providerBlocked, true);
  assert.equal(featureByKey.get("FACEBOOK_PAGES")?.blockerCode, "META_APP_REVIEW_PENDING");
  assert.equal(featureByKey.get("WHATSAPP_LISTING_INGESTION")?.status, "INTERNAL");

  const planResult = await client.query<{
    slug: string;
    name: string;
    monthlyPrice: string;
    maxTeamUsers: number;
    trialDays: number;
  }>(`
    SELECT "slug", "name", "monthlyPrice"::text, "maxTeamUsers", "trialDays"
    FROM "Plan"
    WHERE "slug" IN ('trial', 'starter', 'professional')
    ORDER BY "slug"
  `);
  const planBySlug = new Map(planResult.rows.map((row) => [row.slug, row]));
  assert.deepEqual(
    {
      trial: planBySlug.get("trial"),
      starter: planBySlug.get("starter"),
      professional: planBySlug.get("professional"),
    },
    {
      trial: { slug: "trial", name: "Logivya 7 Gün Ücretsiz", monthlyPrice: "0.00", maxTeamUsers: 1, trialDays: 7 },
      starter: { slug: "starter", name: "Logivya Plus", monthlyPrice: "280.00", maxTeamUsers: 2, trialDays: 0 },
      professional: { slug: "professional", name: "Logivya Pro", monthlyPrice: "380.00", maxTeamUsers: 3, trialDays: 0 },
    },
    "Production plan rows do not match the canonical catalog",
  );

  const metricResult = await client.query<{
    approved_source_groups: string;
    inbound_messages: string;
    active_freight_listings: string;
    active_vehicle_listings: string;
    active_driver_listings: string;
    facebook_jobs: string;
  }>(`
    SELECT
      (SELECT count(*) FROM "WhatsAppGroup" WHERE "ingestionEnabled" = true AND "isArchived" = false)::text AS approved_source_groups,
      (SELECT count(*) FROM "WhatsAppInboundMessage")::text AS inbound_messages,
      (SELECT count(*) FROM "FreightListing" WHERE "status" = 'ACTIVE')::text AS active_freight_listings,
      (SELECT count(*) FROM "VehicleListing" WHERE "status" = 'ACTIVE')::text AS active_vehicle_listings,
      (SELECT count(*) FROM "DriverListing" WHERE "status" = 'ACTIVE')::text AS active_driver_listings,
      (SELECT count(*) FROM "FacebookPublicationJob")::text AS facebook_jobs
  `);

    console.log(JSON.stringify({
      ok: true,
      tables,
      featureCount: featureResult.rowCount,
      features: Object.fromEntries(featureResult.rows.map((row) => [row.key, {
        status: row.status,
        providerBlocked: row.providerBlocked,
        blockerCode: row.blockerCode,
      }])),
      plans: planResult.rows,
      metrics: metricResult.rows[0],
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
