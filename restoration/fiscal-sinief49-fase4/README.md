# Fase SINIEF 4.0 — Pacote de Certificação Staging (AR-Bio-TEMP)

Ref permitido: `ikaauvsflpmamgxmkhoq` · Ref proibido: `navfzbwgwzruipouyfnk`.

Nada aqui é executado dentro do sandbox Lovable. Todos os passos exigem
`FISCAL_TEST_ENV=STAGING`, `FISCAL_TEST_PROJECT_REF=ikaauvsflpmamgxmkhoq`,
`PGURL_STAGING`, `PGREST_STAGING`, `PGREST_ANON_KEY`, `PGREST_SERVICE_ROLE_KEY`
e o marker `public._fiscal_staging_marker='STAGING'` presente no banco alvo.

## Roteiro idempotente (executar fora do sandbox)

```bash
# 0. Guards e marker.
psql "$PGURL_STAGING" -Atqc \
  "SELECT count(*) FROM public._fiscal_staging_marker
    WHERE marker='STAGING' AND project_ref='ikaauvsflpmamgxmkhoq'" | grep -qx 1

# 1. Snapshot PRÉ.
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -A -F '|' \
  -f restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql \
  > restoration/fiscal-sinief49-fase4/snapshot-pre.txt

# 2. Checksum + migration list dry-run (não aplica).
supabase migration list --project-ref "$FISCAL_TEST_PROJECT_REF"
sha256sum supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql

# 3. Aplicação — SÓ staging.
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql

# 4. Snapshot PÓS + diff.
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -A -F '|' \
  -f restoration/fiscal-sinief49-fase4/01-snapshot-post.sql \
  > restoration/fiscal-sinief49-fase4/snapshot-post.txt
diff -u restoration/fiscal-sinief49-fase4/snapshot-pre.txt \
        restoration/fiscal-sinief49-fase4/snapshot-post.txt || true

# 5. Fixtures + cenários (staging apenas).
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
  -f restoration/fiscal-sinief49-fase4/10-fixtures.sql
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
  -f restoration/fiscal-sinief49-fase4/11-scenarios.sql

# 6. Smoke RLS por papel (harness já existente).
bunx vitest run src/test/fiscal/rls/harness.test.ts

# 7. Regeneração de types e verificador (não roda aqui — token fica fora).
npx supabase gen types typescript \
  --project-id "$FISCAL_TEST_PROJECT_REF" --schema public \
  > src/integrations/supabase/types.ts
bunx tsx scripts/verify-fiscal-types.ts
bunx tsx scripts/verify-fiscal-types-sinief49.ts

# 8. Validações locais completas.
bun run typecheck && bun run build
bunx vitest run

# 9. Cleanup determinístico.
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
  -f restoration/fiscal-sinief49-fase4/99-cleanup.sql
```

## Regras inegociáveis

- `supabase migration repair` fica proibido sem divergência comprovada em
  `supabase migration list`.
- Nenhum passo usa `SUPABASE_ACCESS_TOKEN` dentro do repositório.
- `canTransmit` deve permanecer `false` em `fiscal-preflight` durante toda
  a Fase 4.0. Nenhum XML, provedor ou URL SEFAZ é introduzido.
- Cleanup só remove IDs `00000000-0000-4000-8000-*` e usuários
  `%@sinief49.fixture.local`.
- Ordem obrigatória: pre → migration → post → fixtures → cenários → smoke →
  types → verifier → typecheck/build/tests → cleanup.

## Artefatos

| Arquivo | Escopo |
| --- | --- |
| `00-snapshot-pre.sql` | Baseline SOMENTE LEITURA antes da migration. |
| `01-snapshot-post.sql` | Verifica aditividade, RLS, grants, event_type, zero-alteração de dados. |
| `10-fixtures.sql` | Usuários sintéticos por papel + invoice-alvo. |
| `11-scenarios.sql` | 7 cenários SINIEF 49/2025 com produto e microrganismo direto. |
| `99-cleanup.sql` | Remove fixtures determinística e transacionalmente. |
| `../../scripts/verify-fiscal-types-sinief49.ts` | Verifica types.ts pós-regeneração; retorna PENDING até execução real. |
| `../../src/test/fiscal/sinief49/staging/guard.ts` | Guard reutilizável staging-only. |
| `certify-report.md` | Emitido pela Fase 4.1 após execução real; ver `../fiscal-fase3-10/certify-report.md` como referência de formato. |
