# Fase SINIEF 4.0.1 — Pacote de Certificação Staging (AR-Bio-TEMP)

Ref permitido: `ikaauvsflpmamgxmkhoq` · Ref proibido: `navfzbwgwzruipouyfnk`.

Nada aqui é executado dentro do sandbox Lovable. A execução real exige o
**runner server-side** `runner/run-staging.ts` com `--execute`, todas as
variáveis abaixo definidas e o marker `public._fiscal_staging_marker`
presente no banco alvo.

Variáveis obrigatórias:
`FISCAL_TEST_ENV=STAGING`, `FISCAL_TEST_PROJECT_REF=ikaauvsflpmamgxmkhoq`,
`PGURL_STAGING`, `PGREST_STAGING`, `PGREST_ANON_KEY`, `PGREST_SERVICE_ROLE_KEY`.

Ausência ou configuração parcial → o runner sai com código 2 e não toca
Supabase. Skip nunca é permitido em `--execute`.

## Roteiro idempotente (executar fora do sandbox)

```bash
# 0. Marker + guard fail-fast é aplicado por CADA script (DO $$ RAISE EXCEPTION).

# 1. Snapshot PRÉ (fail-fast + evidência estruturada k|v).
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -A -F '|' \
  -f restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql \
  > restoration/fiscal-sinief49-fase4/snapshot-pre.txt

# 2. Checksum + migration list.
supabase migration list --project-ref "$FISCAL_TEST_PROJECT_REF"
sha256sum supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql

# 3. Aplicação — somente staging.
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql

# 4. Snapshot PÓS + diff estrutural.
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -A -F '|' \
  -f restoration/fiscal-sinief49-fase4/01-snapshot-post.sql \
  > restoration/fiscal-sinief49-fase4/snapshot-post.txt
diff -u restoration/fiscal-sinief49-fase4/snapshot-pre.txt \
        restoration/fiscal-sinief49-fase4/snapshot-post.txt || true

# 5. Fixtures + cenários + matriz RLS + cleanup — executados pelo runner.
#    O runner cria usuários via auth.admin.createUser, obtém JWT real por
#    login e injeta os UUIDs nos templates .sql.tpl via psql \set.
bunx tsx restoration/fiscal-sinief49-fase4/runner/run-staging.ts --execute

# 6. Regeneração de types + verificador (token fora do repo).
npx supabase gen types typescript \
  --project-id "$FISCAL_TEST_PROJECT_REF" --schema public \
  > src/integrations/supabase/types.ts
bunx tsx scripts/verify-fiscal-types.ts
bunx tsx scripts/verify-fiscal-types-sinief49.ts

# 7. Validações locais completas.
bun run typecheck && bun run build && bunx vitest run
```

## Fase 4.0.2 — adendos

- A migration `20260807000000_fiscal_sinief_49_scaffolding.sql` foi aplicada
  manualmente no staging fora do pipeline `supabase db push`; portanto NÃO
  há registro correspondente em `supabase_migrations.schema_migrations`.
  **Não usar** `supabase migration repair` — a divergência é esperada e
  documentada. Reaplicação futura é bloqueada pelos guards `IF NOT EXISTS`
  e `DO $$ RAISE EXCEPTION` embutidos nos scripts.
- SINIEF 20/2026 é entregue como migration incremental separada em
  `restoration/migrations/20260808000000_fiscal_sinief_20_2026.sql`
  (aditiva; adiciona `icms_due`, `icms_amount`, `original_recipient_snapshot`,
  CHECKs, trigger de imutabilidade e 2 novos event types). A migration
  20260807000000 permanece intocada.
- O runner agora consulta `public._fiscal_staging_marker` via `psql`
  (`PGURL_STAGING`) ANTES de qualquer escrita, além do check via PostgREST.
  Falhas não vazam DSN nem project_ref completo.
- Setup `cliente_produtor` na ordem cliente → user_clientes (principal/ativo)
  → user_roles; teardown em ordem reversa via `99-cleanup.sql`.
  Esperado nas 3 novas tabelas: zero visibilidade e nenhuma escrita para
  `cliente_produtor` e para o usuário sem papel.

## Regras inegociáveis


- `supabase migration repair` é proibido sem divergência comprovada em
  `supabase migration list`.
- Nenhum passo grava `SUPABASE_ACCESS_TOKEN` no repositório.
- `canTransmit` permanece `false` em `fiscal-preflight` durante toda a fase.
- Runner NUNCA imprime senha, JWT, anon key ou service_role.
- Usuários sintéticos são criados/removidos EXCLUSIVAMENTE via
  `auth.admin.createUser` / `auth.admin.deleteUser`. Nenhum `INSERT INTO
  auth.users` ou `DELETE FROM auth.users` é feito por SQL.
- Cleanup só remove IDs `00000000-0000-4000-8000-*` e papéis dos user_ids
  sintéticos listados na tabela temporária `_sinief49_fx_users`.
- Ordem obrigatória: snapshot-pre → migration → snapshot-post → runner
  (fixtures → cenários → matriz RLS → cleanup + deleteUser) → types → verifier.

## Artefatos

| Arquivo | Escopo |
| --- | --- |
| `00-snapshot-pre.sql` | Fail-fast marker + evidência k\|v ANTES da migration. |
| `01-snapshot-post.sql` | Fail-fast asserts (10 colunas, 3 tabelas, RLS, policies SELECT/INSERT sem UPDATE/DELETE, grants, 13+7 event types) + evidência k\|v. |
| `10-fixtures.sql.tpl` | Template psql `\set` — cria user_roles e invoice-alvo com payload NOT NULL válido; **sem INSERT em auth.users**. |
| `11-scenarios.sql.tpl` | 7 cenários SINIEF 49/2025 parametrizados; payloads schema-válidos (invoice_type, status, created_by, item_sequence, item_kind). |
| `99-cleanup.sql` | Ordem dependências → domínio → user_roles; **não** toca auth.users; fail-fast final "zero fixture residual". |
| `runner/run-staging.ts` | Runner server-side (auth.admin.createUser + login real + matriz RLS + deleteUser). Requer `--execute`; skip proibido. |
