# Fase Fiscal 3.11.5 — Certificação runtime do harness SQL-nativo

Documento estritamente auditorial. Não altera runtime, UI, migrations,
policies, schema, rotas, feature flags ou integrações. Nenhum banco é
executado por esta fase.

## Ambiente

- **Alvo executado:** staging temporário Supabase, project ref
  mascarado `ikaa***hoq`. Marker `public._fiscal_staging_marker.marker='STAGING'`.
- **Produção intocada:** `navfzbwgwzruipouyfnk` (referência mantida
  apenas como guard anti-produção `ABORT 3.11.3/…` no próprio script;
  nenhuma execução ocorreu ali).
- **Interface de execução:** Supabase SQL Editor, SQL puro (sem
  meta-comandos psql).
- **Commit do harness executado:** `49c58e5871b14d99cc7a61c2cea7d19a703c1a95`
  (arquivo `scripts/fiscal-staging-rls-certify.sql`).
- **Contexto de identidade por célula:** JWT sintético via
  `set_config('request.jwt.claims',…)` + `SET LOCAL ROLE authenticated`
  (helpers `pg_temp._fiscal_3111_as` / `_as_anon` / `_reset`). Nenhum
  secret carregado; nenhum service_role usado; nenhum token de
  provedor. Usuários sintéticos: 16 UUIDs no namespace `ff5c3111-*`.

## Métricas

| Métrica | Valor |
|---|---|
| Planejadas | 677 |
| Executadas | 677 |
| Aprovadas | 677 |
| Falhas | 0 |
| Erros | 0 |
| Skips | 0 |
| Classificação | **APTO** |

Matriz canônica (677) confirmada por `src/test/fiscal/rls/matrix.ts`:
`MATRIX (tabela×op×role) + VIEW_MATRIX + RPC (4 casos × role) +
OWNERSHIP_CELLS`, cobrindo 15 perfis, 9 tabelas fiscais, 4 operações
(SELECT/INSERT/UPDATE/DELETE), 5 views de prontidão, RPC
`rpc_fiscal_event_manual` (com pre/post count) e cenário de ownership
produtor A vs. produtor B.

## Zero resíduos após teardown

Contagens verificadas na SAÍDA 3 (resumo) e nas verificações de
`post_cleanup` do próprio script:

| Bucket | Sintéticos remanescentes |
|---|---|
| `fiscal_invoices` | 0 |
| `fiscal_events` | 0 |
| `fiscal_invoice_items` | 0 |
| `fiscal_idempotency_keys` | 0 |
| `fiscal_audit_log` | 0 |
| `company_fiscal_settings` (marker `FISCAL_TEST_3111_%`) | 0 |
| `product_fiscal_profiles` (marker) | 0 |
| `service_fiscal_profiles` (marker) | 0 |
| `customer_fiscal_profiles` (marker) | 0 |
| `accounts_receivable` (marker) | 0 |
| `clientes` (nome `FISCAL_TEST_3111_%`) | 0 |
| `user_clientes` (`ff5c3111-*`) | 0 |
| `user_roles` (`ff5c3111-*`) | 0 |
| `profiles` (`ff5c3111-*`) | 0 |
| `auth.users` (`ff5c3111-*`) | 0 |
| Helpers em `public` (`_fiscal_3111_%`) | 0 |
| Tabelas de suporte em `public` (`_fiscal_test_3111_%`) | 0 |

Helpers viveram em `pg_temp` (auto-limpados no fim da sessão); tabelas
de resultado foram `CREATE TEMPORARY TABLE`. O singleton ativo real de
`company_fiscal_settings` do staging não foi lido, alterado ou apagado.

## Gates aprovados pela execução runtime

1. Ordem canônica de seed: `user_clientes` antes de `user_roles` para
   cliente_produtor (satisfaz trigger canônico).
2. `financial_audit_log` limpo antes de `auth.users` em pre e post
   cleanup (FK `performed_by`).
3. `GET DIAGNOSTICS ROW_COUNT` classifica corretamente allow/deny em
   INSERT quando a linha semeada é invisível para o role.
4. DELETE isolado por fixture `…000d` com marker exclusivo; UPDATE
   nunca muta marker.
5. Views `v_product_fiscal_readiness` / `v_service_fiscal_readiness`
   com fixtures `is_active=true`; `v_fiscal_company_readiness` apoiada
   apenas no singleton ativo preexistente (sem segundo singleton
   sintético — respeitando `ux_company_fiscal_settings_active_singleton`).
6. RPC `rpc_fiscal_event_manual` executada com 4 casos por role
   (allow-happy, deny-role, deny-source, deny-invoice-inacessível);
   pre/post count executados como `postgres`.
7. Ownership produtor A x produtor B validado por AR/invoice/events.
8. Três result-sets finais: detalhes, divergências (`WHERE status IN
   ('failed','error')`), resumo/classificação.
9. Anti-produção: guard `ABORT` presente, marker STAGING checado
   antes de qualquer INSERT sintético.
10. Correções 3.11.3 e 3.11.4 (cliente C dedicado ao INSERT de
    `customer_fiscal_profiles` + cleanup pós-célula) confirmadas em
    verde runtime — nenhum `23505` remanescente.

## Limitações desta certificação

Esta certificação atesta **apenas RLS/GRANTs/RPC/ownership** contra
policies vigentes no staging temporário, com dados sintéticos e sem
provedor externo. Ela **não** certifica:

- Emissão fiscal real (NF-e, NFS-e, CT-e).
- Integração com Focus NF-e, Plugnotas, SEFAZ, `nfse.gov.br`.
- Homologação junto à Receita/prefeitura.
- Certificado digital, secrets de provedor, webhooks.
- Correspondência 1:1 do estado do staging temporário com o estado
  atual de produção (`navfzbwgwzruipouyfnk`): produção não foi tocada
  e a paridade das policies precisa ser reafirmada por diff no momento
  da promoção.
- Types.ts oficial gerado pelo Supabase CLI (ver gate correspondente
  abaixo).
- Backfill/limpeza de dados reais anteriores às migrations canônicas
  fiscais.

## Prova de execução SQL-nativa com contexto JWT/role

O script exercita RLS via:

- `perform set_config('request.jwt.claims', jsonb_build_object('sub',
  p_uid,'role','authenticated',…)::text, true);`
- `SET LOCAL ROLE authenticated;` / `SET LOCAL ROLE anon;`
- Reset explícito para `postgres` via `_fiscal_3111_reset()` antes de
  operações administrativas (pre/post count, cleanup pós-INSERT).

Zero uso de `service_role`, zero bypass de RLS, zero desativação de
policies. `insufficient_privilege` (42501) é distinguido de constraint
error (23xxx) no classificador — evitando falso-allow por payload
inválido e falso-deny por acesso legítimo.

## Retenção de evidência

- `restoration/fiscal-fase3-11/smoke-a2-evidence.{md,json}`: mantidos
  como evidência histórica do smoke A.2 (31 casos, Fase 3.0.2). Não
  são sobrescritos; recebem apenas nota de supersessão referenciando
  este documento.
- `docs/fiscal-fase3-11-4-relatorio.md`: mantido; ganhou nota de
  supersessão apontando para cá.
- `docs/fiscal-fase3-11-rls-sql-native.md`: guia operacional do
  harness, preservado; nota de supersessão adicionada ao final.

Nenhum secret, project ref completo, token ou JWT foi persistido neste
arquivo.
