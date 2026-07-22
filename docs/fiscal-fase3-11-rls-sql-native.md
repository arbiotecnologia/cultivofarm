# Fase Fiscal 3.11 — Harness RLS SQL-Nativo (guia não técnico)

> **AVISO — VERSÃO 3.11.1.** A versão anterior do arquivo
> `scripts/fiscal-staging-rls-certify.sql` era um **placeholder**: inseria
> apenas registros `skipped` e continha comentários `"a preencher"` /
> `"SEÇÃO EXECUTIVA"`. **Foi substituída integralmente** por um harness
> executável que roda de verdade as 677 asserções da matriz RLS canônica.
> Não usar cópias anteriores desse arquivo.

## O que é

Um único arquivo SQL (`scripts/fiscal-staging-rls-certify.sql`) que
certifica as políticas RLS fiscais **sem depender de secrets/JWT/PGURL**.
Executa apenas no **SQL Editor do Supabase de staging temporário**, como
usuário `postgres`, simulando cada perfil via `SET LOCAL role=authenticated`
+ `set_config('request.jwt.claims', ...)`.

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
O próprio script aborta com `ABORT 3.11.1` em qualquer violação.

## O que o script executa

1. Guard fail-fast (marker + rejeição de produção).
2. Cria 16 usuários sintéticos em `auth.users` (`FISCAL_TEST_3111_*@staging.local`,
   UUIDs `ff5c3111-*`) — 15 perfis da matriz + produtor B.
3. Semeia `profiles`, `user_roles`, `clientes` A/B, `user_clientes`, categoria
   financeira existente, `accounts_receivable` A/B, `fiscal_invoices` A/B +
   fixture descartável, `fiscal_invoice_items`, `fiscal_events`, idempotência,
   `company_fiscal_settings`, `product_fiscal_profiles`, `service_fiscal_profiles`,
   `customer_fiscal_profiles`.
4. Materializa a matriz canônica em `_fiscal_test_3111_matrix` com **677**
   asserções (540 tabela×op + 75 view + 60 RPC + 2 ownership).
5. Executa cada célula por EXECUTE real (SELECT/INSERT/UPDATE/DELETE, VIEW,
   RPC, ownership), classificando `passed | failed | error`.
6. Roda teardown completo (fiscal + AR + clientes + profiles + user_roles +
   auth.users) e aborta se algum resíduo `FISCAL_TEST_3111_*` sobrar.
7. Retorna 2 result-sets: detalhes por asserção + resumo/classificação.

## Semântica de assert (crítica)

- **SELECT `allow`** → count > 0 na linha esperada.
- **SELECT `deny`** → count = 0 **ou** `SQLSTATE 42501`.
- **INSERT** → payload válido específico da tabela; `42501` = deny;
  qualquer `23xxx`/`22xxx` = **error**, nunca deny.
- **UPDATE** → coluna mutável real (`notes`, `accounting_notes`,
  `validation_notes`, `updated_at`); allow se `ROW_COUNT > 0`.
- **DELETE** → allow=1 linha removida; deny=0 + registro preservado.
  Todas as tabelas fiscais têm DELETE=false por policy (exceto
  `fiscal_invoice_items` para administrador/financeiro).
- **RPC** — 4 casos por perfil:
  1. feliz path → staff `allow` (evento persistido com `event_source='USER'`,
     `performed_by=user_id`, `notes` gravado); demais `deny` (`forbidden`).
  2. invoice inexistente → `deny` (todos).
  3. `event_type` inválido → `deny` (todos).
  4. `notes` >2000 chars → `deny` (todos).
- **Views** — allow ↔ count>0 (fixture visível); deny ↔ count=0/42501.
- **Ownership** — produtor A vê `fiscal_invoices` A (ligado por
  `receivable_id` → `accounts_receivable` de A); produtor B **não** vê o
  invoice A.

## Como exportar

Na aba de resultados do SQL Editor, exportar CSV/JSON dos dois result-sets
e salvar em `restoration/fiscal-fase3-11/run-<data>.json`.

## Como verificar zero resíduos

O resumo traz a coluna `residuos`. Todos os contadores devem ser `0`. Se
qualquer contador for `> 0`, o script aborta com `ABORT 3.11.1`.

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
