- Historical candidates are audit-only: backend migrations visit_field_cas_gate_20261027 and visit_field_canonical_write_only_20261027 were applied by the auditor; never re-apply SQL or auto-publish.
- Field CAS: revalidate original predicate + can_manage + status after gate, parent and child locks; tenant of talhão/fazenda/cliente and hidden cultura checked server-side.
- Client queue: every save gets a new revision; claim/cleanup only by revision+attemptId in one IDB transaction; PT409 never auto-requeued.
- Permission is a strict subset of RLS participants; never describe it as identical to the original scope.
- Backend applied by the auditor (visit_field_cas_gate_20261027): never re-apply; a false CAS finish/discard must never show saved or advance.
- Field table writes are canonical-RPC-only for authenticated callers; preserve SELECT, tenant RLS, existing RPCs and owner/service_role privileges — prevents direct DML from bypassing the revocation gate.
- Applied write-closure SQL is a reported effective-statement excerpt, not a reconstructed migration; verify effective table and column ACLs read-only before asserting closure — avoids fabricated preflight evidence.

- (Moved from root AGENTS.md) Visit field writes follow scripts/visit-field-cas-20261027/AGENTS.md; installed canonical-write-only ACLs preserve SELECT/RLS and privileged service writers, and applied audit artifacts must never be replayed — prevents bypassing the field revocation gate.
