# Isolamento de leitura de comprovantes (entrega_comprovantes) — 30/10/2026
Bloqueio real: JWT FSF lia o ID de comprovante AR Bio (políticas permissivas Financeiro/Staff sem tenant).
Delta: uma política RESTRICTIVE SELECT `entrega_comprovantes_parent_visible_r` exigindo a entrega-mãe visível pela RLS de `entregas` do próprio chamador (inclui `tenant_isolation_d51_5`). Nada mais muda.
Ordem: `install.sql.review` (PRE exato → política → POST exato, uma transação) e depois `postflight.sql.review`. Rollback `rollback.sql.review` estreita para `false`, nunca remove.
PRE/POST gerados do restore descartável com release-combined a566faa4 + install-v2 4390ef16 (`pre-state.json`/`post-state.json`); se o texto hosted das políticas/ACL divergir, o PRE aborta sem escrever — compare com a auditoria read-only antes.
Resultado: 19 PASS / 0 FAIL (`test-current.log.txt`, `test-results.json`).
Limites: claims sintéticas, não JWT hosted; o ator externo testado tem só `parceiro_b2b`; reteste real FSF pelo auditor após aplicar. Comprovante com `entrega_id` sem entrega visível fica invisível a leituras diretas (escritores DEFINER inalterados).
