#!/bin/sh
set -eu

if ! command -v go >/dev/null 2>&1; then
  echo "[varc-worker] Go is required. Install from https://go.dev/dl/ and retry." >&2
  exit 1
fi

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api"

echo "[varc-worker] starting — email + backup job pollers"

exec go run ./cmd/worker
