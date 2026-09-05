const { Client } = require("pg");
const fs = require("node:fs");
const crypto = require("node:crypto");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.POSTGRES_PASSWORD
    || (fs.existsSync("/run/secrets/postgres_password")
      ? fs.readFileSync("/run/secrets/postgres_password", "utf8").trim()
      : "");
  if (!password) throw new Error("DATABASE_PASSWORD_REQUIRED");
  return `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || "logivya")}:${encodeURIComponent(password)}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || "5432"}/${process.env.POSTGRES_DB || "logivya"}`;
}

function id() {
  return `c${crypto.randomBytes(12).toString("hex")}`;
}

function isActive(subscription, now = new Date()) {
  if (!subscription || !["ACTIVE", "TRIALING"].includes(subscription.status)) return false;
  const startsAt = subscription.currentPeriodStartsAt || subscription.startsAt || subscription.trialStartsAt;
  const endsAt = subscription.currentPeriodEndsAt || subscription.endsAt || subscription.trialEndsAt;
  return (!startsAt || new Date(startsAt) <= now) && (!endsAt || new Date(endsAt) > now);
}

async function loadCurrent(client, companyId) {
  const result = await client.query(
    `SELECT s.*, p."slug" AS "planSlug", p."name" AS "planName"
       FROM "Subscription" s
       JOIN "Plan" p ON p."id" = s."planId"
      WHERE s."companyId" = $1
      ORDER BY s."createdAt" DESC
      LIMIT 20`,
    [companyId],
  );
  return result.rows.find((entry) => isActive(entry)) || result.rows[0] || null;
}

async function main() {
  const userId = process.env.APP_REVIEW_USER_ID;
  const apply = process.env.APP_REVIEW_APPLY === "YES";
  const versionId = process.env.APP_REVIEW_VERSION_ID;
  const platformOwnerEmail = String(
    process.env.SUPER_ADMIN_EMAIL || process.env.INITIAL_PLATFORM_ADMIN_EMAIL || "",
  ).trim().toLowerCase();
  if (!userId || !versionId) throw new Error("APP_REVIEW_TARGET_REQUIRED");
  if (!platformOwnerEmail) throw new Error("SUPER_ADMIN_EMAIL_REQUIRED");

  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const [userResult, adminResult, companyResult] = await Promise.all([
      client.query('SELECT "status" FROM "User" WHERE "id" = $1', [userId]),
      client.query('SELECT "id", "status" FROM "User" WHERE lower("email") = $1', [platformOwnerEmail]),
      client.query(
        `SELECT DISTINCT "companyId" FROM (
           SELECT c."id" AS "companyId" FROM "Company" c WHERE c."ownerId" = $1
           UNION ALL
           SELECT cu."companyId" FROM "CompanyUser" cu
            WHERE cu."userId" = $1 AND cu."status" = 'ACTIVE'
         ) scoped`,
        [userId],
      ),
    ]);
    if (userResult.rows[0]?.status !== "ACTIVE") throw new Error("APP_REVIEW_USER_NOT_ACTIVE");
    const admin = adminResult.rows[0];
    if (!admin || admin.status !== "ACTIVE") throw new Error("PLATFORM_OWNER_NOT_ACTIVE");
    if (companyResult.rows.length !== 1) throw new Error("APP_REVIEW_COMPANY_SCOPE_AMBIGUOUS");
    const companyId = companyResult.rows[0].companyId;
    let current = await loadCurrent(client, companyId);
    const currentEnd = current?.currentPeriodEndsAt || current?.endsAt;
    const alreadyReady = Boolean(
      isActive(current)
      && current.planSlug === "professional"
      && (!currentEnd || new Date(currentEnd).getTime() > Date.now() + 14 * 86400000),
    );
    if (!apply || alreadyReady) {
      console.log(JSON.stringify({
        ok: true,
        mode: apply ? "APPLY" : "CHECK_ONLY",
        changed: false,
        alreadyReady,
        currentPlan: current?.planSlug || null,
        currentValid: isActive(current),
      }));
      return;
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + 180 * 86400000);
    const correlationId = `app-review:${versionId}:professional`;
    const reason = "App Store Review feature-access provisioning for 1.0.11 build 185";
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const company = await client.query(
        'SELECT "id", "ownerId" FROM "Company" WHERE "id" = $1 FOR UPDATE',
        [companyId],
      );
      if (!company.rows.length) throw new Error("COMPANY_NOT_FOUND");
      const [planResult, memberCount, invitationCount, previousResult] = await Promise.all([
        client.query('SELECT "id", "name" FROM "Plan" WHERE "slug" = $1 AND "isActive" = true', ["professional"]),
        client.query(
          `SELECT count(*)::int AS count FROM "CompanyUser"
            WHERE "companyId" = $1 AND "status" IN ('ACTIVE', 'INVITED')`,
          [companyId],
        ),
        client.query(
          `SELECT count(*)::int AS count FROM "CompanyInvitation"
            WHERE "companyId" = $1 AND "status" = 'PENDING'
              AND "reservedSeat" = true AND "expiresAt" > $2`,
          [companyId, startsAt],
        ),
        client.query(
          `SELECT s."id", s."status", s."endsAt", p."slug" AS "planSlug"
             FROM "Subscription" s JOIN "Plan" p ON p."id" = s."planId"
            WHERE s."companyId" = $1
              AND s."status" IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'MANUAL_PENDING', 'PAYMENT_PENDING')
            ORDER BY s."createdAt" DESC LIMIT 1`,
          [companyId],
        ),
      ]);
      const plan = planResult.rows[0];
      if (!plan) throw new Error("PROFESSIONAL_PLAN_NOT_FOUND");
      const usedSeats = memberCount.rows[0].count + invitationCount.rows[0].count;
      if (usedSeats > 3) throw new Error("APP_REVIEW_SEAT_RECONCILIATION_REQUIRED");
      const previous = previousResult.rows[0] || null;
      await client.query(
        `UPDATE "Subscription"
            SET "status" = 'CANCELED', "cancelledAt" = $2,
                "cancelAtPeriodEnd" = false, "updatedAt" = $2
          WHERE "companyId" = $1
            AND "status" IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'MANUAL_PENDING', 'PAYMENT_PENDING')`,
        [companyId, startsAt],
      );
      const subscriptionId = id();
      await client.query(
        `INSERT INTO "Subscription"
          ("id", "companyId", "planId", "status", "billingPeriod", "startsAt", "endsAt",
           "currentPeriodStartsAt", "currentPeriodEndsAt", "cancelAtPeriodEnd",
           "manuallyActivatedByUserId", "source", "provider", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'ACTIVE', 'MONTHLY', $4, $5, $4, $5, false,
                 $6, 'MANUAL_ADMIN', 'MANUAL', $4, $4)`,
        [subscriptionId, companyId, plan.id, startsAt, endsAt, admin.id],
      );
      const metadata = {
        source: "MANUAL_ADMIN",
        reason,
        previousPlan: previous?.planSlug || null,
        newPlan: "professional",
        correlationId,
        usedSeats,
        targetSeatLimit: 3,
      };
      await client.query(
        `INSERT INTO "SubscriptionEvent"
          ("id", "companyId", "subscriptionId", "actorUserId", "type", "message", "metadata", "createdAt")
         VALUES ($1, $2, $3, $4, 'SUBSCRIPTION_MANUALLY_ACTIVATED', $5, $6::jsonb, $7)`,
        [id(), companyId, subscriptionId, admin.id, `${plan.name} paketi etkinleştirildi.`, JSON.stringify(metadata), startsAt],
      );
      await client.query(
        `INSERT INTO "Notification"
          ("id", "companyId", "userId", "type", "category", "priority", "audience",
           "title", "message", "collapsedCount", "isRead", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'SUBSCRIPTION_ACTIVATED', 'SYSTEM', 'NORMAL', 'USER',
                 $4, $5, 0, false, $6, $6)`,
        [id(), companyId, company.rows[0].ownerId, "Aboneliğiniz etkinleştirildi", `${plan.name} paketiniz App Store incelemesi için aktiftir.`, startsAt],
      );
      await client.query(
        `INSERT INTO "AuditLog"
          ("id", "companyId", "userId", "actorType", "action", "result", "entityType",
           "entityId", "correlationId", "metadata", "createdAt")
         VALUES ($1, $2, $3, 'USER', 'PLAN_ASSIGNED_BY_ADMIN', 'SUCCESS', 'Subscription',
                 $4, $5, $6::jsonb, $7)`,
        [id(), companyId, admin.id, subscriptionId, correlationId, JSON.stringify({
          ...metadata,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }), startsAt],
      );
      await client.query(
        `INSERT INTO "SubscriptionAuditLog"
          ("id", "companyId", "subscriptionId", "actorUserId", "eventType",
           "previousState", "newState", "correlationId", "createdAt")
         VALUES ($1, $2, $3, $4, 'PLAN_ASSIGNED_BY_ADMIN', $5::jsonb, $6::jsonb, $7, $8)`,
        [id(), companyId, subscriptionId, admin.id,
          previous ? JSON.stringify({ plan: previous.planSlug, status: previous.status, endsAt: previous.endsAt }) : null,
          JSON.stringify({
            plan: "professional", status: "ACTIVE",
            startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
            usedSeats, seatLimit: 3,
          }), correlationId, startsAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    current = await loadCurrent(client, companyId);
    if (!isActive(current) || current.planSlug !== "professional") {
      throw new Error("APP_REVIEW_PROFESSIONAL_ACCESS_NOT_PERSISTED");
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "APPLY",
      changed: true,
      alreadyReady: true,
      currentPlan: current.planSlug,
      currentValid: true,
      validUntil: new Date(current.currentPeriodEndsAt || current.endsAt).toISOString(),
    }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  process.exitCode = 1;
});
