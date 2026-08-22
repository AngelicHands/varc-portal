#!/bin/sh
set -eu

if ! command -v go >/dev/null 2>&1; then
  echo "[varc-api] Go is required. Install from https://go.dev/dl/ and retry." >&2
  exit 1
fi

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"

API_PORT="${API_PORT:-3100}"
echo "[varc-api] starting — http://localhost:${API_PORT} (request logs enabled)"

exec go run ./cmd/server
