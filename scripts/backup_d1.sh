#!/usr/bin/env bash

set -euo pipefail
umask 077

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_NAME="${SHOPBGREMOVER_D1_DATABASE:-shopbgremover-db}"
BACKUP_DIR="${SHOPBGREMOVER_BACKUP_DIR:-${HOME}/.shopbgremover-backups}"
WRANGLER_BIN="${WRANGLER_BIN:-${PROJECT_ROOT}/node_modules/.bin/wrangler}"
SQLITE_BIN="${SQLITE_BIN:-$(command -v sqlite3 || true)}"

if [[ -z "${BACKUP_DIR}" || "${BACKUP_DIR}" == "/" || "${BACKUP_DIR}" == "${PROJECT_ROOT}" ]]; then
  echo "Refusing unsafe backup directory: ${BACKUP_DIR:-<empty>}" >&2
  exit 1
fi

if [[ ! -x "${WRANGLER_BIN}" ]]; then
  echo "Wrangler not found at ${WRANGLER_BIN}. Run npm install first." >&2
  exit 1
fi

if [[ -z "${SQLITE_BIN}" || ! -x "${SQLITE_BIN}" ]]; then
  echo "sqlite3 is required to validate the exported backup." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/${DATABASE_NAME}-${TIMESTAMP}.sql"
PARTIAL_FILE="${BACKUP_FILE}.partial"
METADATA_FILE="${BACKUP_FILE%.sql}.metadata.txt"
RESTORE_DIR=""
RESTORE_DB=""

cleanup() {
  rm -f -- "${PARTIAL_FILE}"
  if [[ -n "${RESTORE_DB}" ]]; then
    rm -f -- "${RESTORE_DB}"
  fi
  if [[ -n "${RESTORE_DIR}" && -d "${RESTORE_DIR}" ]]; then
    rmdir -- "${RESTORE_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ -e "${BACKUP_FILE}" || -e "${METADATA_FILE}" ]]; then
  echo "Backup already exists for timestamp ${TIMESTAMP}; retry in one second." >&2
  exit 1
fi

"${WRANGLER_BIN}" d1 export "${DATABASE_NAME}" --remote --output "${PARTIAL_FILE}" >/dev/null

if [[ ! -s "${PARTIAL_FILE}" ]]; then
  echo "Wrangler produced an empty D1 export." >&2
  exit 1
fi

chmod 600 "${PARTIAL_FILE}"

RESTORE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/shopbgremover-d1-restore.XXXXXX")"
RESTORE_DB="${RESTORE_DIR}/restore.sqlite3"
"${SQLITE_BIN}" "${RESTORE_DB}" < "${PARTIAL_FILE}"

INTEGRITY_CHECK="$("${SQLITE_BIN}" "${RESTORE_DB}" "PRAGMA integrity_check;")"
if [[ "${INTEGRITY_CHECK}" != "ok" ]]; then
  echo "Backup restore validation failed: ${INTEGRITY_CHECK}" >&2
  exit 1
fi

TABLE_COUNT="$("${SQLITE_BIN}" "${RESTORE_DB}" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';")"
USER_COUNT="$("${SQLITE_BIN}" "${RESTORE_DB}" "SELECT COUNT(*) FROM users;")"
ORDER_COUNT="$("${SQLITE_BIN}" "${RESTORE_DB}" "SELECT COUNT(*) FROM orders;")"

TIME_TRAVEL_OUTPUT="$("${WRANGLER_BIN}" d1 time-travel info "${DATABASE_NAME}")"
TIME_TRAVEL_BOOKMARK="$(printf '%s\n' "${TIME_TRAVEL_OUTPUT}" |
  sed -n "s/.*current bookmark is '\\([^']*\\)'.*/\\1/p" |
  head -n 1)"

if [[ -z "${TIME_TRAVEL_BOOKMARK}" ]]; then
  echo "Could not parse the current D1 Time Travel bookmark." >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  BACKUP_SHA256="$(shasum -a 256 "${PARTIAL_FILE}" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  BACKUP_SHA256="$(sha256sum "${PARTIAL_FILE}" | awk '{print $1}')"
else
  echo "A SHA-256 utility (shasum or sha256sum) is required." >&2
  exit 1
fi

WRANGLER_VERSION="$("${WRANGLER_BIN}" --version | tail -n 1)"
mv -- "${PARTIAL_FILE}" "${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"

printf '%s\n' \
  "database=${DATABASE_NAME}" \
  "created_at_utc=${TIMESTAMP}" \
  "backup_file=${BACKUP_FILE}" \
  "sha256=${BACKUP_SHA256}" \
  "time_travel_bookmark=${TIME_TRAVEL_BOOKMARK}" \
  "integrity_check=${INTEGRITY_CHECK}" \
  "table_count=${TABLE_COUNT}" \
  "user_count=${USER_COUNT}" \
  "order_count=${ORDER_COUNT}" \
  "wrangler_version=${WRANGLER_VERSION}" \
  > "${METADATA_FILE}"
chmod 600 "${METADATA_FILE}"

printf '%s\n' \
  "BACKUP_FILE=${BACKUP_FILE}" \
  "METADATA_FILE=${METADATA_FILE}" \
  "SHA256=${BACKUP_SHA256}" \
  "TIME_TRAVEL_BOOKMARK=${TIME_TRAVEL_BOOKMARK}" \
  "INTEGRITY_CHECK=${INTEGRITY_CHECK}"
