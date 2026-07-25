# Fase SINIEF 4.0.2.1 — Pacote de Certificação Staging (AR-Bio-TEMP)

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
# 0. Marker + guard fail-fast é aplicado por CADA script (DO $$ RAISE EXCEPTION)
#    e ainda pelo runner via pacote `pg` (nunca psql com DSN em argv).

# 1. Snapshot PRÉ (fail-fast + evidência estruturada k|v).
#    Use variáveis libpq temporárias derivadas de PGURL_STAGING em memória;
#    não passe URI/DSN em argv de psql.
psql -v ON_ERROR_STOP=1 -A -F '|' \
  -f restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql \
  > restoration/fiscal-sinief49-fase4/snapshot-pre.txt

# 2. Checksum + migration list oficial pelo Supabase CLI.
supabase migration list --project-ref "$FISCAL_TEST_PROJECT_REF"
sha256sum supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql \
         supabase/migrations/20260808000000_fiscal_sinief_20_2026.sql

# 3. Aplicação canônica — fluxo oficial via CLI.
supabase db push --project-ref "$FISCAL_TEST_PROJECT_REF"

# 4. Snapshot PÓS + diff estrutural.
psql -v ON_ERROR_STOP=1 -A -F '|' \
  -f restoration/fiscal-sinief49-fase4/01-snapshot-post.sql \
  > restoration/fiscal-sinief49-fase4/snapshot-post.txt
diff -u restoration/fiscal-sinief49-fase4/snapshot-pre.txt \
        restoration/fiscal-sinief49-fase4/snapshot-post.txt || true

# 5. Fixtures + cenários + matriz RLS + cleanup — executados pelo runner.
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

## Fase 4.0.2.1 — histórico e regras de aplicação

- O staging AR-Bio-TEMP anterior recebeu `20260807000000_fiscal_sinief_49_scaffolding.sql`
  aplicado diretamente via SQL Editor, portanto **não há** registro
  correspondente em `supabase_migrations.schema_migrations` desse ambiente.
  **NÃO** usar `supabase migration repair` para forjar o histórico — a
  divergência é limitada a esse staging específico e não deve ser reproduzida.
- Ambientes oficiais (novo staging e produção) **devem obrigatoriamente**
  usar o fluxo canônico `supabase db push` (Supabase CLI). Reaplicação
  manual via SQL Editor está proibida e o runner recusa qualquer atalho.
- SINIEF 20/2026 é entregue em migration incremental separada:
  `supabase/migrations/20260808000000_fiscal_sinief_20_2026.sql` (aditiva).
  A migration 20260807000000 permanece intocada. Um stub documental vazio
  fica em `restoration/migrations/20260808000000_fiscal_sinief_20_2026.sql`
  apenas para preservar a esteira histórica.
- O runner consulta `public._fiscal_staging_marker` via pacote `pg`
  server-side (conexão em memória, fechada em `finally`) ANTES de qualquer
  escrita. A DSN nunca é passada como argumento de processo (`psql <DSN>`)
  em pontos de risco de exposição; erros nunca vazam DSN nem project_ref
  completo.
- Setup obrigatório do `cliente_produtor`: **auth user → clientes →
  user_clientes(is_active=true, principal=true) → user_roles**. O trigger
  real exige vínculo cliente ANTES da role. Teardown REVERSO:
  user_roles → user_clientes → clientes → `auth.admin.deleteUser`.
- Esperado nas 3 novas tabelas (`fiscal_invoice_references`,
  `fiscal_invoice_item_references`, `fiscal_stock_loss_contexts`): zero
  visibilidade e nenhuma escrita para `cliente_produtor` e usuário sem papel.

## Regras inegociáveis


- `supabase migration repair` é proibido sem divergência comprovada em
  `supabase migration list`.
- Nenhum passo grava `SUPABASE_ACCESS_TOKEN` no repositório.
- `canTransmit` permanece `false` em `fiscal-preflight` durante toda a fase.
- Runner NUNCA imprime senha, JWT, anon key, service_role, DSN ou
  project_ref completo em falhas.
- Usuários sintéticos são criados/removidos EXCLUSIVAMENTE via
  `auth.admin.createUser` / `auth.admin.deleteUser`. Nenhum `INSERT INTO
  auth.users` ou `DELETE FROM auth.users` é feito por SQL.
- Cleanup só remove IDs `00000000-0000-4000-8000-*` e papéis/vínculos dos
  user_ids sintéticos listados na tabela temporária `_sinief49_fx_users`.
- Ordem obrigatória: snapshot-pre → migration (via `supabase db push`) →
  snapshot-post → runner (marker via `pg` → createUser+login → clientes
  → user_clientes → user_roles → fixtures → cenários → matriz RLS →
  cleanup reverso + deleteUser) → types → verifier → typecheck/build/vitest.

## Artefatos

| Arquivo | Escopo |
| --- | --- |
| `00-snapshot-pre.sql` | Fail-fast marker + evidência k\|v ANTES da migration. |
| `01-snapshot-post.sql` | Fail-fast asserts (10 colunas, 3 tabelas, RLS, policies SELECT/INSERT sem UPDATE/DELETE, grants, 13+7 event types) + evidência k\|v. |
| `10-fixtures.sql.tpl` | Template psql `\set` — cria user_roles e invoice-alvo com payload NOT NULL válido; sem INSERT em auth.users; setup cliente_produtor precede via runner. |
| `11-scenarios.sql.tpl` | 7 cenários SINIEF 49/2025 parametrizados; payloads schema-válidos. |
| `99-cleanup.sql` | Ordem reversa: dependências → domínio → user_roles → user_clientes → clientes; **não** toca auth.users; fail-fast "zero fixture residual". |
| `runner/run-staging.ts` | Runner server-side (marker via `pg`, auth.admin.createUser + login real + matriz RLS + deleteUser). Requer `--execute`; skip proibido. |
