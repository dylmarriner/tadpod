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

1. Back up PostgreSQL and verify that the backup can be read.
2. Build the image from the selected commit.
3. Run `pnpm db:migrate` once.
4. Start the API and verify `/health`.
5. Start the worker.
6. Start the web application.
7. Sign in and verify branding, users, roles, and the audit log.
8. Remove `SEED_ADMIN_PASSWORD` from the runtime environment after first seed.

## Backup

```bash
pg_dump --format=custom --no-owner --file=tadpods-$(date +%F).dump "$DATABASE_URL"
```

Test restoration on a separate database:

```bash
createdb tadpods_restore_test
pg_restore --clean --if-exists --no-owner --dbname=tadpods_restore_test tadpods-YYYY-MM-DD.dump
```

A backup that has never been restored is a comforting theory, not a recovery plan.
