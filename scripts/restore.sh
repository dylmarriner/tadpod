#!/usr/bin/env bash
# Restore a TADPODS backup into a database, creating it first if it does not exist.
#
# Usage:
#   DATABASE_ADMIN_URL=postgresql://user:pass@host:5432/postgres \
#     ./scripts/restore.sh <dump-file> <target-database-name>
#
# DATABASE_ADMIN_URL must point at a database the user can CREATE DATABASE from
# (conventionally the server's default "postgres" database) — restoring into a
# fresh database, never the live one directly, is what makes this a genuine
# restore test rather than a destructive overwrite of production data.
#
# Requires: pg_restore, createdb (or psql), matching the target server's major
# version or newer.
set -euo pipefail

DUMP_FILE="${1:?Usage: restore.sh <dump-file> <target-database-name>}"
TARGET_DB="${2:?Usage: restore.sh <dump-file> <target-database-name>}"
: "${DATABASE_ADMIN_URL:?Set DATABASE_ADMIN_URL to an admin connection string (database name is ignored; used only to create TARGET_DB)}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

# Prisma-style connection strings carry a `?schema=public` query parameter libpq tools
# (psql, pg_dump, pg_restore) do not understand — strip it before using the URL.
ADMIN_URL="${DATABASE_ADMIN_URL%%\?*}"

echo "Creating database ${TARGET_DB} (if it does not already exist) ..."
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'" | grep -q 1 \
  || psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\""

TARGET_URL="$(echo "$ADMIN_URL" | sed -E "s#/[a-zA-Z0-9_-]*\$#/${TARGET_DB}#")"

echo "Restoring ${DUMP_FILE} into ${TARGET_DB} ..."
echo "(pg_restore must be the same or a newer major version than the target server — check with: pg_restore --version)"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${TARGET_URL}" "${DUMP_FILE}"

echo "Restore complete. Verifying row counts on a few core tables ..."
psql "${TARGET_URL}" -v ON_ERROR_STOP=1 -c "
  SELECT 'User' AS table, count(*) FROM \"User\"
  UNION ALL SELECT 'Product', count(*) FROM \"Product\"
  UNION ALL SELECT 'StockMovement', count(*) FROM \"StockMovement\"
  UNION ALL SELECT 'SalesOrder', count(*) FROM \"SalesOrder\"
  UNION ALL SELECT 'CustomerInvoice', count(*) FROM \"CustomerInvoice\";
"
echo "Restore verified into ${TARGET_DB}. Drop it when done: DROP DATABASE \"${TARGET_DB}\";"
