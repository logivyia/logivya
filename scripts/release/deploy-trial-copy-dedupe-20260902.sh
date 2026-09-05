#!/usr/bin/env bash
set -Eeuo pipefail

release="trial-copy-dedupe-20260902-9"
base_web_image="logivya-web:favicon-circle-v5-20260902-7"
base_worker_image="logivya-worker:live-market-arabic-20260902-4"
new_web_image="logivya-web:${release}"
patch_archive=${1:?usage: deploy-trial-copy-dedupe-20260902.sh <patch-archive> <patch-sha256>}
expected_patch_sha=${2:?patch sha256 is required}
base_source_dir="/opt/logivya/releases/rc-source-favicon-circle-v5-20260902-7"
source_dir="/opt/logivya/releases/rc-source-${release}"
compose_dir="/opt/logivya/compose/app"
compose_file="${compose_dir}/compose.yml"
compose_env="${compose_dir}/.env"
backup_dir="/opt/logivya/backups/pre-${release}"
web_canary="logivya-web-${release}-canary"
stage="preflight"
activation_started=false

fail_report() {
  rc=$?
  trap - ERR
  printf '{"ok":false,"audit":"TRIAL_COPY_DEDUPE_DEPLOY_STOP","stage":"%s","exitCode":%s}\n' "${stage}" "${rc}" >&2
  exit "${rc}"
}
trap fail_report ERR

test -f "${patch_archive}"
test "$(sha256sum "${patch_archive}" | cut -d' ' -f1)" = "${expected_patch_sha}"
test -d "${base_source_dir}"
test ! -e "${source_dir}"
test ! -e "${backup_dir}"
test "$(sudo docker inspect -f '{{.Config.Image}}' logivya-web)" = "${base_web_image}"
test "$(sudo docker inspect -f '{{.Config.Image}}' logivya-whatsapp-worker)" = "${base_worker_image}"
test "$(sudo sed -n 's/^LOGIVYA_WEB_IMAGE=//p' "${compose_env}")" = "${base_web_image}"
test "$(sudo sed -n 's/^LOGIVYA_WHATSAPP_WORKER_IMAGE=//p' "${compose_env}")" = "${base_worker_image}"
test -z "$(sudo docker ps -a -q -f name=^/${web_canary}$)"
! sudo docker image inspect "${new_web_image}" >/dev/null 2>&1

for service in logivya-web logivya-whatsapp-worker logivya-whatsapp-ingestion-worker logivya-edge logivya-telegram-worker logivya-notification-worker logivya-infra-postgres-1 logivya-infra-redis-1; do
  test "$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${service}")" = healthy
  test "$(sudo docker inspect -f '{{.State.OOMKilled}}' "${service}")" = false
  test "$(sudo docker inspect -f '{{.RestartCount}}' "${service}")" = 0
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
for service in logivya-whatsapp-worker logivya-whatsapp-ingestion-worker logivya-edge logivya-telegram-worker logivya-notification-worker logivya-infra-postgres-1 logivya-infra-redis-1; do
  protected_ids["${service}"]=$(sudo docker inspect -f '{{.Id}}' "${service}")
done

stage="source-prepare"
sudo cp -a "${base_source_dir}" "${source_dir}"
sudo chown -R deploy:deploy "${source_dir}"
sudo chmod -R u+w "${source_dir}"
tar --delay-directory-restore --no-same-owner --no-same-permissions -xzf "${patch_archive}" -C "${source_dir}"
test -f "${source_dir}/ops/vps/Dockerfile.web"
grep -q 'const isTrial = plan.slug === "trial"' "${source_dir}/src/components/public-pricing-cards.tsx"
! grep -q 'home.plan.trial.period' "${source_dir}/src/components/public-pricing-cards.tsx"
grep -q 'Trial must not repeat the seven-day-free message' "${source_dir}/scripts/test-prompt4-public-billing.ts"
source_hash=$(cd "${source_dir}" && find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)

stage="image-build-web"
cd "${source_dir}"
sudo env BUILDKIT_PROGRESS=plain docker build --progress plain \
  --file ops/vps/Dockerfile.web \
  --tag "${new_web_image}" \
  --build-arg "DEPLOYMENT_VERSION=${release}" \
  --build-arg "NEXT_PUBLIC_APP_URL=https://www.logivya.com" \
  --build-arg "NEXT_PUBLIC_APP_VERSION=1.0.191" \
  --label "org.opencontainers.image.revision=${release}" \
  --label "org.opencontainers.image.source-hash=${source_hash}" \
  --label "org.opencontainers.image.patch-sha256=${expected_patch_sha}" \
  --label "org.opencontainers.image.version=${release}" .

cleanup_canary() {
  sudo docker rm -f "${web_canary}" >/dev/null 2>&1 || true
}
trap cleanup_canary EXIT
stage="web-canary"
cd "${compose_dir}"
sudo env LOGIVYA_WEB_IMAGE="${new_web_image}" docker compose --env-file "${compose_env}" -f "${compose_file}" run -d --no-deps --name "${web_canary}" web >/dev/null
canary_health=starting
for _ in $(seq 1 75); do
  canary_health=$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${web_canary}")
  [ "${canary_health}" = healthy ] && break
  [ "${canary_health}" = unhealthy ] && break
  sleep 2
done
test "${canary_health}" = healthy
test "$(sudo docker inspect -f '{{.RestartCount}}' "${web_canary}")" = 0
test "$(sudo docker inspect -f '{{.State.OOMKilled}}' "${web_canary}")" = false
sudo docker exec "${web_canary}" /usr/local/bin/logivya-entrypoint node -e '
  fetch("http://127.0.0.1:3000/", { headers: { "accept-language": "tr-TR,tr;q=0.9" } }).then(async (response) => {
    const html = await response.text();
    if (response.status !== 200 || !html.includes("Logivya 7 Gün Ücretsiz") || html.toLocaleLowerCase("tr").includes("aria-label=\"7 gün ücretsiz\"")) process.exit(70);
  }).catch(() => process.exit(71));
'
cleanup_canary
trap - EXIT

stage="config-backup"
sudo install -d -m 0700 "${backup_dir}"
sudo cp --preserve=all "${compose_env}" "${backup_dir}/compose.env"

rollback() {
  rc=${1:-$?}
  trap - ERR INT TERM HUP
  if [ "${activation_started}" = true ]; then
    sudo cp --preserve=all "${backup_dir}/compose.env" "${compose_env}" || true
    cd "${compose_dir}"
    sudo docker compose --env-file "${compose_env}" -f "${compose_file}" up -d --no-deps --force-recreate web || true
  fi
  printf '{"ok":false,"audit":"TRIAL_COPY_DEDUPE_DEPLOY_ROLLED_BACK","stage":"%s","exitCode":%s}\n' "${stage}" "${rc}" >&2
  exit "${rc}"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
trap 'rollback 129' HUP

stage="compose-config"
activation_started=true
sudo python3 - "${compose_env}" "${release}" "${base_web_image}" "${new_web_image}" <<'PY'
import os
import stat
import sys
import tempfile

path, release, old_web, new_web = sys.argv[1:]
updates = {"LOGIVYA_RELEASE_VERSION": release, "LOGIVYA_WEB_IMAGE": new_web}
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
if seen.get("LOGIVYA_WEB_IMAGE") != old_web:
    raise SystemExit("unexpected current web image")
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
sudo docker compose --env-file "${compose_env}" -f "${compose_file}" up -d --no-deps --force-recreate web

stage="production-health"
health=starting
for _ in $(seq 1 120); do
  health=$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' logivya-web 2>/dev/null || true)
  [ "${health}" = healthy ] && break
  [ "${health}" = unhealthy ] && break
  sleep 2
done
test "${health}" = healthy
test "$(sudo docker inspect -f '{{.Config.Image}}' logivya-web)" = "${new_web_image}"
test "$(sudo docker inspect -f '{{.RestartCount}}' logivya-web)" = 0
test "$(sudo docker inspect -f '{{.State.OOMKilled}}' logivya-web)" = false

for service in logivya-whatsapp-worker logivya-whatsapp-ingestion-worker logivya-edge logivya-telegram-worker logivya-notification-worker logivya-infra-postgres-1 logivya-infra-redis-1; do
  test "$(sudo docker inspect -f '{{.Id}}' "${service}")" = "${protected_ids["${service}"]}"
  test "$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${service}")" = healthy
done

stage="public-verification"
sudo docker exec logivya-web /usr/local/bin/logivya-entrypoint node -e '
  fetch("http://127.0.0.1:3000/", { headers: { "accept-language": "tr-TR,tr;q=0.9" } }).then(async (response) => {
    const html = await response.text();
    if (response.status !== 200 || !html.includes("Logivya 7 Gün Ücretsiz") || html.toLocaleLowerCase("tr").includes("aria-label=\"7 gün ücretsiz\"")) process.exit(70);
  }).catch(() => process.exit(71));
'
curl --connect-timeout 5 --max-time 20 -fsS https://www.logivya.com/api/health/ready >/dev/null
if sudo docker logs --since "${deployment_started_at}" logivya-web 2>&1 | grep -Eqi 'uncaught|unhandled|panic|FATAL|PrismaClientInitializationError|MODULE_NOT_FOUND'; then
  false
fi

sudo chmod -R a-w "${source_dir}"
trap - ERR INT TERM HUP
activation_started=false
printf '{"ok":true,"audit":"TRIAL_COPY_DEDUPE_PRODUCTION_DEPLOYED","release":"%s","webImage":"%s","sourceHash":"%s","patchSha256":"%s","workerContainersUnchanged":true,"webCanary":true}\n' \
  "${release}" "${new_web_image}" "${source_hash}" "${expected_patch_sha}"
