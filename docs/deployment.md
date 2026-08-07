# TADPODS Deployment Guide

## Minimum production shape

Run PostgreSQL on durable encrypted storage. Run API, web and worker as separate processes from the same release image. Use S3-compatible object storage for attachments and an authenticated SMTP relay. Terminate TLS at a reverse proxy or load balancer.

## Required secrets

- `DATABASE_URL`
- `AUTH_SECRET`, at least 32 random characters
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `SEED_ADMIN_PASSWORD` for first deployment only

Do not put production values in Git, Compose files, images, support tickets, or screenshots.

## Release sequence

1. Back up PostgreSQL and verify the backup restores (see Backup below).
2. Build the image from the selected commit.
3. Run `pnpm db:migrate` once.
4. Start the API. Verify `/health` (process is up) and then `/ready` (database is reachable) —
   point your orchestrator's liveness probe at `/health` and readiness probe at `/ready`; only
   `/ready` should gate traffic, so a slow migration or a database blip doesn't get mistaken for
   a crashed process and restarted.
5. Start the worker.
6. Start the web application.
7. Sign in and verify branding, users, roles, and the audit log.
8. Remove `SEED_ADMIN_PASSWORD` from the runtime environment after first seed.

Rollback: redeploy the previous image tag against the same database. Prisma migrations in this
codebase are additive (new tables/columns), so rolling back the application does not require
rolling back the schema — the previous code version simply does not read the newer columns.
Never manually reverse a migration against a database with live data; if a migration genuinely
needs undoing, write and review a new forward migration.

## Backup and restore

`scripts/backup.sh` and `scripts/restore.sh` wrap the `pg_dump`/`pg_restore` commands below with
the connection-string handling and verification query already worked out — use them directly
rather than re-deriving the commands by hand.

```bash
# Back up (writes ./backups/tadpods-<timestamp>.dump by default)
DATABASE_URL="$DATABASE_URL" ./scripts/backup.sh

# Restore into a NEW verification database — never directly into the live one
DATABASE_ADMIN_URL="postgresql://tadpods:<password>@<host>:5432/postgres" \
  ./scripts/restore.sh ./backups/tadpods-<timestamp>.dump tadpods_restore_test
```

`restore.sh` prints row counts for a handful of core tables (`User`, `Product`, `StockMovement`,
`SalesOrder`, `CustomerInvoice`) after restoring — compare them against the source database to
confirm the restore is complete, not just "didn't error."

**Version gotcha, confirmed against this project's own dev database**: `pg_dump`/`pg_restore`
must be the same or a newer major version than the target PostgreSQL server, or `pg_dump` refuses
to run (`aborting because of server version mismatch`). If your workstation's client tools are
older than the server (common when the server is upgraded before local tooling), run the backup
from a container or host that has matching-version tools installed — for example
`docker exec <postgres-container> pg_dump ...` — rather than the host's own `pg_dump`.

Both scripts also strip Prisma's `?schema=public` query parameter from `DATABASE_URL` before
handing it to `pg_dump`/`psql`, which reject that parameter outright.

A backup that has never been restored is a comforting theory, not a recovery plan. These scripts
were run end-to-end against this project's dev database while writing this guide: backed up,
restored into a fresh database, and confirmed identical row counts across `User`, `Product`,
`StockMovement`, `SalesOrder`, and `CustomerInvoice`.

## Rate limiting

The API applies a global rate limit (600 requests/minute per IP, `/health` and `/ready` excluded)
via `@fastify/rate-limit`. If a legitimate integration needs a higher ceiling, raise the limit in
`apps/api/src/main.ts` rather than exempting specific routes — an exemption is easy to forget to
remove.
