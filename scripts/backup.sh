#!/usr/bin/env bash
# Back up the TADPODS PostgreSQL database to a timestamped custom-format dump.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/tadpods ./scripts/backup.sh [output-dir]
#
# Requires: pg_dump (matching the target server's major version, or newer).
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the database to back up}"

OUTPUT_DIR="${1:-./backups}"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_FILE="${OUTPUT_DIR}/tadpods-${TIMESTAMP}.dump"

# Prisma's DATABASE_URL carries a `?schema=public` query parameter pg_dump does not
# understand — strip any query string before handing the URL to libpq tooling.
DUMP_URL="${DATABASE_URL%%\?*}"

echo "Backing up TADPODS database to ${OUTPUT_FILE} ..."
echo "(pg_dump must be the same or a newer major version than the target server — check with: pg_dump --version)"
pg_dump --format=custom --no-owner --no-privileges --file="${OUTPUT_FILE}" "${DUMP_URL}"

SIZE="$(du -h "${OUTPUT_FILE}" | cut -f1)"
echo "Backup complete: ${OUTPUT_FILE} (${SIZE})"
echo "Verify it with: ./scripts/restore.sh ${OUTPUT_FILE} <verification-database-name>"
