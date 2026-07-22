# Fase Fiscal 3.11.4 — Fechamento dos 2 últimos erros runtime

Evidência baseline (staging pós-3.11.3, singleton sintético mantido `false`):

- Executadas: 677
- Aprovadas: 675
- Falhas: 0
- Erros: 2
- Skips: 0
- Resíduos: 0

Erros únicos:

1. `T-administrador-customer_fiscal_profiles-INSERT` — duplicate key.
2. `T-financeiro-customer_fiscal_profiles-INSERT` — duplicate key.

## Causa raiz

`customer_fiscal_profiles` tem `UNIQUE (customer_id)`. O executor de INSERT
usava `cliente_a_id`, que já possuía profile SEL semeado
(`ff5c3111-c057-0000-0000-000000000001`). A primeira célula com `allow`
inseriu com sucesso; a segunda célula reusou a mesma linha e recebeu
`23505` — classificado como `error`, não como `allow` real.

Somado a isso, a fixture sintética `company_fiscal_settings` do bloco
seed usava `is_active=true`, o que em staging real com singleton ativo
preexistente violaria `ux_company_fiscal_settings_active_singleton`.

## Correções aplicadas (harness/testes/docs; nenhuma migration/policy)

1. **Cliente C dedicado ao INSERT.** `$seed_clientes$` passa a criar
   `cli_C` (`ff5c3111-c1e1-0000-0000-000000000003`, nome
   `FISCAL_TEST_3111_cli_C_INSERT`) sem profile fiscal seed e sem
   vínculo `user_clientes`. GUC `fiscal_test_3111.cliente_c_id`
   publicado.
2. **INSERT executor** de `customer_fiscal_profiles` passa a usar
   `current_setting('fiscal_test_3111.cliente_c_id')` — nunca cli_A/cli_B.
3. **Cleanup pós-célula.** Após `_fiscal_3111_reset()` (role restaurada
   a postgres), o executor apaga somente
   `WHERE customer_id=cli_C AND validation_notes LIKE 'FISCAL_TEST_3111_INS_%'`,
   garantindo estado limpo para a próxima role. Isolado por marker e por
   cliente sintético; nunca toca cli_A/cli_B nem linhas reais.
4. **Fixture company_fiscal_settings.** Ambas as linhas sintéticas agora
   são `is_active=false`. A view `v_fiscal_company_readiness` é lida
   apenas contra o singleton ativo preexistente do staging, que este
   harness não altera nem apaga.
5. **Teardown.** `DELETE FROM public.clientes WHERE nome LIKE 'FISCAL_TEST_3111_%'`
   já cobre `FISCAL_TEST_3111_cli_C_INSERT`; nenhum novo passo requerido.

## Correções 3.11.3 preservadas

- Sem `\set` (SQL Editor puro), `user_clientes` antes de `user_roles`,
  `financial_audit_log` antes de `auth.users`, `ROW_COUNT` para INSERT,
  DELETE isolado por id/marker exclusivo, fixtures elegíveis à view
  `product/service_fiscal_readiness`, RPC pre/post count como postgres,
  três result-sets finais, matriz canônica de 677 casos, zero skips e
  zero resíduos, helpers/tabelas em `pg_temp`, guard anti-produção
  (`ABORT 3.11.3`, marker STAGING, projeto navfzbwgwzruipouyfnk).

## Testes estáticos (blindagem)

`src/test/fiscal/fase3_11.static.test.ts` — 36 casos, incluindo 5 novos
para 3.11.4:

- cliente C existe, é distinto de cliente A e não aparece no seed do
  `customer_fiscal_profiles`;
- INSERT do executor referencia `cliente_c_id` e **não** `cliente_a_id`;
- cleanup pós-INSERT existe, é executado como postgres (após
  `_fiscal_3111_reset()`), escopado por `customer_id=cli_C` e marker
  `FISCAL_TEST_3111_INS_%`;
- fixture `company_fiscal_settings` sintética é `is_active=false` nas
  duas linhas e o motivo (`ux_company_fiscal_settings_active_singleton`)
  está documentado no SQL;
- teardown de `public.clientes` cobre o prefixo sintético.

## Validação verde

- `bun run typecheck` ✅
- `bun run build` ✅
- `bunx vitest run` ✅ — 996 passed / 3 skipped / 0 falhas / 0 erros
  (fiscal isolado: 647 passed / 3 skipped em 23 arquivos)
- Flags `fiscal*` permanecem `false`.
- Nenhuma migration/policy/schema alterada. Produção não tocada.

## Classificação

**PREPARADO PARA REEXECUÇÃO EM STAGING.**

Não avançar automaticamente. Aguardar autorização humana explícita para
reexecutar `scripts/fiscal-staging-rls-certify.sql` em staging
(projeto navfzbwgwzruipouyfnk) e coletar as novas SAÍDAS 1/2/3.
