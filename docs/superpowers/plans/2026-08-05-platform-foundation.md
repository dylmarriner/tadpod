# TADPODS Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable, tested TADPODS platform foundation with a TypeScript monorepo, PostgreSQL persistence, authentication, configurable roles and permissions, auditing, document numbering, brand settings, a responsive web shell, local infrastructure, and CI.

**Architecture:** Use a pnpm workspace and modular monolith. `apps/web` contains the Next.js interface, `apps/api` contains the NestJS/Fastify API, and focused packages contain domain logic, database access, contracts, authentication helpers, UI primitives, document rendering, configuration, and test support. PostgreSQL is the source of truth; posted or security-sensitive operations run inside transactions.

**Tech Stack:** Node.js 24, TypeScript 5, pnpm 10, Next.js 16, React 19, NestJS 11 with Fastify, PostgreSQL 17, Prisma 6, Zod, Argon2id, jose, Vitest, Testing Library, Supertest, Playwright, Docker Compose, Mailpit, MinIO.

## Global Constraints

- The default and visible product brand is `TADPODS` on every screen, document, email, PDF, notification, favicon, and metadata surface.
- The first deployment is one legal entity, default currency NZD, default tax model New Zealand GST, with configurable rates.
- Money and quantities use decimal-safe types; never JavaScript binary floating-point arithmetic for persisted business calculations.
- Posted financial and stock records will be immutable; corrections will use reversals in later phases.
- Authentication secrets never enter client bundles, logs, fixtures, or source control.
- Database writes that affect security, numbering, idempotency, or audit history use PostgreSQL transactions and constraints.
- The interface uses plain operational language and exposes one obvious next action.
- The application is desktop-first, tablet-friendly, and mobile-usable.
- Negative stock is disabled by default.
- The RELX image supplied with the brief is not used as a logo or product asset.
- No placeholder pages, fake API responses, `TODO`, or `FIXME` markers may be committed.

---

## File Map

```text
apps/api/                    NestJS HTTP API and integration tests
apps/web/                    Next.js interface and component tests
apps/worker/                 PostgreSQL-backed job worker entrypoint
packages/auth/               Password hashing, session-token and permission helpers
packages/config/             Validated environment configuration
packages/contracts/          Shared Zod schemas and API DTO types
packages/database/           Prisma client, schema, migration and seed
packages/documents/          TADPODS-branded document and email layout primitives
packages/domain/             Pure domain identifiers, money and status primitives
packages/test-support/       Deterministic fixtures and test helpers
packages/ui/                 TADPODS design tokens and reusable components
infra/                       Local infrastructure configuration
.github/workflows/           Verification workflow
```

### Task 1: Workspace, quality gates, and shared configuration

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.npmrc`, `.env.example`
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/index.ts`, `packages/config/src/env.ts`, `packages/config/src/env.test.ts`

**Interfaces:**
- Produces: `loadEnvironment(source: NodeJS.ProcessEnv): AppEnvironment` and the `AppEnvironment` type.

- [ ] **Step 1: Create the workspace manifests and strict TypeScript configuration.**

```json
{
  "name": "tadpods",
  "private": true,
  "packageManager": "pnpm@10.15.0",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev --parallel",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

- [ ] **Step 2: Write the failing environment validation tests.**

```ts
import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './env';

describe('loadEnvironment', () => {
  it('applies TADPODS development defaults', () => {
    expect(loadEnvironment({ NODE_ENV: 'test' })).toMatchObject({
      appName: 'TADPODS',
      defaultCurrency: 'NZD',
      negativeStockEnabled: false,
    });
  });

  it('rejects a short authentication secret', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production', AUTH_SECRET: 'short' })).toThrow();
  });
});
```

- [ ] **Step 3: Run `pnpm --filter @tadpods/config test`; expect failure because `loadEnvironment` does not exist.**
- [ ] **Step 4: Implement `loadEnvironment` with Zod, exact defaults, URL validation, booleans parsed from strings, and production secret validation.**
- [ ] **Step 5: Run config tests and `pnpm typecheck`; expect both to pass.**
- [ ] **Step 6: Commit with `git commit -m "chore: establish TADPODS workspace"`.**

### Task 2: Domain primitives and shared contracts

**Files:**
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`
- Create: `packages/domain/src/index.ts`, `packages/domain/src/money.ts`, `packages/domain/src/money.test.ts`, `packages/domain/src/ids.ts`, `packages/domain/src/status.ts`
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`, `packages/contracts/src/auth.ts`, `packages/contracts/src/brand.ts`, `packages/contracts/src/common.ts`

**Interfaces:**
- Produces: `Money.from(value, currency)`, `Money.add`, `Money.subtract`, `Money.allocate`, `UserId`, `RoleId`, `PermissionKey`, `loginRequestSchema`, `brandSettingsSchema`.

- [ ] **Step 1: Write tests proving decimal-safe addition, currency mismatch rejection, and deterministic remainder allocation.**

```ts
it('allocates cents without losing value', () => {
  const parts = Money.from('10.00', 'NZD').allocate(3);
  expect(parts.map(String)).toEqual(['3.34 NZD', '3.33 NZD', '3.33 NZD']);
});
```

- [ ] **Step 2: Run the domain test and verify it fails because `Money` is missing.**
- [ ] **Step 3: Implement `Money` using integer minor units backed by `bigint`; reject mixed currencies and more than two fractional digits for NZD.**
- [ ] **Step 4: Add branded UUID types and permission/status unions without runtime casts leaking outside constructors.**
- [ ] **Step 5: Add Zod request/response schemas for login, session user, brand settings, pagination, validation errors, and health responses.**
- [ ] **Step 6: Run package tests and type checks; commit with `git commit -m "feat: add domain primitives and contracts"`.**

### Task 3: PostgreSQL schema, Prisma client, migration, and seed

**Files:**
- Create: `packages/database/package.json`, `packages/database/tsconfig.json`, `packages/database/src/index.ts`, `packages/database/src/client.ts`, `packages/database/src/transaction.ts`
- Create: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/202608050001_foundation/migration.sql`, `packages/database/prisma/seed.ts`
- Create: `packages/database/src/schema.integration.test.ts`

**Interfaces:**
- Produces: `database`, `withTransaction<T>(operation)`, and Prisma models `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshSession`, `AuditLog`, `IdempotencyKey`, `DocumentSequence`, `BrandSettings`, `SystemSettings`, `Attachment`, `OutboxEvent`.

- [ ] **Step 1: Write the integration test that applies migrations and asserts unique user email, unique permission key, one active brand settings row, and atomic sequence increments.**
- [ ] **Step 2: Run the integration test against PostgreSQL; expect failure because the schema is absent.**
- [ ] **Step 3: Define Prisma models with UUID primary keys, UTC timestamps, foreign keys, composite unique constraints, optimistic `version` fields, and indexes for active sessions and audit lookup.**
- [ ] **Step 4: Add SQL constraints Prisma cannot express, including non-empty document prefixes, positive sequence values, fixed singleton keys, and immutable audit event payload structure.**
- [ ] **Step 5: Seed TADPODS brand settings, all eight named roles, permission keys, one development administrator, document sequences, NZD system settings, and GST rates of 15% and 0%.**
- [ ] **Step 6: Run `prisma validate`, migration tests, and the seed twice to prove idempotency.**
- [ ] **Step 7: Commit with `git commit -m "feat: add foundation database schema"`.**

### Task 4: Authentication, sessions, and permission policies

**Files:**
- Create: `packages/auth/package.json`, `packages/auth/tsconfig.json`
- Create: `packages/auth/src/index.ts`, `packages/auth/src/password.ts`, `packages/auth/src/password.test.ts`, `packages/auth/src/token.ts`, `packages/auth/src/token.test.ts`, `packages/auth/src/permissions.ts`, `packages/auth/src/permissions.test.ts`

**Interfaces:**
- Produces: `hashPassword`, `verifyPassword`, `issueAccessToken`, `verifyAccessToken`, `createRefreshToken`, `hashRefreshToken`, `hasPermission`, `requirePermission`.

- [ ] **Step 1: Write tests for Argon2id verification, token expiry and issuer checks, refresh-token hashing, wildcard administrator permissions, and explicit denial.**
- [ ] **Step 2: Run tests and confirm failure because implementations are missing.**
- [ ] **Step 3: Implement password hashing using Argon2id with memory and iteration parameters suitable for interactive login.**
- [ ] **Step 4: Implement fifteen-minute signed access tokens with `sub`, `sid`, `permissions`, `iss=tadpods`, and `aud=tadpods-web`; use 256-bit random refresh tokens stored only as SHA-256 hashes.**
- [ ] **Step 5: Implement permission matching with exact keys and `*`; default to deny.**
- [ ] **Step 6: Run tests and commit with `git commit -m "feat: add secure authentication primitives"`.**

### Task 5: NestJS API foundation

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/src/common/http-error.filter.ts`, `apps/api/src/common/request-id.hook.ts`, `apps/api/src/common/auth.guard.ts`, `apps/api/src/common/permission.decorator.ts`, `apps/api/src/common/permission.guard.ts`
- Create: `apps/api/src/modules/health/*`, `apps/api/src/modules/auth/*`, `apps/api/src/modules/brand/*`, `apps/api/src/modules/users/*`, `apps/api/src/modules/audit/*`, `apps/api/src/modules/sequences/*`
- Create: `apps/api/test/api.integration.test.ts`

**Interfaces:**
- Produces HTTP endpoints: `GET /health`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET/PATCH /brand`, `GET/POST/PATCH /users`, `GET /roles`, `PATCH /roles/:id/permissions`, `GET /audit`, `POST /document-sequences/:key/next`.

- [ ] **Step 1: Write Supertest cases for health, successful login, invalid credentials, refresh rotation, logout revocation, authenticated session lookup, permission denial, brand update auditing, and atomic document numbering.**
- [ ] **Step 2: Run the API integration suite; expect failure because the app does not exist.**
- [ ] **Step 3: Bootstrap NestJS on Fastify with Helmet, CORS allow-list, secure cookie parsing, request IDs, structured JSON errors, and body-size limits.**
- [ ] **Step 4: Implement login and refresh rotation in transactions; store refresh hashes, revoke used sessions, and never return password hashes or refresh hashes.**
- [ ] **Step 5: Implement role and permission administration guarded by `admin.users` and `admin.roles`; reject removal of the final active administrator.**
- [ ] **Step 6: Implement brand settings, audit lookup, and sequence endpoints with audit events and idempotency support.**
- [ ] **Step 7: Run integration tests and commit with `git commit -m "feat: add TADPODS API foundation"`.**

### Task 6: TADPODS design system and web application shell

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`, `packages/ui/src/tokens.css`, `packages/ui/src/components/*`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/nav.tsx`, `apps/web/src/components/command-menu.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/session.ts`
- Create: `apps/web/src/components/app-shell.test.tsx`

**Interfaces:**
- Produces: TADPODS colour/type/spacing tokens, `Button`, `Badge`, `Card`, `Field`, `DataTable`, `ProgressSteps`, `EmptyState`, `AppShell`, authenticated API client, and navigation model.

- [ ] **Step 1: Write component tests asserting the TADPODS wordmark, eight top-level navigation sections, keyboard-accessible skip link, active state, mobile menu, and command-menu shortcut.**
- [ ] **Step 2: Run tests and confirm failure because components are absent.**
- [ ] **Step 3: Implement a restrained charcoal, white, and teal visual system with high contrast, visible focus states, 44-pixel minimum touch targets, and configurable logo/brand variables.**
- [ ] **Step 4: Implement the shared shell with Dashboard, Sales, Purchasing, Inventory, Customers, Suppliers, Reports, and Administration only.**
- [ ] **Step 5: Implement a command menu containing real navigation actions and document creation shortcuts exposed only when permissions allow.**
- [ ] **Step 6: Run tests, accessibility checks, and commit with `git commit -m "feat: add TADPODS application shell"`.**

### Task 7: Login, dashboard, and administration screens

**Files:**
- Create: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/(authenticated)/layout.tsx`, `apps/web/src/app/(authenticated)/dashboard/page.tsx`
- Create: `apps/web/src/app/(authenticated)/administration/branding/page.tsx`, `apps/web/src/app/(authenticated)/administration/users/page.tsx`, `apps/web/src/app/(authenticated)/administration/roles/page.tsx`, `apps/web/src/app/(authenticated)/administration/audit/page.tsx`
- Create: `apps/web/src/features/auth/login-form.tsx`, `apps/web/src/features/dashboard/foundation-dashboard.tsx`, `apps/web/src/features/admin/*`
- Create: `apps/web/e2e/auth-admin.spec.ts`

**Interfaces:**
- Consumes the Task 5 API and Task 6 components.
- Produces a usable login flow and administration workflows backed by real records.

- [ ] **Step 1: Write Playwright tests for login, invalid-login feedback, protected-route redirect, logout, changing the brand display name, creating a user, assigning a role, changing permissions, and viewing the resulting audit event.**
- [ ] **Step 2: Run the E2E test and verify it fails because routes are absent.**
- [ ] **Step 3: Implement server-rendered session checks and the login form using secure cookies; preserve the intended destination after login.**
- [ ] **Step 4: Implement the foundation dashboard with live cards for users, active sessions, pending outbox events, failed jobs, and recent audit activity; each card links to its records.**
- [ ] **Step 5: Implement branding, users, roles, and audit screens with searchable tables, inline validation, saved query-string filters, clear empty states, and guarded actions.**
- [ ] **Step 6: Run component and E2E tests; commit with `git commit -m "feat: add login dashboard and administration"`.**

### Task 8: Worker, document primitives, local infrastructure, CI, and guides

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/main.ts`, `apps/worker/src/outbox-worker.ts`, `apps/worker/src/outbox-worker.test.ts`
- Create: `packages/documents/package.json`, `packages/documents/tsconfig.json`, `packages/documents/src/index.ts`, `packages/documents/src/brand-context.ts`, `packages/documents/src/email-layout.tsx`, `packages/documents/src/pdf-theme.ts`, `packages/documents/src/documents.test.tsx`
- Create: `docker-compose.yml`, `infra/postgres/init.sql`, `infra/minio/create-bucket.sh`, `Dockerfile`, `.dockerignore`
- Create: `.github/workflows/verify.yml`, `README.md`, `docs/development.md`, `docs/deployment.md`, `docs/administrator-guide.md`, `docs/end-user-guide.md`

**Interfaces:**
- Produces: an outbox worker with retry/dead-letter behaviour, shared TADPODS document branding context, and documented development/deployment commands.

- [ ] **Step 1: Write tests proving outbox claims are mutually exclusive, retries use bounded exponential delay, permanently failed events retain their payload and error, and generated email/PDF metadata contains TADPODS branding.**
- [ ] **Step 2: Run tests and verify failure because worker and document primitives are missing.**
- [ ] **Step 3: Implement PostgreSQL-backed outbox polling using `FOR UPDATE SKIP LOCKED`, attempt counters, next-attempt timestamps, and a terminal failed state.**
- [ ] **Step 4: Implement reusable branded email and PDF theme primitives fed by database brand settings, with TADPODS defaults.**
- [ ] **Step 5: Add Docker services for PostgreSQL 17, MinIO, Mailpit, API, web, and worker with health checks, named volumes, and no embedded secrets.**
- [ ] **Step 6: Add CI on Node.js 24 with frozen dependency installation, format/lint/typecheck/unit/integration/build steps, PostgreSQL service, migration verification, and Playwright smoke tests.**
- [ ] **Step 7: Write exact setup, migration, seed, backup, restore, first-admin, user/role, branding, and troubleshooting instructions.**
- [ ] **Step 8: Run `pnpm verify`, `docker compose config`, migration reset/seed, and Playwright; commit with `git commit -m "chore: complete platform foundation"`.**

## Completion Gate

The phase is complete only when:

1. `pnpm verify` passes from a clean checkout.
2. A fresh PostgreSQL database migrates and seeds successfully twice.
3. The seeded administrator can log in, log out, refresh a session, edit branding, create a user, assign a role, and view the audit trail.
4. Unauthorized users receive consistent 403 responses and hidden interface actions.
5. Document sequence requests remain unique under concurrent integration tests.
6. Docker Compose starts PostgreSQL, MinIO, Mailpit, API, web, and worker with passing health checks.
7. GitHub Actions passes on Node.js 24.
8. No `TODO`, `FIXME`, placeholder API response, default framework branding, RELX asset, or unbranded user-facing output exists.