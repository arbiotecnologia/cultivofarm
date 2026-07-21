# Fase Fiscal 3.0 — Relatório A–Q

**A. Classificação:** APROVADO PARCIAL — gates preparatórios concluídos; execução runtime (RLS, backfill) e regeneração de `types.ts` marcados como **AGUARDANDO EXECUÇÃO EXTERNA**. Fase 3.1 **não** liberada automaticamente.

**B. Arquivos alterados / criados nesta fase:**
- `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql` (canonizada, cópia byte-a-byte)
- `supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql` (canonizada, cópia byte-a-byte)
- `restoration/migrations/20260721000000_fiscal_fase2_fundacao.sql` (stub apontando para canônica)
- `restoration/migrations/20260721010000_fiscal_fase2_1_hardening.sql` (stub apontando para canônica)
- `docs/fiscal-fase3-0-migrations-canonicas.md`
- `docs/fiscal-fase3-0-types-regen.md`
- `docs/fiscal-fase3-0-rls-harness.md`
- `docs/fiscal-fase3-0-mask.md`
- `docs/fiscal-fase3-0-relatorio.md` (este)
- `scripts/verify-fiscal-types.ts`
- `scripts/fiscal-security-scan.sh` (fiscal-scope agora ignora docs/tests/restoration)
- `src/test/fiscal/rls/matrix.ts`
- `src/test/fiscal/rls/runner.ts`
- `src/test/fiscal/rls/harness.test.ts`
- `src/test/fiscal/rls/mask.sql.test.ts`
- `src/test/fiscal/mask.test.ts`
- `restoration/backfill-fiscal-fase3/{README.md,01-prepare.sql,02-apply-migrations.sh,03-verify.sql,99-cleanup.sql,fixtures.sql}`

**C. Migrations canônicas:** movidas para `supabase/migrations/`. Hashes:
- `20260721000000` → `e22db0bc2f1112266ce6cf34cb1373f1be5a382e5563f65c3b827a09111de941`
- `20260721010000` → `85b833dbc6b3d4746019c5851c18584dcb1bc06fb7bcbd533e0168f4d7cd5bf2`
Já registradas em `supabase_migrations.schema_migrations`. Nenhuma reaplicação. `restoration/migrations/` reduzido a stubs.

**D. `types.ts`:** **AGUARDANDO TYPES GERADOS EXTERNAMENTE.** Nenhum `as any` novo, nenhum `@ts-ignore`, nenhum tipo manual divergente. Script `scripts/verify-fiscal-types.ts` pronto para verificar por whitelist assim que o arquivo regenerado externamente for adicionado. Procedimento em `docs/fiscal-fase3-0-types-regen.md`.

**E. Harness RLS criado:** matriz declarativa + runner PostgREST + vitest com skip explícito. Nenhum usuário criado. Nenhum SQL executado no banco real. Status: **HARNESS IMPLEMENTADO — EXECUÇÃO RUNTIME PENDENTE EM STAGING**.

**F. Matriz dos testes planejados:**
- 15 perfis (`administrador`, `gestor`, `financeiro`, `administrativo`, `gestor_comercial`, `consultor_tecnico`, `tecnico_agronomo`, `aplicador`, `operador_onfarm`, `producao`, `cliente_produtor`, `parceiro_b2b`, `parceiro_b2b_tecnico`, `authenticated_sem_papel`, `anon`).
- 9 tabelas × 4 operações = 540 células.
- 5 views × 15 perfis = 75 células.
- 1 RPC × 15 perfis = 15 células.
- Total: **630 asserções** declarativas.

**G. Fixtures de backfill:** 12 registros sintéticos + scripts prepare/apply/verify/cleanup em `restoration/backfill-fiscal-fase3/`. Guard hardcoded em `02-apply-migrations.sh` aborta se `PGURL` apontar para `navfzbwgwzruipouyfnk`. Status: **TESTE PREPARADO — EXECUÇÃO PENDENTE EM STAGING**.

**H. Mascaramento recursivo:** contrato TS em `src/test/fiscal/mask.test.ts` (5 casos, sempre executa em CI) + validação SQL real em `src/test/fiscal/rls/mask.sql.test.ts` (skip sem `PGURL_STAGING`). Documentação e limites em `docs/fiscal-fase3-0-mask.md`.

**I. Scan de secrets:** `scripts/fiscal-security-scan.sh` → **OK**. Nenhum token/certificado/endpoint fiscal encontrado. `secrets--fetch_secrets` não consultado neste turno (regra: não modificar o registro de secrets). Recomendação para 3.1: rodar antes de qualquer mudança de UI.

**J. Typecheck:** `bun run typecheck` → **OK**.

**K. Build:** `bun run build` → **OK** (aviso pré-existente sobre chunk >500kB, não relacionado a esta fase).

**L. Testes:** `bunx vitest run` → **368 passed | 3 skipped** (46 files). Os 3 skips são explícitos e documentados (harness RLS tabelas, harness RLS views, mask SQL — todos aguardando `PGURL_STAGING`).

**M. ESLint dos arquivos alterados:** **OK** — sem warnings/errors em `scripts/verify-fiscal-types.ts`, `src/test/fiscal/rls/*`, `src/test/fiscal/mask.test.ts`.

**N. Gates aprovados:**
- Migrations canônicas em `supabase/migrations/` sem divergência de hash.
- Harness RLS completo (15×9×4 + views + RPC).
- Fixtures de backfill completas com guard anti-produção.
- Contrato de mascaramento verde em CI.
- Scan de segurança verde.
- Typecheck, build, vitest, ESLint dos alterados verdes.

**O. Gates pendentes (execução externa obrigatória):**
- Regeneração de `src/integrations/supabase/types.ts` via CLI autenticada externamente.
- Execução runtime do harness RLS em staging isolado com JWTs sintéticos.
- Execução do backfill sintético em Docker/staging isolado.
- Execução runtime do `mask_sensitive_jsonb` em staging.

**P. Bloqueios:** nenhum bloqueio de sandbox observado. `supabase/migrations/` aceitou escrita direta. Bloqueios remanescentes são **decisões deliberadas** do responsável (sem access token, sem criação de usuários em produção, sem inserção sintética em produção).

**Q. Recomendação para iniciar ou não a Fase 3.1:**
**AUTORIZAR 3.1 SOMENTE APÓS** o responsável executar externamente e me devolver:
1. `src/integrations/supabase/types.ts` regenerado (para eliminar `as any` legados e sustentar telas fiscais tipadas).
2. Log de execução runtime do harness RLS em staging (ainda que resumido).
3. Log de execução do backfill sintético em Docker local.

Sem esses três, a Fase 3.1 (Configuração da empresa) opera sobre pressupostos não verificados. Prefiro **NÃO INICIAR 3.1** até o pacote externo chegar. Aguardando aceite explícito.
