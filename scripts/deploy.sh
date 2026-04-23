#!/usr/bin/env bash
# Mima Safe Deployment Script
# Usage: ./scripts/deploy.sh [--skip-health-check] [--rollback]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROLLBACK_DIR="${PROJECT_DIR}/.rollback"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://localhost:3000/api/health/readiness}"
MAX_HEALTH_RETRIES=${DEPLOY_HEALTH_RETRIES:-10}
HEALTH_RETRY_DELAY=${DEPLOY_HEALTH_DELAY:-3}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

save_rollback_point() {
  mkdir -p "$ROLLBACK_DIR"
  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)

  if [ -d "${PROJECT_DIR}/dist" ]; then
    cp -r "${PROJECT_DIR}/dist" "${ROLLBACK_DIR}/dist_${timestamp}"
    log_info "Rollback point saved: dist_${timestamp}"
  fi

  if [ -d "${PROJECT_DIR}/dist-server" ]; then
    cp -r "${PROJECT_DIR}/dist-server" "${ROLLBACK_DIR}/dist-server_${timestamp}"
    log_info "Rollback point saved: dist-server_${timestamp}"
  fi

  echo "$timestamp" > "${ROLLBACK_DIR}/latest_rollback"
  
  local rollback_count
  rollback_count=$(ls -1d "${ROLLBACK_DIR}"/dist_* 2>/dev/null | wc -l)
  if [ "$rollback_count" -gt 6 ]; then
    local oldest
    oldest=$(ls -1dt "${ROLLBACK_DIR}"/dist_* | tail -1)
    rm -rf "$oldest"
    oldest=$(ls -1dt "${ROLLBACK_DIR}"/dist-server_* | tail -1)
    rm -rf "$oldest"
    log_info "Cleaned up oldest rollback point (keeping 3)"
  fi
}

rollback() {
  if [ ! -f "${ROLLBACK_DIR}/latest_rollback" ]; then
    log_error "No rollback point available"
    exit 1
  fi

  local timestamp
  timestamp=$(cat "${ROLLBACK_DIR}/latest_rollback")

  log_warn "Rolling back to: ${timestamp}"

  if [ -d "${ROLLBACK_DIR}/dist_${timestamp}" ]; then
    rm -rf "${PROJECT_DIR}/dist"
    cp -r "${ROLLBACK_DIR}/dist_${timestamp}" "${PROJECT_DIR}/dist"
    log_info "Restored dist/"
  fi

  if [ -d "${ROLLBACK_DIR}/dist-server_${timestamp}" ]; then
    rm -rf "${PROJECT_DIR}/dist-server"
    cp -r "${ROLLBACK_DIR}/dist-server_${timestamp}" "${PROJECT_DIR}/dist-server"
    log_info "Restored dist-server/"
  fi

  log_info "Rollback complete — restart the server to apply"
}

check_health() {
  local attempt=1
  while [ "$attempt" -le "$MAX_HEALTH_RETRIES" ]; do
    log_info "Health check attempt ${attempt}/${MAX_HEALTH_RETRIES}..."

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

    if [ "$http_code" = "200" ]; then
      log_info "Health check PASSED (HTTP ${http_code})"
      return 0
    fi

    log_warn "Health check returned HTTP ${http_code} — retrying in ${HEALTH_RETRY_DELAY}s"
    sleep "$HEALTH_RETRY_DELAY"
    attempt=$((attempt + 1))
  done

  log_error "Health check FAILED after ${MAX_HEALTH_RETRIES} attempts"
  return 1
}

# Main
if [ "${1:-}" = "--rollback" ]; then
  rollback
  exit 0
fi

log_info "=== Mima Safe Deployment ==="

log_info "Step 1/5: Saving rollback point..."
save_rollback_point

log_info "Step 2/5: Building project..."
cd "$PROJECT_DIR"
npm run build

if [ "${1:-}" = "--skip-health-check" ]; then
  log_warn "Skipping health check (--skip-health-check)"
  log_info "Step 3-5: Skipped"
  log_info "=== Deployment complete (no health check) ==="
  exit 0
fi

log_info "Step 3/5: Waiting for server to be ready..."
log_info "  (Make sure the server is restarted, then this script will verify health)"

if ! check_health; then
  log_error "Post-deploy health check failed!"
  log_error "Run './scripts/deploy.sh --rollback' to restore previous build"
  exit 1
fi

log_info "Step 4/5: Verifying build artifacts..."
if [ ! -f "${PROJECT_DIR}/dist/index.html" ]; then
  log_error "dist/index.html missing after build!"
  exit 1
fi
if [ ! -f "${PROJECT_DIR}/dist-server/server.js" ]; then
  log_error "dist-server/server.js missing after build!"
  exit 1
fi

log_info "Step 5/5: Deployment verified"
log_info "=== Deployment complete and verified ==="
