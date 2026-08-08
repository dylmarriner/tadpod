# Errors

Command failures and integration errors.

---

## [ERR-20260808-001] design-system-package-audit

**Logged**: 2026-08-08
**Priority**: medium
**Status**: pending
**Area**: docs

### Summary
The package audit still rejects concise focused preview cards and asks for richer modular UI-kit role files even after the required package structure was added.

### Error
Audit reports thin preview cards and missing assistant/list rail, chat area, message bubble, and input bar roles.

### Context
- Ran the bounded design-system package audit after preview, token, docs, asset, and UI-kit enrichment.
- Required foundation stylesheet, six previews, applied UI kit, source evidence, and preserved assets were added.
- The runtime system finalized successfully and the authored JSON plus generated seed validate.

### Suggested Fix
Future package exports should scaffold review-card templates and richer role-specific UI-kit modules when source evidence contains app-shell components; the audit currently expects those roles from a generic workspace heuristic.

### Metadata
- Reproducible: yes
- Related Files: preview/, ui_kits/app/components/, colors_and_type.css
- Tags: design-system, package-audit, preview, ui-kit
- Pattern-Key: docs.extractor_audit_thin_scaffold
- Recurrence-Count: 1

---
