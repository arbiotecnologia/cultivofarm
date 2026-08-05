# Higienização final pré-auditoria fiscal — staging `ikaauvsflpmamgxmkhoq`

Marcador fail-closed verificado: `public._fiscal_staging_marker` = `STAGING` / `ikaauvsflpmamgxmkhoq`.
Produção `navfzbwgwzruipouyfnk`: **não conectada, não consultada, não migrada, não publicada**.

## Artefatos
- `migration.sql` → canonizada em `supabase/migrations/20260811000000_higienizacao_objetos_hml_sinteticos.sql`
- `postcheck.sql` → gate fail-closed somente leitura
- `rollback.sql` → recriação mínima dos objetos sintéticos + `migration repair --status reverted 20260811000000`
- `baseline/` → ledger, hash do ledger, DDL dos objetos e CSV dos dados antes da remoção

## Escopo B — objetos sintéticos (EXECUTADO)
Removidos (todos sem consumidor em fluxo real, evidência em `baseline/objects-ddl.txt`):
- `public.hml_b2b_e2e_evidence` (20 linhas exportadas para `baseline/hml_b2b_e2e_evidence.csv`)
- `public.hml_fixture_registry` (41 linhas exportadas) + trigger `trg_hml_fixture_registry_touch` + `public.hml_fixture_registry_touch()`
- `public.rpc_hml_fiscal_emit_mock(uuid)` — todas as assinaturas; guard aborta se houver `fiscal_invoices.provider='mock_homologation'` (contagem real = 0)
- `public._fiscal_hml_context`, `public._fiscal_hml_inventory` (0 linhas cada)
- índice `public.ux_fi_one_mock_per_receivable`

**Preservados por consumidor real comprovado:**
- `public._fiscal_staging_marker` — guarda de ambiente de todos os kits
- `public._motor_b2b_pre_phase1_snapshot` — dependência de `restoration/motor-b2b-pre-phase1/restore-functions.sql` (rollback)

Postcheck: `POSTCHECK_HIGIENIZACAO_HML_PASS`.

## Escopo C — ledger (EXECUTADO, mecanismo oficial)
`supabase migration repair --status applied 20260811000000` (registro da migration canônica) e
`supabase migration repair --status reverted` para as **23** versões remote-only transitórias
(`20260729010531 … 20260731175301`).

Prova de que nenhuma delas é persistente: para cada objeto `CREATE`ado por essas versões
(`_motor_b2b_fase0_2_harness`, `_motor_b2b_fase0_2_evidence`, `_motor_b2b_fase1_int_evidence`,
`_motor_b2b_fase1_quote_evidence`, `_motor_b2b_fase7_proofs`, `hml_b2b_e2e_evidence`,
`rpc_hml_fiscal_emit_mock`) `to_regclass`/`pg_proc` retornam ausente — as 20 já eram transitórias
e as 5 remanescentes tiveram seus objetos removidos pelo Escopo B desta mesma execução.
Nenhum DML manual no ledger; nenhum placeholder e nenhum workdir artificial foi usado.

### Migration list no repositório principal
- Local: 628 versões — Remote: 628 versões
- **LOCAL_ONLY: (vazio)** · **REMOTE_ONLY: (vazio)** · 0 duplicidades
- Deriva repositório × ledger: **zero**

## Escopo A — 4 usuários auth: **BLOQUEADO** (não executado)
`fase-e-admin-bfa7790c@`, `fase-e-financeiro-1eed351a@`, `fase-e-financeiro-9394a6fb@`,
`fase-e-financeiro-bfa7790c@` (`@arbio-staging.test`).

Bloqueio exato — a premissa "sem vínculos de negócio" é falsa; varredura de todas as colunas `uuid`
de `public`/`storage` encontrou 46 referências vivas:

| Tabela.coluna | Linhas |
|---|---|
| `partner_order_audit_logs.usuario_id` | 14 |
| `financial_governance_audit_log.usuario_id` | 14 |
| `financial_audit_log.performed_by` | 4 |
| `commercial_condition_audit_log.actor_id` | 4 |
| `commercial_audit_log.usuario_id` | 3 |
| `partner_order_financial_links.created_by` | 2 |
| `partner_orders.receivable_generated_by` | 2 |
| `accounts_receivable.created_by` | 2 |
| `notificacoes_operacionais.usuario_id` | 1 |

Excluir os usuários exigiria apagar/mutilar trilhas de auditoria imutáveis e linhas financeiras reais
(`accounts_receivable`, `partner_orders`) — fora do escopo autorizado e destrutivo. Requer autorização
específica posterior definindo o tratamento da auditoria.

## Regressão
- `vitest run`: **2723 PASS**, 4 skipped, 0 fail
- `tsgo --noEmit`: **clean**

## Veredito
**APTO** para os Escopos B e C. Escopo A permanece **BLOQUEADO** pelo motivo acima.
