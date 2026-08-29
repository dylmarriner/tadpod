# TADPODS Foundry design system

Foundry is the single authoritative visual and interaction system for TADPODS.

## Runtime sources

- `packages/ui/src/index.tsx` contains the shared production primitives and business-neutral page components.
- `apps/web/src/app/globals.css` contains the Foundry token contract, surfaces, shell geometry, responsive behaviour and compatibility styling used by the shipped application.
- `apps/web/src/components/app-shell.tsx` contains the production Foundry spine, command deck, domain navigation and context ledger.
- `docs/superpowers/specs/2026-08-09-foundry-master-ui-design.md` defines the complete product coverage and design rules.

## Visual language

Foundry is a machined operations console rather than a generic light SaaS dashboard. It uses warm graphite surfaces, Flux amber for primary interaction, Live mint for positive/live state, Steel for metadata, chamfered geometry and monospace telemetry.

Any older generated previews or brand artifacts retained in this directory are historical reference only. They are not runtime token sources and must not be used to introduce a second UI language.
