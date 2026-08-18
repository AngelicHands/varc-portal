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
  wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

pnpm dev &
APP_PID=$!

pnpm worker:backup &
WORKER_PID=$!

wait "$APP_PID" "$WORKER_PID"
