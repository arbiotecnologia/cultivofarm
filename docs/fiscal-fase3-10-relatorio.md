# Fase Fiscal 3.10 — Relatório A–T

**Status:** PREPARADO (pacote entregue; nenhum comando foi executado; nenhum
secret foi solicitado ou usado).

## A. Objetivo

Empacotar e orquestrar, num único ponto de entrada, todos os gates fiscais
já materializados nas Fases 3.0.1–3.9, para execução posterior num Supabase
descartável de STAGING. Nenhum código novo de negócio; apenas orquestração,
guardas, sanitização, testes e documentação.

## B. Escopo

- Orquestrador: `scripts/fiscal-staging-certify.ts` (dry-run padrão).
- Deploy separado, staging-only: `scripts/fiscal-staging-deploy-preflight.sh`.
- Testes locais: `src/test/fiscal/fase3_10.static.test.ts` (invariantes) e
  `src/test/fiscal/fase3_10.orchestrator.test.ts` (unidade).
- Documentação: este relatório + guia não técnico
  `docs/fiscal-fase3-10-guia-secrets.md`.

## C. Fora de escopo

Emissão fiscal, provedor, certificado, webhook, deploy real do
`fiscal-preflight`, criação de usuários, aplicação de migrations, contato com
qualquer projeto Supabase (produção `navfzbwgwzruipouyfnk` explicitamente
proibido).

## D. Inventário canônico reutilizado

| Domínio | Artefato canônico | Reuso pela Fase 3.10 |
|---|---|---|
| Guard anti-produção | `src/test/fiscal/rls/guard.ts` | Regras replicadas no orquestrador (mesmo `PROD_PROJECT_REF`). |
| Marker STAGING | `public._fiscal_staging_marker` | Documentado no guia. |
| Migrations fiscais canônicas | `supabase/migrations/2026072*_fiscal_*.sql` | Gate B (list/checksum) + Gate C (delegado ao `03-apply.sh`). |
| Types.ts + verifier | `scripts/verify-fiscal-types.ts` + `src/integrations/supabase/types.ts` | Gate D. |
| Máscara SQL | `src/test/fiscal/rls/mask.sql.test.ts` | Gate E. |
| Backfill sintético | `restoration/backfill-fiscal-fase3/` | Gate F (prepare/baseline/verify) e Gate J (cleanup). |
| Runner RLS | `src/test/fiscal/rls/runner.ts` + `matrix.ts` | Gate G (setup usuários) + Gate H (matriz completa). |
| Scanners | `scripts/fiscal-secrets-scan.sh`, `scripts/fiscal-integration-scan.sh` | Rodados no CI local (não expostos como gate porque já são invariante estático). |
| Fail-closed preflight | `supabase/functions/_shared/fiscal/preflight.ts` + `fiscal-preflight/index.ts` | Gate I (smoke, opcional). Deploy separado. |

## E. Orquestrador

Fluxo:

1. `loadEnv()` — lê `FISCAL_TEST_ENV`, `FISCAL_TEST_PROJECT_REF`,
   `PGURL_STAGING`, `PGREST_STAGING`, `PGREST_ANON_KEY`,
   `PGREST_SERVICE_ROLE_KEY`. Nunca imprime valores.
2. `evaluateGuards()` — 0 vars ⇒ dry-run seguro; parcial ⇒ falha; completo ⇒
   valida marker=STAGING, ref ≠ prod, hosts consistentes.
3. Dry-run (sem `--execute`) ⇒ gera checklist com 10 gates em `planned`;
   classifica **PREPARADO**.
4. `--execute` ⇒ exige guardas ok + `guardExecute()`; executa Gate D
   (`verify-fiscal-types`) diretamente; demais gates delegados ao operador
   (marcados `skipped`, que zera APTO — por design).

## F. Ordem dos gates (A–J)

A anti-produção → B checksum → C migrations → D types.ts → E mask →
F backfill → G usuários sintéticos → H matriz RLS → I preflight smoke →
J teardown. Fail-fast: qualquer falha bloqueia o restante.

## G. Guardas anti-produção

- `PROD_PROJECT_REF = "navfzbwgwzruipouyfnk"` (constante compartilhada).
- Refs de produção proibidos em URL, host, REST e marker.
- Marker `_fiscal_staging_marker` com `project_ref` casado é pré-condição.
- Execução com ref divergente ⇒ classificação `INAPTO` e código de saída ≠ 0.

## H. Sanitização

`sanitize()` redige JWT triplo, `sb_secret_*`, `sbp_*`, `sbs_*`, `postgresql://
user:senha@…` e `password=…`. Aplicada em cada linha do relatório JSON/MD e em
todo stdout/stderr capturado de subprocessos.

## I. Relatório

- JSON sanitizado em `restoration/fiscal-fase3-10/certify-report.json`.
- Markdown legível em `restoration/fiscal-fase3-10/certify-report.md`.
- Contém `planned/executed/passed/failed/skipped`, tempos, classificação,
  sufixo mascarado do ref (`***abcd`). **Nunca** contém ref completo, secret,
  senha, JWT.

## J. Classificação

- Dry-run ⇒ sempre `PREPARADO`.
- `--execute` ⇒ `APTO` somente com 0 falhas, 0 skips e Gate J (teardown)
  `passed`. Qualquer skip ou falha ⇒ `INAPTO`.

## K. Deploy do `fiscal-preflight`

Comando separado (`scripts/fiscal-staging-deploy-preflight.sh`), staging-only,
exige `--confirm`, ref ≠ produção e `FISCAL_TEST_ENV=STAGING`. Não invoca
provedor externo e não usa `service_role`.

## L. Testes locais

- `fase3_10.static.test.ts` — arquivos, PROD ref, ausência de provedor,
  ordem dos gates A–J, dry-run padrão, sem `console.log(process.env.*)`.
- `fase3_10.orchestrator.test.ts` — dry-run sem env; parcial falha;
  `FISCAL_TEST_ENV ≠ STAGING` falha; ref de produção falha; PGURL/PGREST
  divergentes falham; `--execute` bloqueado sem guards; classificações
  `PREPARADO/APTO/INAPTO`; ordem A..J; `sanitize` redige JWT/pgurl/service.
- Regressão: `fase3_8.static.test.ts` e `fase3_9.static.test.ts` continuam
  verdes.

## M. Validação executada

- `bunx tsx scripts/verify-fiscal-types.ts` — ver seção S.
- `bunx vitest run src/test/fiscal/` — ver seção S.
- `scripts/fiscal-secrets-scan.sh scripts/fiscal-staging-certify.ts
  scripts/fiscal-staging-deploy-preflight.sh docs/fiscal-fase3-10-*.md
  src/test/fiscal/fase3_10.*.test.ts` — 0 hits.
- `scripts/fiscal-integration-scan.sh scripts/fiscal-staging-certify.ts
  scripts/fiscal-staging-deploy-preflight.sh` — 0 hits.
- `bun run typecheck`, `bun run build` — ver seção S.

## N. Riscos residuais

- Operador pode configurar apenas parte das variáveis. O orquestrador falha
  explicitamente (não faz skip silencioso).
- Ambiente sem `supabase` CLI. Gate C/I ficam `skipped` ⇒ `INAPTO` por design.
- Uso indevido do `service_role`. Mitigado por documentação + guard
  anti-produção; ainda depende de disciplina operacional.

## O. Deps

Nenhuma nova dependência adicionada. Reutiliza `node:child_process`, `node:fs`,
`node:crypto` e o `pg` já presente para os gates delegados.

## P. Impacto em produção

Zero. Nenhum arquivo do runtime (`src/**` exceto `src/test/**`) foi alterado.
Rota `/`, `/auth`, `/app` e módulos anteriores inalterados.

## Q. Reversibilidade

Remoção física dos arquivos de `scripts/fiscal-staging-*` e
`src/test/fiscal/fase3_10.*.test.ts` desliga a fase inteira. Não há
migration para reverter.

## R. Feature flags

Nenhuma nova feature flag. A fase é 100% ferramental de operação.

## S. Resultado dos gates locais

- `bun run typecheck` — PASS.
- `bun run build` — PASS.
- `bunx vitest run src/test/fiscal/` — PASS (Fase 3.10 inclusa).
- `bunx tsx scripts/verify-fiscal-types.ts` — PASS.
- `scripts/fiscal-secrets-scan.sh` sobre os artefatos novos — 0 findings.
- `scripts/fiscal-integration-scan.sh` sobre os artefatos novos — 0 findings.

## T. Classificação final

**PREPARADO.** Pacote fail-safe entregue, sem execução, sem secrets, sem toque
em produção. `APTO` só será atribuível quando o operador rodar
`fiscal:staging:certify --execute` num projeto STAGING isolado, com todos os
gates verdes e teardown confirmado.
