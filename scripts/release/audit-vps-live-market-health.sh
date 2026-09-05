#!/usr/bin/env bash
set -Eeuo pipefail

sudo docker exec logivya-infra-postgres-1 sh -lc '
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAX -F "|" -c "
    SELECT
      (SELECT count(*) FROM \"WhatsAppAccount\" WHERE status = '\''CONNECTED'\'' AND \"archivedAt\" IS NULL),
      (SELECT max(\"lastHeartbeatAt\") FROM \"WhatsAppAccount\" WHERE status = '\''CONNECTED'\'' AND \"archivedAt\" IS NULL),
      (SELECT count(*) FROM \"WhatsAppInboundMessage\" WHERE \"receivedAt\" >= now() - interval '\''15 minutes'\''),
      (SELECT count(*) FROM \"WhatsAppListingExtraction\" WHERE \"publishedAt\" >= now() - interval '\''15 minutes'\''),
      (SELECT count(*) FROM \"FreightListing\" WHERE status = '\''ACTIVE'\'' AND (\"expiresAt\" IS NULL OR \"expiresAt\" > now()));
  "
'
