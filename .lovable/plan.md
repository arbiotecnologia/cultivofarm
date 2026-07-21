
## Fase Fiscal 3.0 — Gates Técnicos

Escopo estritamente preparatório. Nenhuma emissão externa, nenhum provedor, nenhum certificado, nenhum token, nenhuma alteração em regras de negócio. Não iniciar 3.1 sem aceite explícito.

### Restrições absolutas (das decisões do responsável)
- Sem `SUPABASE_ACCESS_TOKEN`, `service_role`, senha de banco, JWT secret ou connection string em arquivos/logs/env versionados.
- Não criar/excluir usuários no projeto real.
- Não inserir dados sintéticos no banco real. Sem schema `fiscal_test` em produção.
- `supabase/migrations/` passa a ser o diretório canônico. `restoration/migrations/` deixa de ser fonte.
- Nenhum `as any` novo, nenhum `@ts-ignore`, nenhum tipo manual divergente de `types.ts`.

### 1. Canonização das migrations fiscais (`supabase/migrations/`)
1. Mover, byte-a-byte, os dois arquivos já aplicados no banco:
   - `restoration/migrations/20260721000000_fiscal_fase2_fundacao.sql` → `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql`
   - `restoration/migrations/20260721010000_fiscal_fase2_1_hardening.sql` → `supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql`
2. Garantir que ambas continuam idempotentes (guards `IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE`, `ALTER TABLE ... ADD CONSTRAINT` protegido por `pg_constraint` lookup). Sem alterar semântica.
3. Não reaplicar. Já estão registradas em `supabase_migrations.schema_migrations` (versões `20260721000000` e `20260721010000`). Documentar em `docs/fiscal-fase3-0-migrations-canonicas.md`:
   - hash SHA-256 de cada arquivo canônico;
   - procedimento de reconciliação para staging/produção (`INSERT ... ON CONFLICT DO NOTHING` em `schema_migrations`);
   - procedimento para banco novo (aplicar tudo em ordem cronológica).
4. Substituir o conteúdo de `restoration/migrations/*.sql` por um header apontando para a versão canônica (fonte única passa a ser `supabase/migrations/`). Sem apagar histórico.
5. Se o sandbox bloquear escrita em `supabase/migrations/`: interromper este gate, registrar bloqueio e o patch pronto no relatório. Não voltar a `restoration/` como fonte.

### 2. Preparação da regeneração de `types.ts` (sem executar)
1. Criar `docs/fiscal-fase3-0-types-regen.md` com:
   - comando exato (`npx supabase gen types typescript --project-id navfzbwgwzruipouyfnk --schema public > src/integrations/supabase/types.ts`);
   - pré-requisitos (CLI autenticada externamente, sem token no repo);
   - checklist de validação pós-geração (typecheck, build, vitest, diff de superfície).
2. Criar `scripts/verify-fiscal-types.ts` que, quando o arquivo novo for adicionado, verifica presença das tabelas/colunas fiscais esperadas (whitelist estática) e falha com mensagem clara se ausentes. Não inventa tipos.
3. Status permanece **AGUARDANDO TYPES GERADOS EXTERNAMENTE** até o arquivo ser fornecido. Nenhum `as any` novo introduzido nesta fase.

### 3. Harness RLS runtime (implementado, não executado)
1. Novo diretório `src/test/fiscal/rls/`:
   - `matrix.ts` — matriz declarativa `perfil × tabela × operação → esperado (allow|deny)` cobrindo os 15 perfis listados (`administrador`, `gestor`, `financeiro`, `administrativo`, `gestor_comercial`, `consultor_tecnico`, `tecnico_agronomo`, `aplicador`, `operador_onfarm`, `producao`, `cliente_produtor`, `parceiro_b2b`, `parceiro_b2b_tecnico`, `authenticated_sem_papel`, `anon`) × 8 tabelas fiscais × {SELECT, INSERT, UPDATE, DELETE} + views `v_fiscal_*` + RPC `rpc_fiscal_event_manual`.
   - `runner.ts` — dado `PGURL_STAGING` + `JWT_<ROLE>` no env, executa cada célula via PostgREST (`fetch` com header `Authorization`/`apikey`) e via `pg` client. Skip explícito quando envs ausentes (nunca em silêncio).
   - `harness.test.ts` — vitest que carrega a matriz. Em ambientes sem envs de staging, marca `test.skip` com mensagem "EXECUÇÃO RUNTIME PENDENTE EM STAGING".
2. `docs/fiscal-fase3-0-rls-harness.md`: como preparar staging, como injetar JWTs sem persistir, como interpretar o relatório.
3. Nenhum usuário criado. Nenhum SQL executado no banco real.

### 4. Backfill sintético — Opção B (preparado, não executado)
1. Novo diretório `restoration/backfill-fiscal-fase3/`:
   - `fixtures.sql` — 12 registros pré-migration (produtos, clientes, invoices legados) representando os casos da spec.
   - `01-prepare.sql` — cria schema temporário isolado (em banco Docker local, nunca no projeto real).
   - `02-apply-migrations.sh` — aplica em ordem: fundação → hardening.
   - `03-verify.sql` — asserções (`SELECT ... EXCEPT`) para cada invariante da Fase 2.
   - `99-cleanup.sql` — `DROP SCHEMA ... CASCADE`.
   - `README.md` — instruções para rodar via `docker run postgres:15` local.
2. Status: **TESTE PREPARADO — EXECUÇÃO PENDENTE EM STAGING**.

### 5. Validação do mascaramento recursivo (`mask_sensitive_jsonb`)
1. `src/test/fiscal/mask.test.ts`: testes unitários puros TypeScript que espelham o contrato da função SQL (casos: chaves de topo, chaves aninhadas em objetos/arrays, case-insensitive, chaves parciais `Authorization`, chaves não sensíveis preservadas). Referência: contrato documentado.
2. `src/test/fiscal/rls/mask.sql.test.ts`: executa a função real via `pg` client quando `PGURL_STAGING` presente; skip caso contrário.
3. Documentar limites em `docs/fiscal-fase3-0-mask.md`.

### 6. Scan de segurança
1. Rodar `scripts/fiscal-security-scan.sh` — deve permanecer verde.
2. Rodar `secrets--fetch_secrets` e registrar ausência de segredos fiscais no relatório.

### 7. Validações finais
- `bun run typecheck`
- `bun run build`
- `bunx vitest run`
- ESLint apenas nos arquivos alterados nesta fase.
- Lint global: registrar resultado, não bloquear.

### 8. Relatório `docs/fiscal-fase3-0-relatorio.md` (itens A–Q exigidos)
Estrutura fixa: A. Classificação · B. Arquivos alterados · C. Migrations canônicas · D. `types.ts` · E. Harness RLS · F. Matriz planejada · G. Fixtures backfill · H. Mascaramento recursivo · I. Scan de secrets · J. Typecheck · K. Build · L. Testes · M. ESLint · N. Gates aprovados · O. Gates pendentes · P. Bloqueios · Q. Recomendação.

### Entregáveis
- `supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql`
- `supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql`
- `restoration/migrations/*` reduzidos a stubs apontando para a canônica
- `docs/fiscal-fase3-0-migrations-canonicas.md`
- `docs/fiscal-fase3-0-types-regen.md`
- `docs/fiscal-fase3-0-rls-harness.md`
- `docs/fiscal-fase3-0-mask.md`
- `docs/fiscal-fase3-0-relatorio.md`
- `scripts/verify-fiscal-types.ts`
- `src/test/fiscal/rls/{matrix.ts,runner.ts,harness.test.ts,mask.sql.test.ts}`
- `src/test/fiscal/mask.test.ts`
- `restoration/backfill-fiscal-fase3/{fixtures.sql,01-prepare.sql,02-apply-migrations.sh,03-verify.sql,99-cleanup.sql,README.md}`

### Fora de escopo (bloqueado)
Fases 3.1 a 3.6, integração de provedor, certificado, tokens, NF-e, NFS-e, criação de usuários, execução runtime em banco real, geração externa de `types.ts`.

### Gates de saída
- **APROVADO** só se: migrations canonizadas sem divergência, harness completo, fixtures completas, mask tests verdes, scan verde, typecheck/build/vitest verdes.
- **AGUARDANDO EXTERNO** para: execução RLS runtime, execução backfill, regeneração `types.ts`.

Ao concluir, apresento o relatório A–Q e aguardo aceite explícito antes da Fase 3.1.
