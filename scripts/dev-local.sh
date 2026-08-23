#!/bin/sh
set -eu

cleanup() {
  trap - INT TERM EXIT
  if [ -n "${APP_PID:-}" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  if [ -n "${WORKER_PID:-}" ]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

if ! command -v go >/dev/null 2>&1; then
  echo "Go is required for pnpm dev:all (varc-api + varc-worker). Install from https://go.dev/dl/ and retry." >&2
  exit 1
fi

pnpm dev &
APP_PID=$!

./scripts/dev-worker.sh &
WORKER_PID=$!

echo "[dev:all] starting Go API (logs prefixed [varc-api])"
./scripts/dev-api.sh &
API_PID=$!

wait "$APP_PID" "$WORKER_PID" "$API_PID"
