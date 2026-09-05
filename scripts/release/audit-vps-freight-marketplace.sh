#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER=logivya-infra-postgres-1

query() {
  sudo docker exec "$CONTAINER" psql -X -At -U logivya -d logivya -c "$1"
}

printf 'freight_table=%s\n' "$(query "SELECT to_regclass('public.\"FreightListing\"') IS NOT NULL;")"
printf 'freight_migration=%s\n' "$(query "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name='20260824213000_freight_marketplace_foundation' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
printf 'eligible_admins=%s\n' "$(query "SELECT count(*) FROM \"PlatformAdmin\" WHERE \"isActive\"=true AND (role::text='SUPER_ADMIN' OR 'freight_marketplace_internal_access'=ANY(permissions));")"
printf 'migration_count=%s\n' "$(query "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
printf '%s\n' 'freight_flags_begin'
query "SELECT \"key\" || '|' || \"isEnabled\"::text || '|' || \"rolloutPercentage\"::text FROM \"FeatureFlag\" WHERE \"key\" LIKE 'freight_marketplace_%' ORDER BY \"key\";"
printf '%s\n' 'freight_flags_end'
