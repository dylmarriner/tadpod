# Tadpod Design System

Reusable light, dark, and compact web tokens for Tadpod interfaces.

## Product overview

Bounded repository evidence describes TADPODS as a business-management platform covering customers, suppliers, products, stock, purchasing, sales, invoices, payments, backorders, and account balances. This package is designed for the operational surfaces around that work: app shells, navigation, forms, tables, status feedback, and focused actions.

## Source context

The system is extracted from `context/input-DESIGN.md` (`designmd://tadpod`) and bounded GitHub evidence in `context/github/dylmarriner-tadpod.md`. The supplied design source establishes the six core colors, Inter typography, 8px radius, 1px borders, 8px grid, and Button/Card/Form/Navigation coverage. The user-supplied product image is preserved at `assets/relx-product-logo.png`; no font files were available.

## Package contents

- `DESIGN.md` — canonical design rules and component guidance.
- `BRAND.md` — concise implementation contract.
- `brand.json` — authored source, semantic roles, voice, and persistent seed overrides.
- `system/variables.css` and `system/variables.dark.css` — generated runtime tokens.
- `system/kit.html` and `system/kit.dark.html` — light/dark component kits.
- `system/artifacts/` — generated landing, deck, poster, email, newsletter, and form examples.
- `colors_and_type.css` — focused reusable foundation tokens for applied examples.
- `preview/` — focused review cards for color, type, spacing, radius, components, and assets.
- `ui_kits/app/` — applied product-shell example grounded in the repository's navigation and operational modules.
- `source_examples/` — preserved high-signal source components from bounded GitHub intake.
- `assets/` — preserved repository app icons with source filenames retained.

## Preview manifest

- `preview/colors-primary.html`
- `preview/typography-specimens.html`
- `preview/spacing-tokens.html`
- `preview/radius-surface.html`
- `preview/components-buttons.html`
- `preview/brand-assets.html`

## Reuse workflow

Read `DESIGN.md`, `BRAND.md`, and `brand-spec.md` first. Use `colors_and_type.css` for focused examples and the generated `system/variables.css` layer for production token consumption. Reuse `preview/` cards to review role intent, then start from `ui_kits/app/` for an applied operational shell. Edit `brand.json` for authored changes and run `od brand preview tadpod-a6b47f` followed by `od brand finalize tadpod-a6b47f`; never hand-edit generated `system/` files. No `fonts/` or `build/` directories were supplied by source evidence.

## Package reuse guide

For a new Tadpod interface, take the token foundation from `colors_and_type.css`, review the focused cards in `preview/`, then compose the shell from `ui_kits/app/index.html` and `ui_kits/app/components/`. The CSS role files are safe to import directly; the adjacent HTML role fixtures show expected structure for the assistant/list rail, chat area, message bubble, and input bar/composer. Source provenance is recorded in `context/github/dylmarriner-tadpod.md` and preserved implementation examples live in `source_examples/`.

## Reuse guide

Keep authored changes in `brand.json`, preserve source assets under `assets/`, and regenerate the system with the brand preview/finalize commands. Treat the generated kit and artifacts as validation outputs, not hand-edited source.

## How to reuse

Read `DESIGN.md` and `brand-spec.md`, load `colors_and_type.css`, inspect the six files in the preview manifest, then compose from `ui_kits/app/`. The `system/` directory contains generated light, dark, compact, and artifact outputs; `source_examples/` contains preserved source-backed implementation references; `fonts/` and `build/` are intentionally absent because the evidence supplied none.
