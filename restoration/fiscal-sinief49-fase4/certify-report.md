# Fase SINIEF 4.0 — Relatório de Certificação (pré-execução)

- Alvo: staging AR-Bio-TEMP (`ikaauvsflpmamgxmkhoq`)
- Produção bloqueada: `navfzbwgwzruipouyfnk`
- Modo: **PREPARADO — nenhum passo em banco foi executado neste sandbox**

## Entregáveis

| Item | Caminho |
| --- | --- |
| Guard reutilizável staging-only | `src/test/fiscal/sinief49/staging/guard.ts` |
| Testes do guard | `src/test/fiscal/sinief49/staging/guard.test.ts` |
| Snapshot pré-migration (read-only) | `restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql` |
| Snapshot pós-migration (read-only) | `restoration/fiscal-sinief49-fase4/01-snapshot-post.sql` |
| Fixtures sintéticas por papel | `restoration/fiscal-sinief49-fase4/10-fixtures.sql` |
| 7 cenários sintéticos | `restoration/fiscal-sinief49-fase4/11-scenarios.sql` |
| Cleanup determinístico | `restoration/fiscal-sinief49-fase4/99-cleanup.sql` |
| Runbook idempotente | `restoration/fiscal-sinief49-fase4/README.md` |
| Verificador types.ts SINIEF 49 | `scripts/verify-fiscal-types-sinief49.ts` |
| Testes do verificador | `src/test/fiscal/sinief49/staging/verifier.test.ts` |
| Auditoria estática dos artefatos | `src/test/fiscal/sinief49/staging/artifacts.static.test.ts` |

## Gates da Fase 4.0

| ID | Nome | Status |
| --- | --- | --- |
| G1 | Guard STAGING-ONLY (ref = `ikaauvsflpmamgxmkhoq`) | **PRONTO** |
| G2 | Snapshot pré/pós (read-only) da migration canônica | **PRONTO** |
| G3 | Fixtures + cleanup determinísticos | **PRONTO** |
| G4 | 7 cenários sintéticos + produto/microrganismo | **PRONTO** |
| G5 | Verificador types.ts pós-regeneração | **PENDENTE** — aguarda regeneração real |
| G6 | Runbook idempotente (checksum, list, dry-run, apply, verify, cleanup) | **PRONTO** |
| G7 | Testes estáticos anti-produção / sem secrets / canTransmit=false | **PRONTO** |
| G8 | Validações locais (vitest fiscal + typecheck + build) | ver seção abaixo |

## Cobertura dos guards
- FISCAL_TEST_ENV != STAGING → falha estruturada.
- FISCAL_TEST_PROJECT_REF ausente, produção ou divergente → falha.
- PGURL/PGREST ausentes, com ref de produção ou sem ref esperado → falha.
- Ausência total → `resolveSinief49GuardMode = "skip"` (somente testes locais).
- Marker `public._fiscal_staging_marker` obrigatório e comparado exatamente.

## Skips externos
- Aplicação de `20260807000000_fiscal_sinief_49_scaffolding.sql` — delegada
  a operador humano no staging.
- Regeneração de `src/integrations/supabase/types.ts` — depende de
  `SUPABASE_ACCESS_TOKEN` externo; até lá o verificador retorna `PENDING`.
- Deploy de `fiscal-preflight` — coberto por `scripts/fiscal-staging-deploy-preflight.sh`,
  exige `--confirm` e ambiente staging.

## Validações locais
Ver seção final da mensagem do agente para os comandos e resultados reais
(vitest suíte fiscal + `bunx tsx scripts/verify-fiscal-types-sinief49.ts`
+ `bun run typecheck` + `bun run build`).

## Classificação
Preparação: `AUTORIZADO A EXECUTAR FASE 4.1 NO STAGING` — sujeito à execução
real do runbook por operador com as variáveis exigidas e ao gate G5 saindo
de `PENDING` para `PASS` após regeneração de types.ts.
