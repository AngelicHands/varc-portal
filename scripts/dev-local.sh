#!/bin/sh
set -eu

cleanup() {
  trap - INT TERM EXIT
  if [ -n "${APP_PID:-}" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  if [ -n "${BACKUP_WORKER_PID:-}" ]; then
    kill "$BACKUP_WORKER_PID" 2>/dev/null || true
  fi
  if [ -n "${EMAIL_WORKER_PID:-}" ]; then
    kill "$EMAIL_WORKER_PID" 2>/dev/null || true
  fi
  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

if ! command -v go >/dev/null 2>&1; then
  echo "Go is required for pnpm dev:all (varc-api). Install from https://go.dev/dl/ and retry." >&2
  exit 1
fi

pnpm dev &
APP_PID=$!

pnpm worker:backup &
BACKUP_WORKER_PID=$!

pnpm worker:email &
EMAIL_WORKER_PID=$!

./scripts/dev-api.sh &
API_PID=$!

wait "$APP_PID" "$BACKUP_WORKER_PID" "$EMAIL_WORKER_PID" "$API_PID"
