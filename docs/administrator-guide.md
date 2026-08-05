# TADPODS Administrator Guide

## First sign-in

Use the administrator email and password configured during seeding. Immediately create a named administrator account for each actual administrator, sign in with it, and disable shared credentials before wider rollout.

## Branding

Open **Administration → Branding**. Set the display name, legal name, approved logo URL, primary colour, accent colour and document footer. Saving updates the live interface and the values consumed by TADPODS email and PDF templates.

## Users

Open **Administration → Users**. Create the user with a temporary password and assign only the roles required for their work. TADPODS rejects duplicate email addresses and prevents removal of the final active administrator.

## Roles

Open **Administration → Roles and permissions**. Permissions default to denied. The Administrator role must retain `*`. Use the named operational roles rather than creating informal permission combinations without a documented reason.

## Audit history

Open **Administration → Audit history** to review login, logout, refresh, user, role, branding and sequence events. Audit records are append-only and are not edited from the interface.

## Failed background events

The dashboard links to failed-event records. A failed event retains its payload and final error after five attempts. Investigate the cause before replaying it; repeated clicking is not a debugging strategy.
