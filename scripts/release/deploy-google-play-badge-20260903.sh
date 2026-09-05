#!/usr/bin/env bash
set -Eeuo pipefail

export LOGIVYA_RELEASE_TAG="google-play-badge-20260903-22"
export LOGIVYA_BASE_WEB_IMAGE="logivya-web:live-market-performance-v212-20260903-21"
export LOGIVYA_PUBLIC_APP_VERSION="1.0.198"

exec "$(dirname "$0")/deploy-admin-operations-hardening-20260903.sh" "$@"
