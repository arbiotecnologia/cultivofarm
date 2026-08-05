# CORREÇÃO 2 DE AUDITORIA — Migration promovível e ledger do staging

- **Base:** `c4061fec06d7fa8295285e732f03add8baab2282`
- **Ambiente:** staging `ikaauvsflpmamgxmkhoq` **somente**
- **Produção `navfzbwgwzruipouyfnk`:** não conectada, não consultada, não migrada, não publicada
- **Status final:** ✅ **APTO**

---

## 1. Validação fail-closed do staging

| Verificação | Resultado |
|---|---|
| `project_ref` do DSN | `ikaauvsflpmamgxmkhoq` |
| `public._fiscal_staging_marker` | `STAGING` / `ikaauvsflpmamgxmkhoq`, exatamente 1 linha |
| Ledger `supabase_migrations.schema_migrations` | 642 linhas, 642 distintas, 0 duplicidades |

## 2. As cinco migrations posteriores ao ledger (ordem cronológica)

1. `20260805182000_visita_workspace_runtime_fix`
2. `20260806000000_fiscal_microorganism_profiles`
3. `20260807000000_fiscal_sinief_49_scaffolding`
4. `20260808000000_fiscal_sinief_20_2026`
5. `20260809000000_carteira_anon_hardening_canonico`

## 3. Prova de paridade estrutural (catálogo + colunas + postcheck)

Nenhuma versão foi marcada sem prova. Todos os objetos existem **integralmente**.

| Versão | Objetos esperados | Encontrados | Prova adicional |
|---|---|---|---|
| `20260805182000` | 2 funções | 2/2 | `POSTCHECK_RUNTIME_FINAL_PASS` |
| `20260806000000` | 1 tabela (27 col.), 1 view, 1 índice, 1 trigger, 2 policies | 100% | RLS habilitada |
| `20260807000000` | 3 tabelas (colunas conferidas 1:1), 9 índices, 6 policies | 100% | RLS habilitada nas 3 |
| `20260808000000` | 1 função, 1 trigger | 2/2 | — |
| `20260809000000` | 2 overloads de `can_user_access_cliente`, 1 policy, 0 privilégios `anon`/`PUBLIC` | 100% | `POSTCHECK_CARTEIRA_ANON_PASS` |

Resultado: **PARIDADE_TOTAL** — zero divergências, nenhum BLOCKED.

Checksums funcionais (`md5(pg_get_functiondef)`) idênticos antes e depois de toda a execução:

```
can_user_access_cliente(_cliente_id uuid)                = 4c2eaf7ab10e204e7ad57d41cb418554
can_user_access_cliente(_user_id uuid, _cliente_id uuid) = c0acb1dcd7f0b183f9500f4c264c1fa1
rpc_get_visita_workspace(p_registro_id uuid)             = c43f27400905922bbb91fbe908a70589
rpc_upsert_recomendacao_visita(...)                      = 42f87a90cb7d1be324b43bb3867b3a28
fiscal_sinief20_snapshot_immutable()                     = cc1aa1a61454e37efe0195620e1455b8
```

## 4. Guard promovível da `20260809000000`

O guard passou a aceitar **exatamente dois pares**:

- `marker='STAGING'` + `project_ref='ikaauvsflpmamgxmkhoq'`
- `marker='PRODUCTION'` + `project_ref='navfzbwgwzruipouyfnk'`

Ausência da tabela, 0 linhas, duplicidade, NULL, combinação cruzada ou qualquer outro valor ⇒ `GUARD_ABORT`.

### Teste controlado (10 cenários, todos em transação revertida, sem conectar à produção)

| # | Cenário | Esperado | Obtido |
|---|---|---|---|
| B1 | `STAGING` + ref staging | aceita | `GUARD_OK` |
| B2 | `PRODUCTION` + ref produção | aceita | `GUARD_OK` |
| B3 | 0 linhas | abort | `GUARD_ABORT: ... 0 linhas` |
| B4 | 2 linhas (duplicidade) | abort | `GUARD_ABORT: ... 2 linhas` |
| B5 | `marker` NULL | abort | `GUARD_ABORT: marker/project_ref NULL` |
| B6 | `project_ref` NULL | abort | `GUARD_ABORT: marker/project_ref NULL` |
| B7 | cruzado `STAGING`+ref produção | abort | `GUARD_ABORT: par não autorizado` |
| B8 | cruzado `PRODUCTION`+ref staging | abort | `GUARD_ABORT: par não autorizado` |
| B9 | valor arbitrário | abort | `GUARD_ABORT: par não autorizado` |
| B10 | strings vazias | abort | `GUARD_ABORT: par não autorizado` |

Também executada a bateria A1–A10 contra a tabela marcadora **real**, onde as próprias constraints (`CHECK`, `NOT NULL`, `PK`) barram as combinações antes do guard — defesa em profundidade. Marcador real verificado intacto após todos os `ROLLBACK`.

Resultado: **GUARD_PROMOVIVEL_PASS**. A migration é **candidata promovível, não promovida** — produção não foi acessada.

## 5. Hashes e idempotência

| | Antes | Depois |
|---|---|---|
| sha256 | `307c3b7c8bc1158edbe9f8390a43b22c9bdc7b5a07393b9b7e448e3b3993c584` | `dafa288a9162655a6084ced85edad5b2de6b3abea7afb0d477747ef361e29e3a` |
| bytes | 10736 | 11210 |

Alteração restrita ao bloco `DO $guard$`. Reexecução em staging via `psql --single-transaction -v ON_ERROR_STOP=1` ⇒ exit 0, com todos os md5 funcionais inalterados (`MD5_UNCHANGED_PASS`).

## 6. Reconciliação do ledger — mecanismo oficial

Nenhum DML manual foi executado em `supabase_migrations.schema_migrations`.

```
supabase migration repair --status applied \
  20260805182000 20260806000000 20260807000000 20260808000000 20260809000000 \
  --db-url "$STAGING_DSN"
```

Supabase CLI `2.111.0`. Saída: `Repaired migration history: [...] => applied`.

| Ledger | Máx. versão | Total | Distintas | Duplicidades |
|---|---|---|---|---|
| Antes | `20260805155043` | 642 | 642 | 0 |
| Depois | `20260809000000` | 647 | 647 | 0 |

`supabase migration list --db-url $STAGING_DSN` confirma as cinco versões alinhadas Local↔Remote. Entre as cinco: **0 lacuna, 0 fantasma, 0 duplicidade**.

### Divergência pré-existente (fora do escopo desta correção)

O comparativo global repo×ledger revela 47 versões só-repo e 66 só-ledger, todas em `20260727`–`20260731`, resultado de uma deriva de timestamp de ±2 s em execuções anteriores, mais `20260804000000`, `20260805000000` e `20260805040000`. Todas são **anteriores** ao ledger head desta correção e **não foram tocadas** — reconciliá-las exigiria escopo próprio e autorização.

## 7. Testes

| Teste | Resultado |
|---|---|
| Guard controlado | 10/10 conforme esperado |
| `POSTCHECK_CARTEIRA_ANON_PASS` | ✅ |
| `POSTCHECK_RUNTIME_FINAL_PASS` | ✅ |
| `POSTCHECK_CONSOLIDACAO_OK` | ✅ |
| Harness carteira/anon | **15 PASS / 0 FAIL** |
| Visita T1–T18 | **18 PASS / 0 FAIL** |
| `tsgo --noEmit` | PASS (exit 0) |
| Vitest | 2723 passed / 4 skipped, 166 arquivos — exit 0 |
| Build | PASS (exit 0) |

## 8. Resíduos

- Fixtures desta execução: **0** · Blobs: **0** · Triggers desabilitados: **0**
- Observação: 4 usuários `fase-e-*@arbio-staging.test` de 2026-07-31 são resíduo **pré-existente** de fase anterior; não criados nem tocados aqui.

## 9. Escopo preservado

Não foram alterados: React, rotas, dados, financeiro, fiscal, ponte recomendação→pedido, nem qualquer função/policy além da igualdade com o hardening homologado. `rollback.sql`, `postcheck.sql`, `harness-runtime.sql` e `manifest.json` permanecem em `restoration/carteira-anon-hardening/`, fora de `supabase/migrations/`.

---

**STATUS: APTO**
