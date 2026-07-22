# Fase Fiscal 3.11 — Harness RLS SQL-Nativo (guia não técnico)

> **AVISO — VERSÃO 3.11.3.**
> - **3.11** era um placeholder (inseria 677 linhas `skipped`).
> - **3.11.1** executava a matriz mas deixava helpers em `public` e usava
>   `WHERE 1=0` no ramo DELETE.
> - **3.11.2** moveu helpers para `pg_temp` e usou fixtures reais de DELETE,
>   mas o run runtime no staging revelou 46 falhas + 2 erros por:
>   (a) meta-comando psql `\set` (SQL Editor não interpreta);
>   (b) role `cliente_produtor` atribuída antes do vínculo `user_clientes`
>   exigido pelo trigger canônico;
>   (c) FK `financial_audit_log.performed_by` bloqueando teardown de
>   `auth.users`;
>   (d) `INSERT..SELECT` sem checagem de `ROW_COUNT` marcado como allow
>   quando a fonte era invisível ao papel;
>   (e) DELETE reutilizando linha alterada pelo UPDATE em
>   `product_fiscal_profiles` / `customer_fiscal_profiles`;
>   (f) UPDATE mutando o próprio marker de identificação;
>   (g) Views `v_product/service_fiscal_readiness` sem fixture
>   `is_active=true` elegível;
>   (h) pré/pós-count de `fiscal_events` no RPC executor rodando sob role
>   sem grant, fora do bloco de exceção.
> - **3.11.3** — este arquivo — elimina esses achados sem alterar policies,
>   migrations, schema ou regras de negócio. Todas as flags fiscais
>   permanecem `false`.

## O que é

Um único arquivo SQL (`scripts/fiscal-staging-rls-certify.sql`) que
certifica as políticas RLS fiscais **sem depender de secrets/JWT/PGURL**.
Executa apenas no **SQL Editor do Supabase de staging temporário**, como
usuário `postgres`, simulando cada perfil via `set_config('role', ...)` +
`set_config('request.jwt.claims', ...)`.

**Não** certifica emissão fiscal. **Não** emite NF-e/NFS-e. **Não** aciona
provedor, certificado, token ou SEFAZ. Todas as flags fiscais permanecem
em `false`.

## Onde colar

1. Abrir o **projeto de staging** (nunca produção `navfzbwgwzruipouyfnk`).
2. SQL Editor → New query.
3. Colar o conteúdo integral de `scripts/fiscal-staging-rls-certify.sql`.

## Como confirmar staging antes de rodar

```sql
SELECT marker, project_ref FROM public._fiscal_staging_marker;
```

Só prosseguir se `marker='STAGING'` e `project_ref <> 'navfzbwgwzruipouyfnk'`.
O próprio script aborta com `ABORT 3.11.2` em qualquer violação.

## O que o script executa

1. Guard fail-fast (marker + rejeição de produção).
2. Cria duas **TEMP TABLE** de suporte (`_fiscal_test_3111_results` e
   `_fiscal_test_3111_matrix`) e todas as funções auxiliares em `pg_temp`.
3. Cria 16 usuários sintéticos em `auth.users` (`FISCAL_TEST_3111_*@staging.local`,
   UUIDs `ff5c3111-*`) — 15 perfis da matriz + produtor B.
4. Semeia `profiles`, `user_roles`, `clientes` A/B, `user_clientes`, categoria
   financeira existente, `accounts_receivable` A/B, `fiscal_invoices` A/B/DEL,
   `fiscal_invoice_items`, `fiscal_events`, idempotência,
   `company_fiscal_settings`, `product/service/customer_fiscal_profiles` — e
   **delete-slots descartáveis** por tabela.
5. Materializa a matriz canônica em `pg_temp._fiscal_test_3111_matrix` com
   **677** asserções (540 tabela×op + 75 view + 60 RPC + 2 ownership).
6. Executa cada célula por EXECUTE real (SELECT/INSERT/UPDATE/DELETE, VIEW,
   RPC, ownership), classificando `passed | failed | error`.
7. Faz teardown completo (fiscal + AR + clientes + profiles + user_roles +
   auth.users) e aborta se sobrar qualquer resíduo `FISCAL_TEST_3111_*` **ou**
   qualquer função/tabela `_fiscal_3111_*` / `_fiscal_test_3111_*` em `public`.
8. Retorna 2 result-sets: detalhes por asserção + resumo/classificação.
9. Ao encerrar a sessão, `pg_temp` é descartado pelo PostgreSQL. **Nenhuma
   limpeza manual é necessária.**

## Semântica de assert (crítica)

- **SELECT `allow`** → `count > 0` na linha esperada.
- **SELECT `deny`** → `count = 0` **ou** `SQLSTATE 42501`.
- **INSERT** → payload válido específico da tabela; `42501` = deny; qualquer
  `23xxx`/`22xxx` = **error**, nunca deny.
- **UPDATE** → coluna mutável real (`notes`, `accounting_notes`,
  `validation_notes`, `updated_at`); allow se `ROW_COUNT > 0`.
- **DELETE** — dupla verificação obrigatória:
  1. `ROW_COUNT` da tentativa (allow=1, deny=0);
  2. Presença física da fixture inspecionada como `postgres` (bypassa RLS)
     depois da tentativa. Allow exige `ct=1 AND missing=0`. Deny exige
     `no_delete=true AND preserved=1`.
  Entre células, a fixture é recriada (`ensure_fixture_delete`). Nunca há
  `WHERE 1=0`.
- **RPC** — 4 casos por perfil:
  1. Feliz path → staff `allow` (evento persistido com `event_source='USER'`,
     `performed_by=user_id`, `notes` gravado); demais `deny`.
  2. Invoice inexistente → `deny` (todos).
  3. `event_type` inválido → `deny` (todos).
  4. `notes` > 2000 chars → `deny` (todos).
- **Views** — allow ↔ `count>0` (fixture visível); deny ↔ `count=0`/`42501`.
- **Ownership** — produtor A vê `fiscal_invoices` A (via `receivable_id` →
  `accounts_receivable` de A); produtor B **não** vê o invoice A.

## Como exportar

Na aba de resultados do SQL Editor, exportar CSV/JSON dos dois result-sets
e salvar em `restoration/fiscal-fase3-11/run-<data>.json`. Faça isso na
**mesma sessão** — ao fechar, as TEMP TABLE somem por conta do PostgreSQL.

## Como verificar zero resíduos

O resumo traz a coluna `residuos`, incluindo `pub_helpers=0` e
`pub_tables=0` (nenhuma função ou tabela `_fiscal_3111_*` / `_fiscal_test_3111_*`
sobrou em `public`). Todos os contadores devem ser `0`. Se qualquer
contador for `> 0`, o script aborta com `ABORT 3.11.2`.

## Como classificar

| `classificacao` | Ação |
|---|---|
| `APTO` | `executadas=677`, `falhas=0`, `erros=0`, `skips=0`. RLS certificado. |
| `INAPTO` | Qualquer failed/error/skipped ou total ≠ 677. Investigar antes. |

## O que este harness NÃO certifica

- Emissão fiscal (NF-e, NFS-e, CT-e).
- Integração com Focus NF-e / Plugnotas / SEFAZ / nfse.gov.br.
- Homologação em ambiente real da Receita.
- Certificado digital, secrets de provedor, webhooks.
- Aprovação humana final para promoção a produção.
