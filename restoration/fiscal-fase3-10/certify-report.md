# Fiscal Staging Certify — Fase 3.10

- Modo: **dry-run**
- Classificação: **PREPARADO**
- Ref (sufixo): `***`
- Guards: OK
- Totais: planned=10 executed=0 passed=0 failed=0 skipped=0

## Gates
- **A** anti-produção + marker — planned (0ms) — writes=false
  - Confere env, ref != PROD, hosts, marker _fiscal_staging_marker.
- **B** migrations: list + checksum + dry-run — planned (0ms) — writes=false
  - Lista supabase/migrations/2026072*_fiscal_*.sql e calcula sha256.
- **C** aplicar migrations fiscais canônicas — planned (0ms) — writes=true
  - Só em --execute. Delegado a restoration/backfill-fiscal-fase3/03-apply.sh.
- **D** types.ts oficial + verificador — planned (0ms) — writes=false
  - Executa verify-fiscal-types.ts contra o arquivo canônico.
- **E** mask_sensitive_jsonb runtime — planned (0ms) — writes=false
  - Executa mask.sql.test.ts contra PGURL_STAGING.
- **F** backfill sintético — planned (0ms) — writes=true
  - prepare + baseline + verify em ambiente descartável.
- **G** setup de usuários sintéticos — planned (0ms) — writes=true
  - SERVICE_ROLE cria auth.users sintéticos apenas em staging.
- **H** matriz RLS completa (630 asserts) — planned (0ms) — writes=false
  - harness.test.ts corre a matriz inteira; skip=falha.
- **I** smoke fiscal-preflight (apenas se implantado) — planned (0ms) — writes=false
  - Fetch autenticado. Espera canTransmit:false, provider:NONE, production:false.
- **J** teardown + relatório — planned (0ms) — writes=true
  - Cleanup restrito às fixtures marcadas + emissão do relatório sanitizado.

## Notas
- DRY-RUN — nenhuma migration/SQL foi aplicado.
- Variáveis presentes: 0/6
- Variáveis ausentes: FISCAL_TEST_ENV, FISCAL_TEST_PROJECT_REF, PGURL_STAGING, PGREST_STAGING, PGREST_ANON_KEY, PGREST_SERVICE_ROLE_KEY
- Execução real exige --execute + todas as variáveis + marker + ref!=navfzbwgwzruipouyfnk.
