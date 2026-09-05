#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER=logivya-infra-postgres-1

sudo docker exec -i "$CONTAINER" psql -X -At -F '|' -U logivya -d logivya <<'SQL'
SELECT
  left(u.email, 2) || '***@' || split_part(u.email, '@', 2) AS masked_email,
  pa.role::text,
  pa."isActive"::text,
  u.status::text,
  (pa.role::text = 'SUPER_ADMIN' OR 'freight_marketplace_internal_access' = ANY(pa.permissions))::text AS freight_eligible,
  (SELECT count(*)::text FROM "CompanyUser" cu WHERE cu."userId" = u.id AND cu.status::text = 'ACTIVE') AS active_memberships,
  (SELECT count(*)::text FROM "MobileDeviceSession" mds WHERE mds."userId" = u.id AND mds."revokedAt" IS NULL AND mds."expiresAt" > CURRENT_TIMESTAMP) AS active_mobile_sessions
FROM "PlatformAdmin" pa
JOIN "User" u ON u.id = pa."userId"
WHERE pa."isActive" = true
ORDER BY u.email;

SELECT
  left(u.email, 2) || '***@' || split_part(u.email, '@', 2) AS masked_email,
  mds.platform::text,
  COALESCE(mds."appVersion", 'unknown'),
  to_char(mds."lastUsedAt" AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI:SS'),
  CASE
    WHEN mds."revokedAt" IS NOT NULL THEN 'revoked'
    WHEN mds."expiresAt" <= CURRENT_TIMESTAMP THEN 'expired'
    ELSE 'active'
  END
FROM "MobileDeviceSession" mds
JOIN "PlatformAdmin" pa ON pa."userId" = mds."userId" AND pa."isActive" = true
JOIN "User" u ON u.id = mds."userId"
ORDER BY mds."lastUsedAt" DESC
LIMIT 8;
SQL
