# Fase Fiscal 3.11 — Harness RLS SQL-Nativo (guia não técnico)

> **AVISO — VERSÃO 3.11.2.**
> - A versão **3.11** era um **placeholder** (inseria 677 linhas `skipped` e
>   trazia texto "a preencher"). **Não executar cópia dessa versão.**
> - A versão **3.11.1** executava a matriz de verdade, mas deixava funções
>   auxiliares e tabelas de suporte em `public` após COMMIT, exigindo
>   `DROP TABLE` manual — e o ramo DELETE usava `WHERE 1=0` (deny sem tocar
>   em fixture real).
> - A versão **3.11.2** — este arquivo — substitui integralmente as duas.
>   Todos os helpers vivem em `pg_temp` (descartados pelo PostgreSQL ao fim
>   da sessão), o ramo DELETE opera contra fixtures descartáveis reais com
>   verificação de presença física, e o `role_map` foi corrigido para não
>   atribuir papel ao UUID anônimo.

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
