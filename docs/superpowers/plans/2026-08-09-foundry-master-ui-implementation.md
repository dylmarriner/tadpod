# Foundry Master UI Implementation Plan

> **Execution status:** Foundry implementation is complete on `feat/foundry-master-ui`. Focused UI verification passes. Full-repository typecheck and downstream E2E remain blocked by the pre-existing `@tadpods/api` resolution failure for `@tadpods/documents`.

**Goal:** Replace the shipped TADPODS visual layer with the approved Foundry master UI while preserving existing routes, data flow, permissions and business behaviour.

**Architecture:** Foundry is implemented at the shared UI package and application-shell layers first so every existing route inherits the same token, control, table, card and navigation system. Route-specific business logic stays untouched. The shell becomes the Foundry spine/deck/ledger layout, with real navigation and permission data only; no fabricated operational metrics are introduced.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Vitest, Playwright, pnpm/Turbo.

## Global Constraints

- Foundry is the sole master design system for TADPODS.
- Preserve existing business logic and route contracts.
- Use warm graphite surfaces, flux amber primary signal, live mint confirmation signal, steel metadata, chamfered geometry and mono telemetry from the supplied Foundry package.
- Do not introduce mock business data, placeholder records or fake operational counts.
- Keep interactive touch targets at least 44px and respect `prefers-reduced-motion`; runtime overrides are enforced in `apps/web/src/app/foundry-a11y.css`.
- Permissions must continue to determine visible navigation and actions.
- Existing routes must remain usable throughout the migration.

---

### Task 1: Foundry shared UI primitives

**Files:**
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/index.test.tsx`

**Interfaces:**
- Consumes: React intrinsic element props and existing `Button`, `Badge`, `Card`, `Field`, `TextInput`, `SelectInput`, `ProgressSteps`, `EmptyState`, `DataTable` contracts.
- Produces: backwards-compatible versions of those components plus `PageHeader`, `Alert`, `Skeleton`, `Tabs`, and `CommandPalette`.

- [x] **Step 1: Write failing component tests** covering Foundry tone variants, page-header kicker rendering, alert semantics, command-palette dialog semantics, and existing component compatibility.
- [x] **Step 2: Run `pnpm --filter @tadpods/ui test`** and confirm the new tests fail before implementation. The focused Foundry workflow produced the expected red result before the primitives existed.
- [x] **Step 3: Implement the Foundry primitives** with class-based styling hooks so the web app owns runtime CSS while route code remains small.
- [x] **Step 4: Run `pnpm --filter @tadpods/ui test`** and confirm the full package test suite passes.
- [x] **Step 5: Commit** the Foundry component primitive implementation.

### Task 2: Foundry token and surface layer

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Add: `apps/web/src/app/foundry-forms.css`
- Add: `apps/web/src/app/foundry-responsive.css`
- Add: `apps/web/src/app/foundry-a11y.css`

**Interfaces:**
- Consumes: class names emitted by `@tadpods/ui` and existing route/form classes already present in `apps/web/src`.
- Produces: Foundry tokens, graphite canvas, flux/live/steel signals, chamfered controls/panels, table treatment, loading/empty/error states, responsive layout utilities and compatibility styling for existing route markup.

- [x] **Step 1: Add CSS/shell coverage expectations** to the shell/UI tests for required Foundry class hooks and keep accessibility assertions.
- [x] **Step 2: Replace legacy light SaaS tokens** with the Foundry token contract from the supplied package.
- [x] **Step 3: Restyle existing controls, cards, fields, inputs, progress, empty states, tables, page headers, grids, login and route-owned business forms without changing business behaviour.
- [x] **Step 4: Add responsive rules** for desktop, tablet and mobile, including active-domain mobile subnavigation, contained operational tables, 44px interactive targets and reduced motion.
- [x] **Step 5: Commit** the Foundry token, surface and compatibility layers.

### Task 3: Foundry application shell

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/app-shell.test.tsx`

**Interfaces:**
- Consumes: `user`, `brand`, current pathname, router, permission model, `browserApi('/auth/logout')`.
- Produces: Foundry spine navigation, command deck, contextual ledger, mobile bottom navigation, active-domain mobile subnavigation and reusable command palette.

- [x] **Step 1: Extend the AppShell test** to require domain codes (`DB`, `SL`, `PU`, `IN`, `AC`, `RP`, `AD`), command-line semantics, context ledger, permission-aware navigation, Purchasing receipts and the existing skip link.
- [x] **Step 2: Run the web component test** and confirm it fails against the legacy sidebar shell.
- [x] **Step 3: Implement the shell** using real routes and permissions without fabricated stock, sales, event or activity counts.
- [x] **Step 4: Promote Ctrl/Cmd+K to the shared `CommandPalette`** with Escape/arrow/Enter navigation and assistive-technology announcement of the active result.
- [x] **Step 5: Run web component tests** and confirm the shell tests pass.
- [x] **Step 6: Commit** the Foundry console shell and responsive navigation.

### Task 4: Foundry login and route compatibility

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: major authenticated route hubs/registers
- Preserve existing business form mutation logic while applying Foundry shared/compatibility surfaces.

**Interfaces:**
- Consumes: existing authentication, route APIs and business workflow behavior.
- Produces: Foundry sign-in composition and consistent styling for the current application surface.

- [x] **Step 1: Verify login markup against Foundry class contracts.** Existing authentication logic required no behavioral rewrite.
- [x] **Step 2: Implement the Foundry sign-in surface** using only real branding and existing authentication behavior.
- [x] **Step 3: Audit current route components for legacy presentation patterns** and cover route-owned tables, fieldsets, product option lists and action rows through Foundry compatibility styling.
- [x] **Step 4: Migrate the major application hubs/registers** across dashboard, accounts, sales, purchasing, inventory, reports and administration.

### Task 5: Verification and review

**Files:**
- `.github/workflows/foundry-ui.yml`
- Tests and implementation files only where a genuine review issue was verified.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a review-ready Foundry branch with independently verifiable UI quality gates.

- [x] **Step 1: Run lint checks.** Foundry UI, contracts and web lint pass in the focused workflow; the full repository workflow also completed lint before reaching its unrelated API typecheck failure.
- [ ] **Step 2: Run full `pnpm typecheck`.** Foundry UI/web typecheck passes. Full repository typecheck is blocked by the pre-existing `@tadpods/api` failure to resolve `@tadpods/documents`.
- [x] **Step 3: Run UI/web tests** and resolve Foundry regressions.
- [x] **Step 4: Run the production web build** and resolve Foundry build failures.
- [ ] **Step 5: Run existing Playwright smoke tests.** Not reached by the full repository workflow because the pre-existing API typecheck fails first; no E2E success is claimed.
- [x] **Step 6: Open pull request #3** with the Foundry migration summary and verification evidence.
- [x] **Step 7: Review the PR** with Codex/CodeRabbit, verify findings against the current codebase, and apply the valid navigation, accessibility, CI-hardening and responsive fixes.
