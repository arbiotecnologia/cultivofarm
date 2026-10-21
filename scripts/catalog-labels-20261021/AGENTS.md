# AGENTS — catalog-labels-20261021

- Keep this package inactive; promote its frontend only after independently approved SQL and real-session postflight — prevents an uninstalled candidate from replacing live readers.
- Labels come only from `catalog_family_labels` via gated RPCs; never infer family/label from name, type or composition — single canonical source.
- Only server-validated Platform Superadmin writes labels; the `rotulo` key is immutable; inactivation preserves existing assignments; new assignments require an active label of the correct family — preserves history and audit.
- Preserve `set_global_product_family_core` signature/OID and all financial/composition invariants; only the label validation source changes — prevents contract drift.
- Structural rollback is documentation only and never auto-executed; frontend reversal keeps server-side validation — prevents reopening the fixed literal list silently.
- Tests use disposable local PostgreSQL and synthetic authorization helpers; never claim hosted JWT/RLS certification — distinguishes local execution from production evidence.
