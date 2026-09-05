#!/usr/bin/env bash
set -Eeuo pipefail

export LOGIVYA_RELEASE_TAG="admin-ux-v210-20260903-17"
export LOGIVYA_BASE_WEB_IMAGE="logivya-web:admin-responsive-20260903-16"
export LOGIVYA_PUBLIC_APP_VERSION="1.0.195"

exec "$(dirname "$0")/deploy-admin-operations-hardening-20260903.sh" "$@"
