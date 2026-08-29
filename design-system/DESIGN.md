---
name: "TADPODS Foundry"
category: Business operations
surface: web
colors:
  background: "#08080A"
  foreground: "#F7F6F3"
  accent: "#FF9E2C"
  live: "#2DD4BF"
  metadata: "#8AA9C4"
  surface: "#141416"
  border: "#303036"
---

# TADPODS Foundry

*A machined operating surface for sales, purchasing, inventory and accounts.*

Foundry is the master UI system for TADPODS. It is intentionally unlike a generic accounting dashboard: dark graphite operational surfaces, precise data rails, high-signal amber actions, mint live state, steel metadata and restrained industrial geometry.

## Colour contract

| Role | Token | Hex | Usage |
| --- | --- | --- | --- |
| canvas | Graphite 950 | `#08080A` | application canvas |
| surface | Graphite 850 | `#141416` | cards and primary panels |
| raised surface | Graphite 800 | `#1A1A1D` | menus, interactive regions |
| foreground | Ink 0 | `#F7F6F3` | primary copy |
| secondary copy | Ink 2 | `#8D8A85` | helper text and metadata |
| border | Line 1 | `#303036` | rules and panel boundaries |
| primary signal | Flux | `#FF9E2C` | primary actions, current workflow state, focused operational signal |
| live signal | Live | `#2DD4BF` | active/live/healthy state |
| metadata signal | Steel | `#8AA9C4` | neutral information and secondary system state |
| danger | Danger | `#FF5A45` | destructive/error states |
| warning | Warning | `#FFD166` | attention states |

Tenant branding may be exposed as metadata or branded-document styling. It does not replace Foundry's Flux/Live control language inside the application shell.

## Typography

- **Interface copy:** Inter, system fallbacks.
- **Telemetry:** system monospace stack.
- **Money, quantities, document numbers, keyboard hints and domain codes:** monospace with tabular numerals where applicable.
- **Kickers and system labels:** compact uppercase monospace with tracking.

## Geometry

- 1px operational boundaries.
- Chamfered panels and controls using clipped corners instead of soft rounded cards.
- 44px minimum default control height.
- Shadows are restrained and mostly reserved for overlays/flyouts.
- The shell uses a narrow domain spine, central work deck and contextual ledger on wide screens.

## Domain navigation

The primary spine uses stable short codes:

- `DB` Dashboard
- `SL` Sales
- `PU` Purchasing
- `IN` Inventory
- `AC` Accounts
- `RP` Reports
- `AD` Administration

Domain flyouts expose existing routes only. Permissions remove inaccessible areas and actions rather than leaving misleading dead controls.

## Responsive posture

- Wide desktop: spine + work deck + context ledger.
- Medium desktop/tablet: ledger collapses; work deck remains primary.
- Mobile: spine becomes a bottom domain rail; forms become single-column; dense data remains usable without forcing desktop-only interaction.

## Interaction rules

- `Ctrl/Cmd + K` opens the TADPODS command line.
- Flux identifies primary/current action, not decoration.
- Live mint communicates healthy or active state.
- Status is never communicated by colour alone.
- Loading, empty, error, permission and destructive states use shared Foundry patterns.
- Respect reduced-motion preferences.
- Keyboard focus is always visible.

## Implementation rule

If a route needs a visual or interaction pattern Foundry does not provide, add that pattern to `@tadpods/ui` or the Foundry runtime layer first. Route code must not invent a competing micro-design system.
