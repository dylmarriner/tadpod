# GitHub Design Evidence: dylmarriner/tadpod

Source: https://github.com/dylmarriner/tadpod
Read method: git-clone
Local clone method: git clone
Ref: default branch
Repository paths discovered: 286
Snapshot files written: 47

## Intake Status

- This-device intake was used through local git or GitHub CLI.

## README (README.md)

```md
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

```

## Source Evidence Inventory

### Product docs and manifests

Use these to understand product purpose, dependency stack, scripts, and public naming.

- packages/config/package.json -> `context/github/dylmarriner-tadpod/files/packages/config/package.json` (source)
- packages/ui/package.json -> `context/github/dylmarriner-tadpod/files/packages/ui/package.json` (source)
- docs/superpowers/plans/README.md -> `context/github/dylmarriner-tadpod/files/docs/superpowers/plans/README.md` (source)
- apps/api/package.json -> `context/github/dylmarriner-tadpod/files/apps/api/package.json` (source)
- apps/web/package.json -> `context/github/dylmarriner-tadpod/files/apps/web/package.json` (source)
- apps/worker/package.json -> `context/github/dylmarriner-tadpod/files/apps/worker/package.json` (source)
- package.json -> `context/github/dylmarriner-tadpod/files/package.json` (source)
- packages/auth/package.json -> `context/github/dylmarriner-tadpod/files/packages/auth/package.json` (source)
- packages/contracts/package.json -> `context/github/dylmarriner-tadpod/files/packages/contracts/package.json` (source)
- packages/database/package.json -> `context/github/dylmarriner-tadpod/files/packages/database/package.json` (source)
- packages/documents/package.json -> `context/github/dylmarriner-tadpod/files/packages/documents/package.json` (source)
- packages/domain/package.json -> `context/github/dylmarriner-tadpod/files/packages/domain/package.json` (source)

### Brand assets and icons

Preserve source build/runtime paths: files under `build/` should be copied back into root `build/` with their original filenames, while non-build logos, avatars, or wordmarks can be copied into `assets/`. Reflect the preserved files in `preview/brand-assets.html`.

- apps/web/public/apple-touch-icon.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/apple-touch-icon.png` (binary asset)
- apps/web/public/icons/icon-192.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/icons/icon-192.png` (binary asset)
- apps/web/public/icons/icon-512.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/icons/icon-512.png` (binary asset)

### Theme, tokens, and styling

Extract concrete color, typography, spacing, radius, shadow, and theme-variable values from these files.

- apps/web/src/app/globals.css -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/globals.css` (source)
- packages/config/src/index.ts -> `context/github/dylmarriner-tadpod/files/packages/config/src/index.ts` (source)
- packages/config/tsconfig.json -> `context/github/dylmarriner-tadpod/files/packages/config/tsconfig.json` (source)

### App shell and navigation

Use these to recreate the product frame, navigation density, sidebars, window chrome, and layout rhythm.

- apps/web/src/app/layout.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/layout.tsx` (source)
- apps/web/src/app/(authenticated)/layout.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/layout.tsx` (source)
- apps/web/src/components/app-shell.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/components/app-shell.tsx` (source)
- apps/web/src/app/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/page.tsx` (source)
- apps/web/src/app/(authenticated)/administration/audit/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/audit/page.tsx` (source)
- apps/web/src/app/(authenticated)/administration/branding/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/branding/page.tsx` (source)
- apps/web/src/app/(authenticated)/administration/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/page.tsx` (source)
- apps/web/src/app/(authenticated)/administration/roles/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/roles/page.tsx` (source)
- apps/web/src/app/(authenticated)/administration/users/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/users/page.tsx` (source)
- apps/web/src/app/(authenticated)/customers/[id]/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/customers/id/page.tsx` (source)
- apps/web/src/app/(authenticated)/customers/[id]/statement/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/customers/id/statement/page.tsx` (source)
- apps/web/src/app/(authenticated)/customers/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/customers/page.tsx` (source)
- apps/web/src/app/(authenticated)/dashboard/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/dashboard/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/adjustments/error.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/error.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/adjustments/loading.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/loading.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/adjustments/new/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/new/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/adjustments/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/movements/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/movements/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/products/[id]/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/products/id/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/products/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/products/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/stock-counts/[id]/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/id/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/stock-counts/error.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/error.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/stock-counts/loading.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/loading.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/stock-counts/new/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/new/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/stock-counts/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/page.tsx` (source)
- apps/web/src/app/(authenticated)/inventory/transfers/error.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/transfers/error.tsx` (source)

### Reusable components

Use these to derive buttons, inputs, cards, dialogs, avatars, selectors, menus, and feedback states.

- apps/web/src/components/login-form.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/components/login-form.tsx` (source)
- packages/ui/src/index.tsx -> `context/github/dylmarriner-tadpod/files/packages/ui/src/index.tsx` (source)


## Files Inspected

- apps/web/src/app/layout.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/layout.tsx` (1498 bytes, git-clone)
- packages/config/package.json -> `context/github/dylmarriner-tadpod/files/packages/config/package.json` (494 bytes, git-clone)
- packages/ui/package.json -> `context/github/dylmarriner-tadpod/files/packages/ui/package.json` (646 bytes, git-clone)
- apps/web/src/app/globals.css -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/globals.css` (6991 bytes, git-clone)
- apps/web/src/app/(authenticated)/layout.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/layout.tsx` (762 bytes, git-clone)
- apps/web/public/apple-touch-icon.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/apple-touch-icon.png` (4803 bytes, git-clone, binary asset)
- apps/web/public/icons/icon-192.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/icons/icon-192.png` (4931 bytes, git-clone, binary asset)
- apps/web/public/icons/icon-512.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/icons/icon-512.png` (21341 bytes, git-clone, binary asset)
- apps/web/src/components/app-shell.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/components/app-shell.tsx` (5253 bytes, git-clone)
- apps/web/src/components/login-form.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/components/login-form.tsx` (1551 bytes, git-clone)
- packages/config/src/index.ts -> `context/github/dylmarriner-tadpod/files/packages/config/src/index.ts` (2624 bytes, git-clone)
- apps/web/src/app/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/page.tsx` (107 bytes, git-clone)
- packages/ui/src/index.tsx -> `context/github/dylmarriner-tadpod/files/packages/ui/src/index.tsx` (2488 bytes, git-clone)
- docs/superpowers/plans/README.md -> `context/github/dylmarriner-tadpod/files/docs/superpowers/plans/README.md` (1265 bytes, git-clone)
- apps/api/package.json -> `context/github/dylmarriner-tadpod/files/apps/api/package.json` (1226 bytes, git-clone)
- apps/web/package.json -> `context/github/dylmarriner-tadpod/files/apps/web/package.json` (655 bytes, git-clone)
- apps/worker/package.json -> `context/github/dylmarriner-tadpod/files/apps/worker/package.json` (484 bytes, git-clone)
- package.json -> `context/github/dylmarriner-tadpod/files/package.json` (872 bytes, git-clone)
- packages/auth/package.json -> `context/github/dylmarriner-tadpod/files/packages/auth/package.json` (524 bytes, git-clone)
- packages/contracts/package.json -> `context/github/dylmarriner-tadpod/files/packages/contracts/package.json` (470 bytes, git-clone)
- packages/database/package.json -> `context/github/dylmarriner-tadpod/files/packages/database/package.json` (870 bytes, git-clone)
- packages/documents/package.json -> `context/github/dylmarriner-tadpod/files/packages/documents/package.json` (657 bytes, git-clone)
- packages/domain/package.json -> `context/github/dylmarriner-tadpod/files/packages/domain/package.json` (454 bytes, git-clone)
- packages/config/tsconfig.json -> `context/github/dylmarriner-tadpod/files/packages/config/tsconfig.json` (189 bytes, git-clone)
- apps/web/src/app/(authenticated)/administration/audit/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/audit/page.tsx` (1182 bytes, git-clone)
- apps/web/src/app/(authenticated)/administration/branding/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/branding/page.tsx` (654 bytes, git-clone)
- apps/web/src/app/(authenticated)/administration/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/page.tsx` (1343 bytes, git-clone)
- apps/web/src/app/(authenticated)/administration/roles/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/roles/page.tsx` (1208 bytes, git-clone)
- apps/web/src/app/(authenticated)/administration/users/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/administration/users/page.tsx` (1631 bytes, git-clone)
- apps/web/src/app/(authenticated)/customers/[id]/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/customers/id/page.tsx` (6144 bytes, git-clone)
- apps/web/src/app/(authenticated)/customers/[id]/statement/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/customers/id/statement/page.tsx` (2684 bytes, git-clone)
- apps/web/src/app/(authenticated)/customers/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/customers/page.tsx` (2308 bytes, git-clone)
- apps/web/src/app/(authenticated)/dashboard/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/dashboard/page.tsx` (1712 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/adjustments/error.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/error.tsx` (440 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/adjustments/loading.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/loading.tsx` (144 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/adjustments/new/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/new/page.tsx` (1464 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/adjustments/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/adjustments/page.tsx` (3513 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/movements/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/movements/page.tsx` (3508 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/page.tsx` (1443 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/products/[id]/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/products/id/page.tsx` (4606 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/products/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/products/page.tsx` (3120 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/stock-counts/[id]/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/id/page.tsx` (2068 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/stock-counts/error.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/error.tsx` (441 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/stock-counts/loading.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/loading.tsx` (145 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/stock-counts/new/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/new/page.tsx` (1627 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/stock-counts/page.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/stock-counts/page.tsx` (2592 bytes, git-clone)
- apps/web/src/app/(authenticated)/inventory/transfers/error.tsx -> `context/github/dylmarriner-tadpod/files/apps/web/src/app/authenticated/inventory/transfers/error.tsx` (436 bytes, git-clone)

## Binary Assets Preserved

- apps/web/public/apple-touch-icon.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/apple-touch-icon.png`
- apps/web/public/icons/icon-192.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/icons/icon-192.png`
- apps/web/public/icons/icon-512.png -> `context/github/dylmarriner-tadpod/files/apps/web/public/icons/icon-512.png`

## Design-Relevant Excerpts

### apps/web/src/app/layout.tsx

```tsx
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { publicApi } from '../lib/server-api';
import { ServiceWorkerRegistration } from '../components/service-worker-registration';

export const metadata: Metadata = {
  title: { default: 'TADPODS', template: '%s | TADPODS' },
  description: 'TADPODS inventory, purchasing, sales and account management',
  applicationName: 'TADPODS',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TADPODS'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#111827'
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await publicApi<{ displayName: string; primaryColour: string; accentColour: string }>('/brand').catch(() => ({ displayName: 'TADPODS', primaryColour: '#0F766E', accentColour: '#14B8A6' }));
  return <html lang="en"><body style={{ '--brand': brand.primaryColour, '--accent': brand.accentColour } as React.CSSProperties}>
    <ServiceWorkerRegistration />
    {children}
  </body></html>;
}

```

### packages/config/package.json

```json
{
  "name": "@tadpods/config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "zod": "^4.0.14" },
  "devDependencies": { "vitest": "^3.2.4" }
}

```

### packages/ui/package.json

```json
{
  "name": "@tadpods/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "src/index.tsx",
  "exports": {
    ".": {
      "types": "./src/index.tsx",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "peerDependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": {
    "@types/react": "^19.1.9",
    "@types/react-dom": "^19.1.7",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "vitest": "^3.2.4"
  }
}

```

### apps/web/src/app/globals.css

```css
:root{--brand:#0f766e;--accent:#14b8a6;--ink:#111827;--muted:#64748b;--line:#dbe3ea;--surface:#fff;--canvas:#f4f7f8;--danger:#b42318;--warning:#b54708;--success:#067647;--radius:12px;--shadow:0 8px 30px rgba(15,23,42,.08);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--canvas)}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--canvas)}body{line-height:1.5}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:2px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.skip-link{position:fixed;left:1rem;top:-5rem;background:#fff;padding:.75rem 1rem;z-index:100;border-radius:8px}.skip-link:focus{top:1rem}.button{min-height:44px;border:0;border-radius:9px;padding:.65rem 1rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:.5rem}.button:disabled{cursor:not-allowed;opacity:.55}.button--primary{background:var(--brand);color:#fff}.button--secondary{background:#e8f5f3;color:#115e59}.button--danger{background:#fee4e2;color:var(--danger)}.badge{display:inline-flex;align-items:center;border-radius:999px;padding:.2rem .55rem;font-size:.78rem;font-weight:750;background:#eef2f6}.badge--success{background:#dcfae6;color:var(--success)}.badge--warning{background:#fef0c7;color:var(--warning)}.badge--danger{background:#fee4e2;color:var(--danger)}.badge--info{background:#d9eafd;color:#175cd3}.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}.card__header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.15rem;border-bottom:1px solid var(--line)}.card__header h2{font-size:1rem;margin:0}.card__body{padding:1.15rem}.field{display:grid;gap:.35rem}.field__label{font-weight:700;font-size:.9rem}.field__hint{font-size:.82rem;color:var(--muted)}.field__error{font-size:.82rem;color:var(--danger)}.input{width:100%;min-height:44px;border:1px solid #b8c4ce;border-radius:8px;padding:.6rem .7rem;background:#fff;color:var(--ink)}.input:focus{border-color:var(--b
...
```

### apps/web/src/app/(authenticated)/layout.tsx

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { publicApi, serverApi } from '../../lib/server-api';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await serverApi<{ user: { id: string; displayName: string; email: string; permissions: string[] } }>('/auth/me').catch(() => null);
  if (!session) redirect('/login');
  const brand = await publicApi<{ displayName: string; primaryColour: string; accentColour: string }>('/brand').catch(() => ({ displayName: 'TADPODS', primaryColour: '#0F766E', accentColour: '#14B8A6' }));
  return <AppShell user={session.user} brand={brand}>{children}</AppShell>;
}

```

### apps/web/src/components/app-shell.tsx

```tsx
'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Badge } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type User = { id: string; displayName: string; email: string; permissions: string[] };
type Brand = { displayName: string; primaryColour: string; accentColour: string };

const sections = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Sales', href: '/sales/orders', permission: 'sales.read' },
  { label: 'Backorders', href: '/sales/backorders', permission: 'sales.read' },
  { label: 'Invoicing', href: '/sales/invoices', permission: 'sales.read' },
  { label: 'Payments', href: '/sales/payments', permission: 'sales.read' },
  { label: 'Credits', href: '/sales/credits', permission: 'sales.read' },
  { label: 'Purchasing', href: '/purchasing/orders', permission: 'purchasing.read' },
  { label: 'Bills', href: '/purchasing/bills', permission: 'purchasing.read' },
  { label: 'Supplier payments', href: '/purchasing/payments', permission: 'purchasing.read' },
  { label: 'Supplier credits', href: '/purchasing/credits', permission: 'purchasing.read' },
  { label: 'Inventory', href: '/inventory', permission: 'inventory.read' },
  { label: 'Customers', href: '/customers', permission: 'customers.read' },
  { label: 'Suppliers', href: '/suppliers', permission: 'suppliers.read' },
  { label: 'Reports', enabled: false },
  { label: 'Administration', href: '/administration', permission: 'admin.users' }
] as const;

function allowed(user: User, permission?: string): boolean {
  return !permission || user.permissions.includes('*') || user.permissions.includes(permission);
}

export function AppShell({ user, brand, children }: { user: User; brand: Brand; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen((open) => !open); }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const actio
...
```

### apps/web/src/components/login-form.tsx

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Field, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await browserApi('/auth/login', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      const returnTo = searchParams.get('returnTo');
      router.replace(returnTo?.startsWith('/') ? returnTo : '/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed');
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={(event) => void submit(event)}>
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <Field label="Email address"><TextInput name="email" type="email" autoComplete="username" required /></Field>
    <Field label="Password"><TextInput name="password" type="password" autoComplete="current-password" required /></Field>
    <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to TADPODS'}</Button>
  </form>;
}

```

### packages/config/src/index.ts

```ts
import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

const rawEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().trim().min(1).default('TADPODS'),
  DATABASE_URL: z.string().url().default('postgresql://tadpods:tadpods@localhost:5432/tadpods?schema=public'),
  AUTH_SECRET: z.string().default('development-only-tadpods-secret-change-me'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DEFAULT_CURRENCY: z.string().regex(/^[A-Z]{3}$/).default('NZD'),
  NEGATIVE_STOCK_ENABLED: booleanFromString.default(false),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().min(1).default('tadpods'),
  S3_SECRET_KEY: z.string().min(8).default('local-tadpods-secret'),
  S3_BUCKET: z.string().min(3).default('tadpods-attachments'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025)
});

export type AppEnvironment = {
  nodeEnv: 'development' | 'test' | 'production';
  appName: string;
  databaseUrl: string;
  authSecret: string;
  corsOrigin: string;
  apiPort: number;
  webPort: number;
  defaultCurrency: string;
  negativeStockEnabled: boolean;
  s3: { endpoint: string; accessKey: string; secretKey: string; bucket: string };
  smtp: { host: string; port: number };
};

export function loadEnvironment(source: NodeJS.ProcessEnv): AppEnvironment {
  const parsed = rawEnvironmentSchema.parse(source);
  if (parsed.NODE_ENV === 'production' && parsed.AUTH_SECRET.length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters in production');
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    appName: parsed.APP_NAME,
    databaseUrl: parsed.DATABASE_URL,
    authSecret: parsed.AUTH_SECRET,
    corsOrigin: parsed.CORS_ORIGIN,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    defaultCurrency: parsed.DEFAULT_CURRENCY,
    negativeStockEnabled: parsed.NE
...
```

### apps/web/src/app/page.tsx

```tsx
import { redirect } from 'next/navigation';
export default function HomePage() { redirect('/dashboard'); }

```

### packages/ui/src/index.tsx

```tsx
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`button button--${variant} ${className}`.trim()} {...props} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{title || action ? <header className="card__header"><h2>{title}</h2>{action}</header> : null}<div className="card__body">{children}</div></section>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field"><span className="field__label">{label}</span>{children}{hint ? <span className="field__hint">{hint}</span> : null}{error ? <span className="field__error" role="alert">{error}</span> : null}</label>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

export function ProgressSteps({ steps, current }: { steps: readonly string[]; current: number }) {
  return <ol className="progress-steps" aria-label="Workflow progress">{steps.map((step, index) => <li key={step} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''}><span>{index + 1}</span>{step}</li>)}</ol>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function DataTable({ headings, children, label }: { headings: readonly string[]; children: ReactNode; label: string }) {
  return <div className="table-wrap"><table><caption className="sr-only">{label}</caption><thead><tr>{headings.map((heading) => <th key={headi
...
```

### docs/superpowers/plans/README.md

```
# TADPODS Implementation Plan Index

This directory contains the approved product design, the cross-phase roadmap, and execution-level plans for every delivery phase.

## Product and Roadmap

- [Product and System Design](../specs/2026-08-05-tadpods-product-design.md)
- [Complete Implementation Roadmap](2026-08-06-tadpods-implementation-roadmap.md)

## Execution Plans

1. [Phase 1: Platform Foundation](2026-08-05-platform-foundation.md)
2. [Phase 2: Products, Warehouses, and Inventory Ledger](2026-08-06-phase-2-products-inventory.md)
3. [Phase 3: Purchasing and Supplier Accounts](2026-08-06-phase-3-purchasing-supplier-accounts.md)
4. [Phase 4: Sales, Reservations, Deliveries, and Backorders](2026-08-06-phase-4-sales-reservations-backorders.md)
5. [Phase 5: Customer Invoices, Payments, Credits, and Statements](2026-08-06-phase-5-customer-accounts-payments.md)
6. [Phase 6: Documents, Reports, Imports, and Operational Hardening](2026-08-06-phase-6-documents-reports-hardening.md)

## Execution Rule

Each phase must be implemented as a separate branch and pull request. A later phase may begin only after its dependencies are merged and its integration gate is green. Financial and stock posting rules cannot be weakened to make a phase appear complete.

```

### apps/api/package.json

```json
{
  "name": "@tadpods/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js",
    "lint": "eslint src test",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@fastify/cookie": "11.0.2",
    "@fastify/cors": "11.1.0",
    "@fastify/helmet": "13.0.1",
    "@fastify/rate-limit": "^11.2.0",
    "@nestjs/common": "11.1.6",
    "@nestjs/core": "11.1.6",
    "@nestjs/platform-fastify": "11.1.6",
    "@tadpods/auth": "workspace:*",
    "@tadpods/config": "workspace:*",
    "@tadpods/contracts": "workspace:*",
    "@tadpods/database": "workspace:*",
    "@tadpods/documents": "workspace:*",
    "@tadpods/domain": "workspace:*",
    "fastify": "5.4.0",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "zod": "4.0.14"
  },
  "devDependencies": {
    "@nestjs/testing": "11.1.6",
    "@types/react": "^19.1.9",
    "@types/react-dom": "^19.1.7",
    "@types/supertest": "6.0.3",
    "supertest": "7.1.4",
    "tsx": "4.20.3",
    "vitest": "3.2.4"
  }
}

```


## Package Files Materialized

- `source_examples/apps/web/src/app/layout.tsx`
- `source_examples/apps/web/src/components/app-shell.tsx`
- `source_examples/apps/web/src/app/authenticated/inventory/adjustments/error.tsx`
- `source_examples/apps/web/src/app/authenticated/inventory/adjustments/loading.tsx`
- `source_examples/apps/web/src/components/login-form.tsx`

## Next Design-System Work

- Use these source paths and snapshots as evidence before writing `DESIGN.md`.
- Convert the inventory above into a Claude Design-style package: `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/colors-*`, `preview/typography-specimens.html`, `preview/spacing-*`, `preview/components-*`, `preview/brand-assets.html`, `ui_kits/app/`, and preserved `assets/`, `build/`, or `fonts/` when evidence exists.
- `ui_kits/app/index.html` must be a browser-reviewable component entry: load `../../colors_and_type.css`, load or import at least three files from `ui_kits/app/components/`, and mount the composed UI through ReactDOM/Babel or compiled browser-ready JavaScript. Do not duplicate a static HTML mock when modular component files exist.
- `ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components such as Sidebar, AssistantsList, ChatArea, InputBar, and MessageBubble, not merely list their filenames.
- Claude-style UI-kit entry skeleton for direct JSX kits:
  - `<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>`
  - `<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>`
  - `<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>`
  - `<link rel="stylesheet" href="../../colors_and_type.css">`
  - `<div id="root"></div>`
  - Load role components from `components/*.jsx` with `<script type="text/babel" src="components/ComponentName.jsx"></script>`.
  - Mount with `const { App } = window; const root = ReactDOM.createRoot(document.getElementById("root")); root.render(<App />);`.
- Preserve at least three high-signal source examples outside `context/` under `source_examples/` when reusable component snapshots exist, so future agents can compare generated components against original source structure.
- When a captured asset path begins with `build/`, copy the snapshot back into a root `build/` path with its original filename, such as `context/.../files/build/icon.png` -> `build/icon.png`. Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`.
- Make `preview/brand-assets.html` visibly load preserved asset files from `assets/` or `build/`; do not redraw captured logos/icons as inline placeholders.
- Extract concrete colors, typography, spacing, radius, component behavior, assets, and product tone only when supported by inspected files.
- If evidence is missing or ambiguous, mark that uncertainty instead of inventing tokens.
