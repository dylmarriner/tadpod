# TADPODS

TADPODS is a focused business-management platform for customers, suppliers, products, stock, purchasing, sales, invoices, payments, backorders, and account balances.

This repository currently contains the production foundation: the monorepo, PostgreSQL schema, authentication and session rotation, configurable roles and permissions, audit history, document numbering, branding settings, administration interface, outbox worker, document-branding primitives, Docker environment, tests, and CI.

## Quick start

1. Install Node.js 24 and pnpm 10.15.0.
2. Copy `.env.example` to `.env` and replace every password or secret.
3. Run `pnpm install --no-frozen-lockfile`.
4. Start PostgreSQL, MinIO and Mailpit with `docker compose up -d postgres minio minio-init mailpit`.
5. Run `pnpm db:migrate && pnpm db:seed`.
6. Run `pnpm dev`.
7. Open `http://localhost:3000`.

The development administrator defaults to `admin@tadpods.local`. Change the password value before seeding any shared environment.

## Verification

```bash
pnpm verify
pnpm test:e2e
```

See `docs/development.md`, `docs/deployment.md`, `docs/administrator-guide.md`, and `docs/end-user-guide.md` for operating instructions.
