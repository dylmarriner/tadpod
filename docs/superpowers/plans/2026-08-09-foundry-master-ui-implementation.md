# Foundry Master UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shipped TADPODS visual layer with the approved Foundry master UI while preserving existing routes, data flow, permissions and business behaviour.

**Architecture:** Foundry is implemented at the shared UI package and application-shell layers first so every existing route inherits the same token, control, table, card and navigation system. Route-specific business logic stays untouched. The shell becomes the Foundry spine/deck/ledger layout, with real navigation and permission data only; no fabricated operational metrics are introduced.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Vitest, Playwright, pnpm/Turbo.

## Global Constraints

- Foundry is the sole master design system for TADPODS.
- Preserve existing business logic and route contracts.
- Use warm graphite surfaces, flux amber primary signal, live mint confirmation signal, steel metadata, chamfered geometry and mono telemetry from the supplied Foundry package.
- Do not introduce mock business data, placeholder records or fake operational counts.
- Keep touch targets at least 44px and respect `prefers-reduced-motion`.
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

- [ ] **Step 1: Write failing component tests** covering Foundry tone variants, page-header kicker rendering, alert semantics, command-palette dialog semantics, and existing component compatibility.
- [ ] **Step 2: Run `pnpm --filter @tadpods/ui test`** and confirm the new tests fail before implementation.
- [ ] **Step 3: Implement the Foundry primitives** with class-based styling hooks so the web app owns runtime CSS while route code remains small.
- [ ] **Step 4: Run `pnpm --filter @tadpods/ui test`** and confirm the full package test suite passes.
- [ ] **Step 5: Commit** with `feat(ui): establish Foundry component primitives`.

### Task 2: Foundry token and surface layer

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: class names emitted by `@tadpods/ui` and existing route/form classes already present in `apps/web/src`.
- Produces: Foundry tokens, graphite canvas, flux/live/steel signals, chamfered controls/panels, table treatment, loading/empty/error states, responsive layout utilities and compatibility styling for existing route markup.

- [ ] **Step 1: Add CSS coverage expectations** to the shell/UI tests for required Foundry class hooks and keep existing accessibility assertions.
- [ ] **Step 2: Replace legacy light SaaS tokens** with the Foundry token contract from the supplied package.
- [ ] **Step 3: Restyle existing `.button`, `.badge`, `.card`, `.field`, `.input`, `.progress-steps`, `.empty-state`, `.table-wrap`, `.page-header`, `.grid`, `.login-*` and form utility classes without changing route business code.
- [ ] **Step 4: Add responsive rules** for desktop, tablet and mobile, including horizontal data overflow and reduced motion.
- [ ] **Step 5: Commit** with `feat(web): apply Foundry tokens and surfaces`.

### Task 3: Foundry application shell

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/app-shell.test.tsx`

**Interfaces:**
- Consumes: `user`, `brand`, current pathname, router, permission model, `browserApi('/auth/logout')`.
- Produces: Foundry spine navigation, command deck, contextual ledger, mobile bottom navigation and reusable command palette.

- [ ] **Step 1: Extend the AppShell test** to require domain codes (`DB`, `SL`, `PU`, `IN`, `AC`, `RP`, `AD`), command-line semantics, context ledger, permission-aware navigation and the existing skip link.
- [ ] **Step 2: Run the web component test** and confirm it fails against the legacy sidebar shell.
- [ ] **Step 3: Implement the shell** using real routes and permissions. Domain flyouts expose existing sub-pages. The ledger may show current module, signed-in user, permission count and keyboard guidance, but must not fabricate stock, sales, event or activity counts.
- [ ] **Step 4: Promote Ctrl/Cmd+K to the shared `CommandPalette`** and ensure Escape closes it and command results remain permission-aware.
- [ ] **Step 5: Run web component tests** and confirm the shell test passes.
- [ ] **Step 6: Commit** with `feat(web): replace app shell with Foundry console`.

### Task 4: Foundry login and route compatibility

**Files:**
- Modify only if required by tests: `apps/web/src/components/login-form.tsx`
- Modify only if required by tests: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: existing login form API and route behavior.
- Produces: Foundry sign-in composition and consistent styling for every existing route through shared class contracts.

- [ ] **Step 1: Verify login markup against Foundry class contracts** and add a focused rendering test if markup changes are required.
- [ ] **Step 2: Implement the Foundry sign-in surface** using only real branding and existing authentication behavior.
- [ ] **Step 3: Search existing route components for legacy classes** and ensure all remain covered by compatibility styles; do not rewrite business forms merely for cosmetics.
- [ ] **Step 4: Commit** with `feat(web): complete Foundry login and route compatibility`.

### Task 5: Verification and review

**Files:**
- Modify tests only when a genuine regression is found.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a branch that passes repository verification and is ready for review/merge.

- [ ] **Step 1: Run `pnpm lint`** and resolve Foundry-related failures.
- [ ] **Step 2: Run `pnpm typecheck`** and resolve Foundry-related failures.
- [ ] **Step 3: Run `pnpm test`** and resolve regressions.
- [ ] **Step 4: Run `pnpm build`** and resolve production-build failures.
- [ ] **Step 5: Run the existing Playwright smoke tests** where CI services support them.
- [ ] **Step 6: Open a pull request** with the Foundry migration summary, verification evidence and any remaining non-UI backend wiring explicitly excluded from scope.
