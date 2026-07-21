
# Fase Fiscal 3.0.2-B.1 — Harness RLS executável + certificação A.2

Escopo estritamente local: apenas código de teste, scripts e docs fiscais. Zero acesso a banco, zero secrets, zero produção, zero emissão/provedor/certificado.

## 1. Runner: remover throw e implementar pipeline real

Arquivo: `src/test/fiscal/rls/runner.ts`

- Remover o `throw "pipeline preparado"` em `setupStaging` (linhas ~242-246).
- Implementar `setupStaging(cfg)` real, ativado apenas quando `loadRunnerConfigFromEnv` retornar `kind: "config"`:
  1. `createClient` admin com `serviceRoleKey` e `createClient` anon com `anonKey`.
  2. Reconfirmar `assertStagingMarker` no banco (já existente).
  3. **Criar usuários sintéticos** com `admin.auth.admin.createUser({ email, password, email_confirm: true })` para os 13 papéis autenticados + 2 `cliente_produtor` (A e B). Senha gerada por `crypto.randomBytes` (16 bytes hex), mantida apenas em variável local, nunca logada.
  4. **Base pré-role** para `cliente_produtor`: inserir linha em `public.profiles`, `public.clientes` (prefixo `FISCAL_TEST_B1_`) e `public.user_clientes` (vínculo user↔cliente) **antes** de inserir em `user_roles`, para satisfazer `enforce_cliente_id_for_produtor`.
  5. Atribuir papéis em `public.user_roles` via admin.
  6. **JWT por usuário**: para cada, `anonClient.auth.signInWithPassword({ email, password })` → capturar `session.access_token`. Anon usa `cfg.anonKey`. Execução sequencial.
  7. **Fixtures** (prefixo `FISCAL_TEST_B1_`, UUIDs gerados em runtime): 1 produto, 1 serviço (via `source_reference`), 1 cliente extra p/ perfil, 1 CNPJ sintético, 1 `company_fiscal_settings`, 1 `product_fiscal_profiles`, 1 `service_fiscal_profiles`, 1 `customer_fiscal_profiles`, 1 `fiscal_invoices` do cliente A + vínculo por `accounts_receivable` (customer_id=A), 1 `fiscal_invoice_items`, 1 `fiscal_events` via RPC, 1 `fiscal_idempotency_keys`, 1 `fiscal_audit_log` gerada por trigger. Para cada tabela, criar também um registro **descartável** (`__disposable`) apenas para o teste de DELETE.
  8. **Não** enfraquecer trigger de entregas: usar apenas o vínculo por `accounts_receivable` no ownership do harness HTTP (o smoke SQL externo já cobriu a origem `delivery_id`).
  9. Retornar `StagingSession` com `jwts`, `fixtureIds`, `clienteA/B`, `teardown`.

- **Teardown idempotente** em ordem segura, ignorando linhas ausentes:
  `fiscal_audit_log` → `fiscal_events` → `fiscal_invoice_items` → `fiscal_idempotency_keys` → `fiscal_invoices` → `*_fiscal_profiles` → `company_fiscal_settings` → `accounts_receivable` (sintéticas) → `user_roles` → `user_clientes` → `clientes` → `produtos` (sintéticos) → `profiles` → `auth.admin.deleteUser`. Ao fim, `SELECT count` em cada tabela filtrando prefixo `FISCAL_TEST_B1_` e assertar zero.

- Ownership: separar JWT do cliente B (hoje ambos apontam para `session.jwts.cliente_produtor`). Ampliar `StagingSession.jwts` para incluir `cliente_produtor_b` ou reindexar `runOwnershipCell` para pegar B a partir de `session.clienteB`.

- Erros: reforçar `classifyHttp` e caminhos de INSERT/UPDATE/DELETE para que **qualquer** falha de constraint, coluna, FK, 404, rede ou payload retorne `observed: "error"` (nunca `deny`). Zero linha em SELECT também é `deny` real, mas erro de rede/schema é `error`.

- RPC (`runRpcCell`): manter execução dos 15 perfis; para staff, além de `allow`, validar retorno UUID, e após ler `fiscal_events` via service-role conferindo `event_source='USER'`, `performed_by` = usuário, `notes` gravado. Casos negativos: `event_type` inválido, `p_invoice_id` inexistente, `p_notes` > 2000 chars.

## 2. Matriz e contadores

Arquivo: `src/test/fiscal/rls/matrix.ts`

- Ampliar `RPC_EXPECTATIONS` para incluir os casos negativos (RPC extras). Ajustar `PLANNED_COUNTS` para que `total` = tabelas + views + ownership + rpc positiva + rpc negativa.
- `harness.test.ts`: alinhar cálculo de `s.planned` ao novo total e remover o hack `PLANNED_COUNTS.total + rpcResults.length - RPC_EXPECTATIONS.length`.

## 3. harness.test.ts — semântica de skip/parcial/completo

- Ausência total das 6 envs → skip explícito (já ok).
- Configuração parcial → **falha real** do teste (hoje é convertida em skip via try/catch em torno do `loadRunnerConfigFromEnv`). Ajustar: manter `test.skipIf` apenas para o caso `kind: "skip"`; para o caso de `throw`, criar `test` que sempre falha com a mensagem do erro.
- Configuração completa → `test.runIf` executa harness real.

## 4. Testes unitários novos

- `src/test/fiscal/rls/runner.unit.test.ts` (mocks): valida `buildPayload` por tabela, `classifyHttp` (200/401/403/404/409/500/42501/JSON quebrado), ordem de teardown, e que setup aborta se marker/project_ref divergir.
- `src/test/fiscal/rls/harness.config.test.ts`: cobre os três estados de configuração (ausente/parcial/completo) via `vi.stubEnv`.

## 5. Smoke SQL reproduzível

Arquivo novo: `scripts/fiscal-staging-a2-smoke.sql`

- Guard inicial: `DO $$ BEGIN IF current_setting('fiscal.expected_project_ref', true) IS NULL OR NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE marker='STAGING' AND project_ref = current_setting('fiscal.expected_project_ref')) THEN RAISE EXCEPTION 'ABORT: marker/project_ref inválido'; END IF; END $$;`
- Reproduz os 31 casos smoke (admin/gestor/financeiro/produtor A/B/parceiro/sem papel/anon × leitura/RPC/mask) usando `SET LOCAL role` + `SET LOCAL request.jwt.claims`.
- Cleanup final de tudo criado com prefixo `FISCAL_TEST_A2_SMOKE_`.
- **Não** hardcodar project_ref nem credenciais: usa `current_setting('fiscal.expected_project_ref')`.

## 6. Documentação

- Novo: `docs/fiscal-fase3-0-2-a2-certificacao.md`
  - Evidência externa registrada (marker, 489 migrations, 9/5/3 objetos, 31/31 smoke, teardown zero).
  - Declaração explícita: "smoke SQL aprovado; matriz HTTP/JWT completa PENDENTE até execução com envs — não há aprovação simulada".
  - Referência ao `scripts/fiscal-staging-a2-smoke.sql`.

- Novo: `docs/fiscal-fase3-0-2-b1-runbook.md`
  - Sequência de setup/teardown, prefixo `FISCAL_TEST_B1_`, política de senha/JWT em memória, requisitos de vínculo `user_clientes` para produtor.

- Novo: `docs/fiscal-divida-tecnica-rebuild.md` — registra três incompatibilidades em rebuild vazio (sem editar migrations aplicadas):
  1. `20260509174314` depende de seed de microrganismos previamente presente.
  2. `20260616000001` presume `ordens_servico_onfarm.microrganismo_id` — coluna adicionada só em migration posterior; ordem cronológica quebra rebuild vazio.
  3. `20260707213038` (FASE11) faz patch textual não-determinístico.
  - Runbook: em rebuild vazio, aplicar seed inicial + reordenar via migrations complementares; nunca editar históricas.

## 7. Não escopo

- Nenhuma migration nova.
- Nenhum acesso a banco.
- Nenhum secret novo pedido/registrado.
- Nenhuma integração com provedor fiscal, tela, token, certificado.
- Nenhuma alteração fora dos caminhos de teste/scripts/docs fiscais.

## 8. Validação local (obrigatória, sequencial)

- `bunx eslint` apenas nos arquivos alterados (sem `--fix` global).
- `bun run typecheck`.
- `bun run build`.
- `bunx vitest run src/test/fiscal`.
- `bash scripts/fiscal-secrets-scan.sh` e `bash scripts/fiscal-integration-scan.sh`.
- Confirmar que `harness.test.ts` marca skip explícito (envs ausentes neste sandbox) e que o teste de "configuração parcial" falha corretamente quando simulado.

## 9. Relatório final

Ao término, entregar: lista de arquivos alterados; resumo do pipeline setup/teardown; `PLANNED_COUNTS.total` novo; resultados de ESLint/typecheck/build/vitest; scanners; gates aprovados (código fechado, smoke SQL certificado externamente); gates pendentes (execução runtime HTTP/JWT depende das 6 envs — não iniciar Fase 3.1).

## Detalhes técnicos

- Novo dep runtime: nenhuma. `@supabase/supabase-js` já presente. `crypto.randomBytes` via `node:crypto`.
- Prefixo único: `FISCAL_TEST_B1_` para runtime, `FISCAL_TEST_A2_SMOKE_` para script SQL. Facilita verificação de "zero remanescente" no teardown.
- Concorrência: `for...of` sequencial nas fases de criação/cleanup. Execução das células pode manter loop sequencial atual.
- Segurança de logs: substituir qualquer `console.log(cfg)` ou similar por logs que expõem só `projectRef` e contagens. Nunca imprimir `serviceRoleKey`, `anonKey`, JWTs, `pgUrl` completo ou e-mail+senha sintéticos.
