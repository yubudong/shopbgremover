#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_NAME="${SHOPBGREMOVER_D1_DATABASE:-shopbgremover-db}"
WRANGLER_BIN="${WRANGLER_BIN:-${PROJECT_ROOT}/node_modules/.bin/wrangler}"

if [[ "$#" -ne 0 ]]; then
  echo "This command takes no arguments and always targets ${DATABASE_NAME}." >&2
  exit 1
fi

if [[ ! -x "${WRANGLER_BIN}" ]]; then
  echo "Wrangler not found at ${WRANGLER_BIN}. Run npm install first." >&2
  exit 1
fi

BACKUP_OUTPUT="$(bash "${PROJECT_ROOT}/scripts/backup_d1.sh")"
printf '%s\n' "${BACKUP_OUTPUT}"

BACKUP_FILE="$(printf '%s\n' "${BACKUP_OUTPUT}" | sed -n 's/^BACKUP_FILE=//p' | head -n 1)"
if [[ -z "${BACKUP_FILE}" || ! -s "${BACKUP_FILE}" ]]; then
  echo "Verified backup file was not produced; migration aborted." >&2
  exit 1
fi

echo "Verified production backup complete. Checking pending migrations..."
"${WRANGLER_BIN}" d1 migrations list "${DATABASE_NAME}" --remote

echo "Applying remote migrations..."
"${WRANGLER_BIN}" d1 migrations apply "${DATABASE_NAME}" --remote
