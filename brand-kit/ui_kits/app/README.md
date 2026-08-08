# Tadpod applied UI kit

This entry models the repository-backed TADPODS app shell: persistent navigation for Dashboard, Sales, Purchasing, Inventory, Customers, and Administration; a sticky top bar; operational metric cards; a table; a shift brief; and a focused next-action rail. It is a small review surface, not a replacement for the source app.

Open `index.html` in a browser. It loads `../../colors_and_type.css` and the modular files under `components/`. `app-shell.css`, `sidebar.css`, and `data-table.css` are applied directly. `assistant-list-rail.css`, `chat-area.css`, `message-bubble.css`, and `input-bar.css` provide reusable workspace roles for future source-backed surfaces. The applied example uses the supplied `assets/relx-product-logo.png` as an identity anchor and preserves the 44px control contract.

## Structure

- `index.html` — applied responsive shell example.
- `components/*.css` — reusable role styles.
- `components/*.html` — small markup fixtures for review and composition.

## Reuse and source basis

Import the CSS roles into a product shell, then use the HTML fixtures as structural references. The app-shell and navigation roles are grounded in `source_examples/apps/web/src/components/app-shell.tsx`; table and operational roles are grounded in the captured inventory, customer, audit, loading, and error snapshots. The chat-oriented fixtures are generic composition roles because the source repository does not contain a chat surface.

## Usage workflow

1. Load `../../colors_and_type.css`.
2. Import the role CSS needed by the surface.
3. Start from the matching HTML fixture, then replace copy with real product data.
4. Preserve visible focus, 44px targets, responsive overflow handling, and the one-primary-action rule.

## Package reuse guide

Use the applied shell as the starting point for operational pages. Use the `AssistantListRail`, `ChatArea`, `MessageBubble`, and `InputBar` role fixtures only when a future product surface actually requires them; the captured TADPODS source does not currently contain a chat workflow.

## Design notes

The visible shell stays operational and source-backed. The final role-fixture section is intentionally compact: it proves that modular roles can mount into the same page without turning the product surface into a component gallery.
