# subscription_business_conflict_nonretryable — registro de migration JÁ APLICADA

Status: aplicada pelo auditor em `swzpzcwiasxmjutrmvkm` (2026-10-19, via apply_migration). Este pacote
apenas registra; nada aqui foi executado pelo agente.

## Mudança
`platform_private.transition_subscription_core(uuid,text,text,uuid,uuid)`: somente as 9 ocorrências
`ERRCODE='40001'` → `ERRCODE='PT409'` (conflitos de negócio). Owner `postgres`, SECURITY DEFINER,
`search_path=""` e ACL (`postgres, authenticated, service_role` EXECUTE) preservados. Nenhum dado alterado.
- md5 `pg_get_functiondef` pré: `e7e3b57debf67673a82e3f4f7c2daa48`
- md5 pós: `447ee6a17af25c2b746ce082df6b9b01` (confirmado em leitura read-only: 0 `40001`, 9 `PT409`).

Motivo: 2.492 erros 40001 em 25 s (linha 112, start_trial conflict) — PostgREST 14.5 trata 40001 como
serialization failure e repete indefinidamente (doc Supabase oficial). Último 40001 20:15:33.132Z; PT409
único 20:15:33.209Z. Não atribuir todos os picos de CPU/erro a esta causa.

## Arquivos
- `apply_idempotent.sql`: md5 pós ⇒ NO-OP; md5 pré ⇒ replace dos 9 exatos com verificação pós; outro ⇒ DRIFT.
  Exige `SET app.expected_project_ref = 'swzpzcwiasxmjutrmvkm'`.
- `rollback_GUARDADO.sql`: inverso exato (pós→pré). **Reintroduz o retry infinito conhecido**; exige também
  `SET app.confirm_reintroduce_40001_retry = 'yes'`.
- Teste de integridade: `src/test/security/subscriptionNonretryableConflict.static.test.ts`.
- Não fica em `supabase/migrations/` (gerenciada pela ferramenta; evita replay em lote).

## Pendência
Inventário read-only apontou outras 46 funções com literal `40001`. Revisão INDIVIDUAL pendente
(algumas podem ser re-raise legítimo de serialization failure). Proibida substituição global.
Frontend `subscriptionTransition.ts` trata códigos `P0*`/`22`/`23`/`40`/`42` como definitivos; `PT409`
cai em "resultado desconhecido" + reconciliação limitada (3 leituras), sem retry de escrita — sem mudança de runtime aqui.
