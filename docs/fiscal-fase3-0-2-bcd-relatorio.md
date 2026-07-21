# Fase Fiscal 3.0.2-B / C / D — Relatório Local

**Data:** 2026-07-21
**Escopo:** Correção local (sem banco, sem migrations em runtime). Projeto de produção `navfzbwgwzruipouyfnk` intocado. Marker de staging `ikaauvsflpmamgxmkhoq` preservado (nenhum acesso).

---

## Parte B — RLS Harness (fixture-based, staging-only)

Arquivos:
- `src/test/fiscal/rls/matrix.ts` — matriz RLS canônica com `OWNERSHIP_CELLS` e `PLANNED_COUNTS`. Diretiva ESLint órfã removida.
- `src/test/fiscal/rls/guard.ts` — `assertStagingOnly` + `assertStagingMarker`. Rejeita duro qualquer `PROD_PROJECT_REF` e exige match exato com `FISCAL_TEST_PROJECT_REF`.
- `src/test/fiscal/rls/runner.ts` — três-estados (`disabled` | `local-only` | `staging`). Payload factories por tabela. Fixtures determinísticas via service role, apenas em staging. Execução sequencial: REST → Views → Ownership → RPC. `classifyHttp` determinístico (2xx=allow / 401,403,PGRST=deny / demais=error).
- `src/test/fiscal/rls/harness.test.ts` — importa dinamicamente para evitar side-effects locais; skip explícito quando `FISCAL_TEST_ENV≠STAGING`.

**Comportamento local:** 2 skips em `harness.test.ts` (esperado, mode `disabled`). Nenhuma tentativa de conexão.

---

## Parte C — Backfill scripts (dry-run seguro)

Diretório: `restoration/backfill-fiscal-fase3/`
- `01-prepare.sql` — fixtures deterministicas (UUIDs fixos), 10 invoices legacy, ownership via `receivable_id` (schema real; sem `customer_id` direto).
- `02-baseline.sql` — snapshot pré-migration (contagens + hashes UUID).
- `03-apply.sh` — triple guard (env `FISCAL_TEST_ENV`, ref `FISCAL_TEST_PROJECT_REF`, checksum canônico da migration 20260722000000). Rejeita produção duro.
- `04-verify.sql` — `IS DISTINCT FROM` para diffs, checagem de órfãos, validação de índices e RLS habilitada.
- `99-cleanup.sql` — remove fixtures preservando marker de staging.
- `README.md` — fluxo, ordem e regras anti-produção.

**Aplicação:** não executada. Pronto para staging quando os secrets `PGURL_STAGING` etc. forem provisionados.

---

## Parte D — Type Verifier + Scanners

### Type verifier (`scripts/verify-fiscal-types.ts`)
Contrato estrito:
- 9 tabelas, 5 views, 2 RPCs.
- Colunas: existência + nullability + tipo TS.
- Relationships: `columns` × `referencedRelation` × `referencedColumns` exatos.
- RPC: args obrigatórios × opcionais × retorno; falha em arg extra ou opcionalidade errada.
- Regra crítica: `fiscal_events.fiscal_invoice_id` NOT NULL (contrato final 3.0.2-A). Zero tolerância.

Teste (`src/test/fiscal/verify-fiscal-types.test.ts`): 12 casos.
- 1 positivo (fixture canônica).
- 11 negativos: tabela ausente, coluna ausente, tipo errado, nullability errada, `fiscal_invoice_id` nullable proibido, relationship com `referencedRelation` errado, view ausente, arg RPC ausente, arg obrigatório marcado opcional, arg extra, retorno errado.

**CLI vs types.ts real:** falha esperada — schema fiscal 3.0.2-A ainda não regenerado (aguarda aplicação em staging). Os testes unitários do verificador não dependem do `types.ts` real e passam.

### Scanners divididos
- `scripts/fiscal-secrets-scan.sh` — detecta APENAS valores reais: JWT triplo, `sb_secret_*`, `sbp_*`, URL Postgres com senha embutida (exclui placeholders `<...>`), blocos PEM, arquivos `.pfx/.p12`. Ignora `node_modules`, `dist`, `build`, `.git`, lockfiles, o próprio scanner par, e `scripts/fixtures/**`. Nunca ecoa valor — apenas `[LABEL] arquivo:linha — valor mascarado`.
- `scripts/fiscal-integration-scan.sh` — detecta integração fiscal prematura em runtime (`src/`, `supabase/functions/`): hosts (`api.focusnfe.com`, `sefaz`, `nfse.gov.br`, `plugnotas`), imports (`focus-nfe(-node)`), e `fetch()` para esses provedores. Ignora `docs/`, `restoration/`, `src/test/`, `scripts/fixtures/**`. Nunca falha por mera menção a nome de env (`Deno.env.get("FOCUS_TOKEN")` passa).

Fixtures (`scripts/fixtures/fiscal-scan/`):
- `pass.txt` — menções legítimas de env e placeholders.
- `fail-secrets.txt` — JWT, service_role, PG URL, PEM.
- `fail-integration.ts` — import SDK + fetch a provedor.

Testes (`src/test/fiscal/scanners.test.ts`): 4 casos (2 PASS + 2 FAIL) validando exit codes, presença dos rótulos e ausência de vazamento (asserts negativos contra o valor real).

`scripts/fiscal-security-scan.sh` (legado 3.0.1) removido — superseded pelos dois scanners divididos.

---

## Validações locais

| Gate                                            | Resultado                              |
| ----------------------------------------------- | -------------------------------------- |
| `bunx tsgo --noEmit`                            | OK                                     |
| `bunx vitest run` (suíte completa)              | 411 passed / 2 skipped (49 arquivos)   |
| `bunx vitest run src/test/fiscal`               | 62 passed / 2 skipped (8 arquivos)     |
| `bash scripts/fiscal-secrets-scan.sh` (repo)    | OK — 0 valores reais                   |
| `bash scripts/fiscal-integration-scan.sh` (repo)| OK — 0 integrações em runtime          |
| Scanner secrets vs `fail-secrets.txt`           | FAIL correto, valores não vazados      |
| Scanner integration vs `fail-integration.ts`   | FAIL correto                           |
| Scanner secrets vs `pass.txt`                   | OK                                     |
| Scanner integration vs `pass.txt`               | OK                                     |

**Anti-produção:** nenhum acesso a `navfzbwgwzruipouyfnk`. Marker `ikaauvsflpmamgxmkhoq` preservado (não tocado). Nenhuma migration aplicada.

---

## Próximo passo (bloqueado — aguarda autorização)

Fase Fiscal 3.1 **não iniciada**. Para retomar a certificação SQL da subphase 3.0.2-A.2 é necessário provisionar em staging:
- `FISCAL_TEST_ENV=STAGING`
- `FISCAL_TEST_PROJECT_REF=ikaauvsflpmamgxmkhoq`
- `PGURL_STAGING`, `PGREST_STAGING`, `PGREST_ANON_KEY`, `PGREST_SERVICE_ROLE_KEY`
