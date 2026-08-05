# TADPODS Development Guide

## Requirements

- Linux, macOS, or WSL2
- Node.js 24 or newer supported LTS
- pnpm 10.15.0 through Corepack
- PostgreSQL 17
- Docker Compose for the supplied local services

## First setup

```bash
corepack enable
cp .env.example .env
# Replace POSTGRES_PASSWORD, AUTH_SECRET, MINIO_ROOT_PASSWORD and SEED_ADMIN_PASSWORD.
pnpm install --no-frozen-lockfile
docker compose up -d postgres minio minio-init mailpit
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Web: `http://localhost:3000`  
API health: `http://localhost:4000/health`  
Mailpit: `http://localhost:8025`  
MinIO console: `http://localhost:9001`

## Database changes

Edit `packages/database/prisma/schema.prisma`, then create a migration from a development database:

```bash
pnpm --filter @tadpods/database exec prisma migrate dev --name descriptive_change
pnpm db:generate
pnpm verify
```

Never edit a migration that has run in a shared environment. Add a new migration.

## Tests

```bash
pnpm test
pnpm test:e2e
pnpm verify
```

Integration and end-to-end tests require a migrated and seeded PostgreSQL database. Tests must not depend on execution order or local clock time.
