# TADPODS Foundry brand system

## System summary

Foundry is the single application UI language for TADPODS. It combines warm graphite operational surfaces with Flux amber interaction, Live mint status, Steel metadata, chamfered geometry and compact telemetry typography. The result should feel like a purpose-built operations console rather than a generic ERP or accounting template.

## Runtime token contract

- Canvas: `#08080A`
- Primary surface: `#0E0E10`
- Panel surface: `#141416`
- Raised surface: `#1A1A1D`
- Primary foreground: `#F7F6F3`
- Secondary foreground: `#8D8A85`
- Border: `#303036`
- Flux / primary interaction: `#FF9E2C`
- Live / healthy state: `#2DD4BF`
- Steel / metadata: `#8AA9C4`
- Danger: `#FF5A45`
- Warning: `#FFD166`

The production source is `apps/web/src/app/globals.css`. Shared component contracts live in `packages/ui/src/index.tsx`.

## Type and spacing

Inter is the human-readable interface face. System monospace is used for domain codes, document identifiers, telemetry, money, quantities and keyboard guidance. Controls retain a minimum 44px target. Foundry uses compact spacing, 1px operational boundaries and clipped/chamfered corners rather than soft rounded-card styling.

## Component guidance

Foundry primitives must cover the shared interaction vocabulary before feature routes create new patterns. Primary actions use Flux. Live/healthy state uses mint. Neutral system metadata uses Steel. Destructive state uses red. Status must always include text or another non-colour cue.

Shared primitives include buttons, badges, cards, fields, inputs, tables, page headers, alerts, tabs, loading/empty states and the command palette. Business components and page patterns should compose these rather than duplicating styling in route files.

## Voice and content

Use plain operational language. Labels should tell staff what the record is or what the action does. Avoid accounting jargon when an everyday term is clearer, decorative microcopy, marketing language inside operational screens and vague calls to action.

## Branding rule

TADPODS branding is present across every screen and output, but tenant-configurable brand colours do not replace Foundry's application control signals. Customer-facing documents may use configured branding where supported; application actions and status semantics remain consistent.

## Historical artifacts

Older generated blue/white previews and unrelated image experiments may remain in this directory for history until separately removed. They are not authoritative and must not be imported by production code.
