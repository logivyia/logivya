#!/usr/bin/env bash
set -Eeuo pipefail

release="whatsapp-reconnect-coalescing-20260903-19"
base_worker_image="logivya-worker:live-market-arabic-20260902-4"
new_worker_image="logivya-worker:${release}"
source_archive=${1:?usage: deploy-whatsapp-reconnect-coalescing-20260903.sh <source-archive> <sha256>}
expected_archive_sha=${2:?source archive sha256 is required}
source_dir="/opt/logivya/releases/rc-source-${release}"
compose_dir="/opt/logivya/compose/app"
compose_file="${compose_dir}/compose.yml"
compose_env="${compose_dir}/.env"
backup_dir="/opt/logivya/backups/pre-${release}"
stage="preflight"
activation_started=false

fail_report() {
  rc=$?
  trap - ERR
  printf '{"ok":false,"audit":"WHATSAPP_RECONNECT_COALESCING_DEPLOY_STOP","stage":"%s","exitCode":%s}\n' "${stage}" "${rc}" >&2
  exit "${rc}"
}
trap fail_report ERR

test -f "${source_archive}"
test "$(sha256sum "${source_archive}" | cut -d' ' -f1)" = "${expected_archive_sha}"
test ! -e "${source_dir}"
test ! -e "${backup_dir}"
test "$(sudo docker inspect -f '{{.Config.Image}}' logivya-whatsapp-worker)" = "${base_worker_image}"
test "$(sudo sed -n 's/^LOGIVYA_WHATSAPP_WORKER_IMAGE=//p' "${compose_env}")" = "${base_worker_image}"
! sudo docker image inspect "${new_worker_image}" >/dev/null 2>&1

for service in logivya-web logivya-whatsapp-worker logivya-whatsapp-ingestion-worker logivya-edge logivya-telegram-worker logivya-notification-worker logivya-infra-postgres-1 logivya-infra-redis-1; do
  test "$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${service}")" = healthy
  test "$(sudo docker inspect -f '{{.State.OOMKilled}}' "${service}")" = false
done

latest_backup="/opt/logivya/backups/daily/latest-success.json"
sudo python3 - "${latest_backup}" <<'PY'
import datetime
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    proof = json.load(handle)
if proof.get("ok") is not True or proof.get("audit") != "ENCRYPTED_POSTGRES_BACKUP_DUAL_R2_READBACK_VERIFIED":
    raise SystemExit("latest production backup proof is not verified")
verified_at = datetime.datetime.fromisoformat(proof["verifiedAt"].replace("Z", "+00:00"))
if (datetime.datetime.now(datetime.timezone.utc) - verified_at).total_seconds() > 60 * 60:
    raise SystemExit("latest verified production backup is older than one hour")
PY
test "$(systemctl is-active logivya-postgres-backup.timer)" = active
test "$(systemctl is-enabled logivya-postgres-backup.timer)" = enabled

declare -A protected_ids
for service in logivya-web logivya-edge logivya-telegram-worker logivya-notification-worker logivya-infra-postgres-1 logivya-infra-redis-1; do
  protected_ids["${service}"]=$(sudo docker inspect -f '{{.Id}}' "${service}")
done

stage="source-prepare"
sudo install -d -o deploy -g deploy -m 0750 "${source_dir}"
tar --delay-directory-restore --no-same-owner --no-same-permissions -xzf "${source_archive}" -C "${source_dir}"
test -f "${source_dir}/package.json"
test -f "${source_dir}/ops/vps/Dockerfile.worker"
grep -q 'const reconnectScheduling = new Set<string>();' "${source_dir}/src/worker/baileys-provider.ts"
grep -q 'reconnectTimers.has(accountId) || reconnectScheduling.has(accountId)' "${source_dir}/src/worker/baileys-provider.ts"
grep -q 'WHATSAPP_CREDENTIALS_MISSING' "${source_dir}/src/worker/baileys-provider.ts"
source_hash=$(cd "${source_dir}" && find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)

stage="image-build-worker"
cd "${source_dir}"
sudo env BUILDKIT_PROGRESS=plain docker build --progress plain \
  --file ops/vps/Dockerfile.worker \
  --tag "${new_worker_image}" \
  --label "org.opencontainers.image.revision=${release}" \
  --label "org.opencontainers.image.source-hash=${source_hash}" \
  --label "org.opencontainers.image.archive-sha256=${expected_archive_sha}" \
  --label "org.opencontainers.image.version=${release}" .

stage="worker-import-smoke"
sudo docker run --rm --entrypoint node -e DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/logivya "${new_worker_image}" --conditions=react-server --import tsx -e \
  "Promise.all([import('./src/worker/baileys-provider.ts'),import('./src/server/whatsapp-ingestion/capture.ts'),import('./src/server/whatsapp-ingestion/processor.ts')]).then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)})"

stage="config-backup"
sudo install -d -m 0700 "${backup_dir}"
sudo cp --preserve=all "${compose_env}" "${backup_dir}/compose.env"

rollback() {
  rc=${1:-$?}
  trap - ERR INT TERM HUP
  if [ "${activation_started}" = true ]; then
    sudo cp --preserve=all "${backup_dir}/compose.env" "${compose_env}" || true
    cd "${compose_dir}"
    sudo docker compose --env-file "${compose_env}" -f "${compose_file}" up -d --no-deps --force-recreate whatsapp-worker whatsapp-ingestion-worker || true
  fi
  printf '{"ok":false,"audit":"WHATSAPP_RECONNECT_COALESCING_DEPLOY_ROLLED_BACK","stage":"%s","exitCode":%s}\n' "${stage}" "${rc}" >&2
  exit "${rc}"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
trap 'rollback 129' HUP

stage="compose-config"
activation_started=true
sudo python3 - "${compose_env}" "${release}" "${base_worker_image}" "${new_worker_image}" <<'PY'
import os
import stat
import sys
import tempfile

path, release, old_worker, new_worker = sys.argv[1:]
updates = {
    "LOGIVYA_RELEASE_VERSION": release,
    "LOGIVYA_WHATSAPP_WORKER_IMAGE": new_worker,
}
info = os.stat(path)
with open(path, "r", encoding="utf-8") as handle:
    lines = handle.read().splitlines()
seen = {}
output = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else None
    if key in updates:
        seen[key] = line.split("=", 1)[1]
        output.append(f"{key}={updates[key]}")
    else:
        output.append(line)
if seen.get("LOGIVYA_WHATSAPP_WORKER_IMAGE") != old_worker:
    raise SystemExit("unexpected current worker image")
for key, value in updates.items():
    if key not in seen:
        output.append(f"{key}={value}")
fd, temporary = tempfile.mkstemp(prefix=".logivya-compose-env-", dir=os.path.dirname(path), text=True)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(output) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, stat.S_IMODE(info.st_mode))
    os.chown(temporary, info.st_uid, info.st_gid)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
cd "${compose_dir}"
sudo docker compose --env-file "${compose_env}" -f "${compose_file}" config --quiet

stage="production-activation"
deployment_started_at=$(date -u +%FT%TZ)
sudo docker compose --env-file "${compose_env}" -f "${compose_file}" up -d --no-deps --force-recreate whatsapp-worker whatsapp-ingestion-worker

stage="production-health"
for service in logivya-whatsapp-worker logivya-whatsapp-ingestion-worker; do
  health=starting
  for _ in $(seq 1 120); do
    health=$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${service}" 2>/dev/null || true)
    [ "${health}" = healthy ] && break
    [ "${health}" = unhealthy ] && break
    sleep 2
  done
  test "${health}" = healthy
  test "$(sudo docker inspect -f '{{.RestartCount}}' "${service}")" = 0
  test "$(sudo docker inspect -f '{{.State.OOMKilled}}' "${service}")" = false
  test "$(sudo docker inspect -f '{{.Config.Image}}' "${service}")" = "${new_worker_image}"
done
test "$(sudo docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/sessions"}}{{.Source}}{{end}}{{end}}' logivya-whatsapp-worker)" = /opt/logivya/data/whatsapp-sessions

for service in logivya-web logivya-edge logivya-telegram-worker logivya-notification-worker logivya-infra-postgres-1 logivya-infra-redis-1; do
  test "$(sudo docker inspect -f '{{.Id}}' "${service}")" = "${protected_ids["${service}"]}"
  test "$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${service}")" = healthy
done

stage="post-deploy-observation"
sleep 45
for service in logivya-whatsapp-worker logivya-whatsapp-ingestion-worker; do
  test "$(sudo docker inspect -f '{{.RestartCount}}' "${service}")" = 0
  if sudo docker logs --since "${deployment_started_at}" "${service}" 2>&1 | grep -Eqi 'uncaught|unhandled|panic|FATAL|PrismaClientInitializationError|MODULE_NOT_FOUND'; then
    false
  fi
done
reconnect_scheduled=$(sudo docker logs --since "${deployment_started_at}" logivya-whatsapp-worker 2>&1 | grep -c 'whatsapp.session.reconnect_scheduled' || true)
auto_reconnect_failed=$(sudo docker logs --since "${deployment_started_at}" logivya-whatsapp-worker 2>&1 | grep -c 'whatsapp.session.auto_reconnect_failed' || true)
test "${reconnect_scheduled}" -lt 100
test "${auto_reconnect_failed}" -lt 100

sudo chmod -R a-w "${source_dir}"
trap - ERR INT TERM HUP
activation_started=false
printf '{"ok":true,"audit":"WHATSAPP_RECONNECT_COALESCING_PRODUCTION_DEPLOYED","release":"%s","workerImage":"%s","sourceHash":"%s","archiveSha256":"%s","reconnectScheduled":%s,"autoReconnectFailed":%s}\n' \
  "${release}" "${new_worker_image}" "${source_hash}" "${expected_archive_sha}" "${reconnect_scheduled}" "${auto_reconnect_failed}"
