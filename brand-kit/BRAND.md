# Tadpod brand system

## System summary

Tadpod now combines its white, spacious foundation with a futuristic operating-surface posture: near-black Inter typography, dark instrument panels, a single blue action signal, 1px borders, 8px corners, and an 8px spacing rhythm. The system should feel precise, alert, and immediately usable.

## Token contract

- `background`: `#ffffff`
- `surface`: `#f7f8fa`
- `foreground`: `#111111`
- `muted`: `#6b7280`
- `border`: `#d9dee7`
- `accent`: `#1677ff`
- `accent-secondary`: `#6b7280` (inferred semantic alias from the supplied palette)

Implementation uses `brand.json` as the authored source and generated `system/variables*.css` as the runtime token layer. Do not edit generated system files directly.

## Type and spacing

Inter is used for display and body text with the declared system fallback stack. The base UI size is 14px. Use 8px increments for layout, 4px only for compact internal spacing, 8px corners, 1px borders, and a persisted default control height of 44px.

## Component guidance

Buttons, cards, form fields, navigation, and data display are the core kit. Keep one filled primary action in a group, use bordered surfaces to group related content, make labels explicit, and expose focus, hover, active, disabled, and validation states with paired foreground/background contrast.

## Voice and content

Write clearly and concretely. Prefer “Create project” to “Get started on your journey.” Keep helper text short, name the next action, and explain advanced detail only when it changes a decision.

## Logo and imagery

The user-supplied `assets/relx-product-logo.png` is the primary brand asset. It is a monochrome product photograph with visible RELX branding and smoke. Use it as a compact identity module or carefully cropped hero image; do not stretch, tile, or treat it as a transparent vector logo.

## Evidence limits

The pasted source contained no logo or imagery; the supplied attachment now closes that gap. No additional logo, font, or illustration assets are fabricated.
