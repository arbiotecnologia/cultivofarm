# FASE H0 — Baseline técnica real para homologação e pré-produção (AR Bio Manager)

Execução: 2026-08-17 (UTC) · Modo: auditoria somente-leitura + correções mínimas P0/P1 autorizadas
Escopo: HEAD atual do repositório. **H1 NÃO foi iniciada.**
Revisão: continuação/finalização da H0 sobre o HEAD `fbc0afaf` (a rodada anterior foi refeita integralmente neste HEAD; nenhuma correção antiga do catálogo foi repetida).

---

## 1. Commit / HEAD analisado

| Item | Valor |
|---|---|
| HEAD | `fbc0afaf` — "Work in progress" (2026-08-17, continuação da H0; HEAD da 1ª rodada: `d34c86c2`) |

| Migrations no repo | 681 arquivos (`supabase/migrations/`) |
| Edge Functions no repo | 34 (`supabase/functions/`, exclui `_shared`) |
| Rotas declaradas | 172 ocorrências `path=` em `src/App.tsx` |

## 2. Binding de ambiente — VALIDADO COM DIVERGÊNCIA

Estado **encontrado** no HEAD (evidência: leitura direta dos arquivos, sem sobrescrita cega):

| Fonte | Project ref encontrado | Esperado (staging histórico) | Situação |
|---|---|---|---|
| `.env` (`VITE_SUPABASE_PROJECT_ID` / `_URL`) | `yzszlzjpovmcteuxjznj` | `ikaauvsflpmamgxmkhoq` | **DRIFT** |
| `src/integrations/supabase/client.ts` | `ikaauvsflpmamgxmkhoq` | idem | OK |
| `supabase/config.toml` | `ikaauvsflpmamgxmkhoq` | idem | OK |
| `src/integrations/supabase/types.ts` | 2.052 linhas (stub) | 21.850 linhas (contrato staging, baseline `c75bb87f`) | **DRIFT/truncado** |
| Conexão `psql` do executor (`PGHOST`) | projeto sandbox (`postgres`, usuário `sandbox_exec`) | staging | **DRIFT — não corrigível pelo repo** |

Comparação executada antes de qualquer correção (não foi "restauração cega"): 2 de 4 fontes de binding do repo já apontavam para o staging; apenas `.env` e `types.ts` divergiam, e o `types.ts` divergente é um stub sem as relações fiscais/regulatórias exigidas pelo teste de contrato `src/test/config/connection-binding.static.test.ts`. A hipótese "staging = `ikaauvsflpmamgxmkhoq`" foi, portanto, **confirmada por três evidências independentes** (config.toml, client.ts, teste de contrato versionado), e não assumida.

Evidência do banco realmente acessível pelo executor (sandbox), relida neste HEAD:
`current_database=postgres · current_user=sandbox_exec · 50 tabelas públicas · 3 policies` — incompatível com um schema originado de 681 migrations. `supabase_migrations.schema_migrations` retorna `ERROR: permission denied for schema supabase_migrations`.

**Reincidência confirmada (H0-002R)**: no HEAD `fbc0afaf` o drift de `.env` (`yzszlzjpovmcteuxjznj`) e o truncamento de `types.ts` (2.052 linhas) **voltaram a ocorrer**, mesmo tendo sido corrigidos na rodada anterior. Isso caracteriza regeneração automática recorrente pelo backend Cloud sandbox, e não um erro pontual de commit — o repositório sozinho não estabiliza o binding. Registrado como pendência estrutural.

## 3. Build, typecheck, lint, testes

Evidência desta continuação (HEAD `fbc0afaf`), logs em `/tmp/h0/`:

| Etapa | Comando | Resultado |
|---|---|---|
| Typecheck (pré-correção) | `bunx tsgo --noEmit` | **0 erros** (exit 0) |
| Testes (pré-correção) | `bunx vitest run` | exit 1 — **14 failed / 3059 passed / 4 skipped** (5 arquivos falhando: `connection-binding.static`, `comunicacao/fase2-schema-onfarm`, `fiscal/fase3_15.static`, `fiscal/fase3_19_2.audit`, `fiscal/sinief49/staging/verifier`) — **100% das falhas causadas pelo drift de `.env`/`types.ts`**, nenhuma falha de regra de negócio |
| Testes (pós-correção C-3) | `bunx vitest run` | exit 0 — **3.073 passed / 4 skipped / 0 failed** (187 files passed, 1 skipped, 188 total) |
| Typecheck (pós-correção) | `bunx tsgo --noEmit` | **0 erros** (exit 0) |
| Lint | `bunx eslint . -f json` | exit 1 — **3.381 problemas (3.274 errors / 107 warnings)**: `no-explicit-any` 3.233 · `react-hooks/exhaustive-deps` 48 · `react-refresh/only-export-components` 33 · parse/none 26 · `prefer-const` 16 · `ban-ts-comment` 7 · `no-empty` 6 · `no-useless-escape` 4 |
| Build produção | `bunx vite build` | **SUCESSO** (exit 0), 32,6 s |
| E2E (Playwright) | não executado | 9 specs; dependem de staging + usuários de teste — **NÃO VALIDADO** |

Warnings relevantes do build: bundle único `dist/assets/index-BCPJGZrY.js` de **5.398,69 kB** (gzip 1.411,32 kB) — acima do limite de 500 kB, sem code-splitting de rota. Demais chunks: `html2canvas` 201 kB, `index.es` 151 kB, `PortalExecutivo` 77 kB, `purify.es` 24 kB.

Separação infra × funcional: nenhuma falha de infraestrutura nesta rodada. As 14 falhas foram **funcionais-de-ambiente** (contrato de tipos/binding), não de domínio.



## 4. Inventário frontend (rotas, layouts, guards)

Roteamento centralizado em `src/App.tsx` (172 `path=`); `src/routes/index.tsx` não declara rotas (apenas apoio/documentação).

Layouts: `AppLayout`, `MobileLayout`, `PortalLayout`, `PortalParceiroLayout`.
Guards: `RoleGuard` (91 usos), `AppPortalGuard`, `PortalGuard`, `ProducerFeatureGuard`, `TechnicalFeatureGuard`, `ComunicacaoRouteGuard`; ainda existem `B2BRouteGuard` e `TechnicalRouteGuard` em `src/components/guards/` (uso indireto/legado a confirmar em H1).
Redirects legados: 33 ocorrências de `<Navigate>` / `PreservedNavigate`.

Distribuição por domínio (contagem de rotas de 1º nível):

| Domínio | Prefixo | Rotas | Observação |
|---|---|---|---|
| Administrativo / operação interna | `/` raiz | ~45 | clientes, fazendas, talhões, OS, lotes, CQ, envase, estoque, entregas, cockpit |
| Mobile/consultor/produtor | `/app/*` | 22 | protegido por `AppPortalGuard` + `Technical/ProducerFeatureGuard` |
| Portal produtor | `/portal/*` | 18 | `PortalLayout` + `PortalGuard` |
| Portal parceiro B2B | `/portal-parceiro` + filhos relativos | 1 + 17 filhos (`catalogo`, `pedidos`, `simulacoes`, `financeiro`, `meus-produtores`, …) | `PortalParceiroLayout` |
| Comercial | `/comercial/*` | 11 | inclui `/comercial/catalogo` **apenas como redirect** |
| Base técnica / catálogo | `/base-tecnica`, `/protocolos` | 2 | `/protocolos` legado → canônico `/base-tecnica` |
| Financeiro | `/financeiro/*` | 30 | maior superfície do sistema |
| Fiscal | `/fiscal/*`, `/configuracoes/fiscal/*` | 7 | somente preparação/prontidão |
| Comunicação | `/comunicacao` | 1 | atrás de flag + `ComunicacaoRouteGuard` |
| BI/dashboard | `/dashboard*`, `/bi-*`, `/executivo*`, `/painel-operacional` | 10 | |
| Público/token | `/rastrear-produto/:token`, `/validar-entrega/:token` | 2 | sem sessão — validar RLS/RPC em H1 |

Rotas potencialmente órfãs/duplicadas (candidatas a revisão em H1, **não alteradas aqui**): `/dashboard` × `/dashboard/geral` × `/painel-operacional`; `/executivo` × `/portal-executivo` × `/dashboard/executivo`; `/aplicacoes` × `/app/aplicacoes`; `/solicitacoes` × `/comercial/solicitacoes-b2b`; `/relatorios` × `/financeiro/relatorios`; `/comercial/dashboard-b2b` × `/comercial/dashboard-consolidado`; `/financeiro/b2b/governanca` × `/financeiro/b2b/central-governanca`.

## 5. Perfis e autorização

`AppRole` (`src/lib/permissions.ts`) e `ACTIVE_ROLES` declaram **13 papéis**: administrador, gestor, consultor_tecnico, tecnico_agronomo, administrativo, operador_onfarm, producao, aplicador, cliente_produtor, financeiro, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico.

O enum `app_role` do contrato de tipos do staging (`types.ts`, baseline restaurado) contém **exatamente os mesmos 13 valores** → sem divergência frontend × contrato de tipos.

Divergência observada: o enum `app_role` do **banco atualmente conectado ao executor** (sandbox) contém `admin, moderator, user, administrador, tecnico_agronomo, producao, administrativo, gestor, consultor_tecnico` — ou seja, papéis genéricos inexistentes no domínio e ausência de 5 papéis reais. Isso é consequência do drift de §2, não do código.

Autorização em camadas: `RoleGuard`/`canAccess` (UI) → guards de portal que consultam a RPC `get_my_available_portal_contexts()` (`has_technical_access`, `has_b2b_access`, `is_admin`) → RLS/RPC. Bypass legado explícito para `administrador` (e `gestor_comercial` no B2B) permanece no código — aceito historicamente, **precisa de confirmação humana para pré-produção**.

## 6. Migrations — reconciliação

| Métrica | Valor |
|---|---|
| Total | 681 |
| Primeira | `20260314022647_91aef323-…sql` |
| Última | `20260905000000_hardening_digest_schema_v1.sql` |
| Timestamps duplicados | **0** |
| Migrations com data > hoje (2026-08-17) | **23** (de `20260818000000` a `20260905000000`) |
| Distribuição | 2026-03: 7 · 04: 8 · 05: 120 · 06: 230 · 07: 205 · 08: 103 · 09: 8 |
| Statements destrutivos/idempotentes | `DROP POLICY` 634 · `DROP TRIGGER` 232 · `DROP FUNCTION` 72 · `DROP VIEW` 57 · `DROP TABLE` 13 |
| Objetos mais reescritos | `create_partner_order_secure` (18×), `rpc_avancar_esteira_laboratorio` (17×), `get_partner_catalog_secure` (16×), `can_user_access_cliente` (11×), `rpc_liberar_recomendacao_produtor` (10×) |

As 23 migrations "futuras" correspondem a fases já executadas em staging (F3.1/F4 fiscal, esteira de OS, comprovante de entrega, hardening `digest`) e **não são erro** — são numeração de fase adotada pelo projeto.

Tabela repo × DB:

| migration | repo | aplicada DB | divergência | severidade | observação |
|---|---|---|---|---|---|
| todas (681) | sim | **INDETERMINADO** | não verificável | **P0** | executor conectado ao sandbox; `supabase_migrations.schema_migrations` inacessível (`permission denied`). Reconciliação exige rebind ao staging `ikaauvsflpmamgxmkhoq` |

Nenhuma migration pendente foi aplicada.

## 7. Rebuild / replay

**Não executado.** Não há neste executor uma instância Postgres local descartável autorizada, e o único banco alcançável é o sandbox remoto compartilhado — reset/replay ali seria destrutivo e está vedado pelo prompt. Validação conceitual da cadeia (banco vazio → migrations → schema → functions → RLS → views → triggers) fica **pendência H1**, com pré-requisito: Postgres 15/16 efêmero local + `supabase db reset --local` ou aplicação sequencial dos 681 arquivos, mais as extensões `pgcrypto`, `pg_cron`, `pg_net` disponíveis no schema `extensions`.

## 8. Inventário Supabase final

**Não certificável nesta execução.** O estado final efetivo (tabelas, colunas, PK/FK/unique/check, índices, views, enums, triggers, functions, RLS, grants, buckets) só pode ser lido no staging, atualmente fora de alcance (§2). O que consta em `<supabase-tables>` do ambiente de execução descreve o **sandbox** (50 tabelas, 3 policies, 18 functions, 42 tabelas sem RLS) e **não representa o AR Bio Manager**.

Storage: nenhuma migration do repo cria buckets via `storage.buckets` (`0` ocorrências) — os buckets fiscais/evidências são provisionados fora das migrations; inventário e policies ficam pendentes de leitura no staging.

## 9. SECURITY DEFINER

Não auditável com evidência nesta execução (mesma causa de §8). O que é verificável no repo: o padrão adotado nas fases recentes inclui `SET search_path = public` e qualificação explícita `extensions.digest` (migration `20260905000000_hardening_digest_schema_v1.sql`), além de gates de ambiente fail-closed (`20260819000000`, `20260821000000`) e revogação de EXECUTE para `anon` em RPCs fiscais (`20260820000000`). **Não afirmo segurança**: a verificação de owner, grants EXECUTE efetivos e ausência de SQL dinâmico precisa de leitura do catálogo do staging (H1).

## 10. RLS

Matriz por tabela sensível **não pode ser emitida com evidência** nesta execução. Sinal de repo: 634 `DROP POLICY` + recriações indicam alta rotatividade de políticas, o que aumenta o risco de política final divergente da intenção — motivo adicional para exigir a matriz lida do catálogo real em H1 (`pg_policies` + `information_schema.role_table_grants`, script já existente em `scripts/rbac-audit/policies-report.sql`).

## 11. Edge Functions (34)

| Aspecto | Evidência |
|---|---|
| `verify_jwt = false` | **apenas** `whatsapp-status-webhook` (`supabase/config.toml`) |
| Autenticação alternativa desse webhook | verificação HMAC `x-hub-signature-256` (`verifyMetaSignature`), `hub.verify_token` comparado em tempo constante, body limitado (`MAX_BODY_BYTES`), sem log de telefone/wamid/secret |
| Segredo interno | `INTERNAL_FUNCTION_SECRET` usado por `process-communication-outbox`, `communication-health`, `check-monitoramentos-vencidos`, harnesses e `_shared/auth-guard.ts` |
| Service role | 29 funções referenciam `SERVICE_ROLE` — superfície ampla, revisar escopo em H1 |
| `fiscal-xml-engine` | `verify_jwt = true`, XSDs embarcados via `static_files` |

Destaques por domínio — fiscal: `fiscal-preflight`, `fiscal-xml-engine`, `fiscal-certificate-upload/revoke`, `fiscal-cnpj-lookup`; comunicação: `process-communication-outbox`, `test-communication-email`, `communication-provider-settings`, `whatsapp-status-webhook`, `send-push-notification`; financeiro/documentos: `generate-financial-receipt`, `generate-financial-report`, `entrega-termo-pdf`, `enviar-pdf-aplicacao/visita`; automações: `aplicar-sla-alertas`, `gerar-alertas-operacionais`, `enviar-alertas-*`, `sync-clima`, `sync-calendar-event`. Rate limit, replay protection e idempotência **não** foram confirmados individualmente — item de H1.

Três funções são harnesses de runtime (`entrega-runtime-harness`, `fase-e-runtime-harness`, `hml-b2b-runtime-harness`): aceitáveis em staging, **não devem ir para produção**.

## 12. Testes existentes (inventário)

188 arquivos de teste, 3.077 casos. Concentração por domínio: fiscal 91 · comunicação 19 · catálogo 11 · e2e 9 · integration 6 · estoque 5 · protocolos 4 · navegação 3+6 avulsos · RBAC 2 · multiportal 4 · B2B/comercial 4 · mobile/offline 5 · entregas/etiquetas/cockpit 3 · config/binding 1.

Classificação: a suíte Vitest é **integralmente executável** sem credenciais (3.073 PASS). Os 9 specs Playwright (`e2e/`) são **staging-dependentes e usuário-de-teste-dependentes** (`e2e/helpers/b2bAuth.ts`). Os harnesses SQL em `supabase/tests/**` e `restoration/**` são **staging-dependentes e segredo-dependentes** (`STAGING_DSN`). `src/test/example.test.ts` é obsoleto.

Suíte oficial de homologação proposta (para H1, **não executada**): (a) Vitest completo como gate de regressão; (b) `connection-binding.static.test.ts` como gate de ambiente; (c) harness RBAC/RLS SQL contra staging; (d) E2E OS ponta-a-ponta (pedido→entrega→comprovante); (e) smoke fiscal em HML; (f) smoke de comunicação com flags de entrega OFF.

## 13. Catálogo / base técnica

Fonte canônica única: hook `src/hooks/useCatalogoUnificado.ts` (colunas explícitas, `staleTime` 120 s, `gcTime` 600 s, supressão de `explicacao_tecnica`/`modo_acao` em escopo B2B). Renderização: `CatalogoCardsGrid` (paginação incremental, `CATALOGO_PAGE_SIZE = 60`) e `CatalogoKpis`. Portal parceiro consome RPCs `get_partner_catalog_secure` / `get_partner_catalog_tecnico_secure`. Unidades: produtos em hectare, microrganismos em dose/100 ml.

Rota canônica `/base-tecnica`; `/protocolos` e `/comercial/catalogo` apenas redirecionam. A página duplicada `CatalogoComercial.tsx` foi removida na Fase 29. **Regressão encontrada e corrigida nesta H0**: a sub-aba "Catálogo Técnico" havia sumido do menu (ver §20).

## 14. Motor comercial / B2B

Cálculo canônico server-side em RPCs: `create_partner_order_secure` (18 revisões), `convert_partner_simulation_to_order_secure`, `simulate_b2b_*`, `get_partner_catalog_secure`, além de motores de condições/planos com cobertura em `motorCondicoesComerciaisB2B.test.ts`, `motorB2BFase6Planos.test.ts`, `motorB2BRpcIntegration.test.ts`. Fluxo mapeado: catálogo → carrinho (hash SHA-256) → simulação → pedido → aprovação/ajuste → conversão → recebível.

Risco a revalidar em H1: existência de espelhos de cálculo no cliente (`src/lib/comercial*`, `useCommercial.ts`) usados para exibição — precisam ser confirmados como **display-only**, com o servidor recomputando na persistência.

## 15. Produção / OS / CQ / envase / estoque / entrega

Cadeia: pedido → `programacao_producao` → `ordens_servico` (`status_os`) → `lotes` → `controle_qualidade` → `envase` → `estoque_produto`/`estoque_movimentacoes` → `entregas` → comprovante.
Transições por RPC: `rpc_avancar_esteira_laboratorio` (17 revisões), `rpc_estoque_operar_v1`, `registrar_envase`, `fn_entrega_confirmar_engine_v1`, `rpc_cockpit_finalizar_os_v1`, builder de documento de entrega (`20260903000000`).
Blindagem por testes na Fase 28C (`src/test/estoque/*`), com 12 invariantes congelados.
Riscos herdados **ainda abertos**: A1 — Cockpit chama `reservar_estoque_item` sem chave de idempotência; A2 — diálogo de reserva itera por item sem transação única.

## 16. Financeiro

30 rotas; cadeia entrega/pedido → `accounts_receivable` → parcelas → baixa → estorno → fluxo de caixa → DRE/BI, com relatórios dedicados (inadimplência, aging, prestação de contas, NF-e pendente). Riscos a validar em H1: duplicidade de geração de recebível a partir de entrega + pedido B2B, recomputação histórica em relatórios sem snapshot e ausência de trava de idempotência na baixa/estorno.

## 17. Fiscal

Emissão de produção **permanece desativada**: `fiscalEmissionEnabled: false`, `fiscalReconciliationUi/Write: false`, `fiscalDocumentManualEventRpc: false` (`src/config/featureFlags.ts`). Liberados apenas configuração, perfis (produto/serviço/cliente), workflow de rascunho e Central de Prontidão (leitura). Motor XML/XSD (`fiscal-xml-engine` + `xsdValidate.ts`) e certificado (upload/revogação com AES-256-GCM) presentes; ambiente HML. Nada foi promovido nem ativado nesta execução.

## 18. Comunicação

Cadeia evento → template → outbox → provider → tentativa → status, com `rpc_publish_communication_event_v2` (advisory lock), expansão transacional de destinatários no servidor, `process-communication-outbox` e webhook de status WhatsApp assinado. Módulo visível via `VITE_COMUNICACAO_MODULE_ENABLED=true`; flags de **entrega** (email/WhatsApp/in-app/webhook) devem permanecer OFF conforme governança do projeto — confirmar no ambiente antes de H1.

## 19. Mobile / offline

`/app/*` protegido por `AppPortalGuard` + `Technical/ProducerFeatureGuard`. Camada offline: `src/lib/offlineDb.ts` e `src/lib/offlineCheckinQueue.ts`, com testes de dedupe/claim/regra de negócio (`offlineSync.dedupe`, `offlineDb.claim`, `offlineCheckinQueue.business`). Conflito de escrita concorrente e reconciliação pós-reconexão **não têm teste dedicado** — homologação mobile não pode ser declarada por responsividade.

## 20. Correções realizadas nesta execução (mínimas, reversíveis)

### C-1 — Rebind de ambiente para o staging autorizado (P0)
- **Antes**: `.env` apontando para `yzszlzjpovmcteuxjznj`; `types.ts` com 2.052 linhas (stub sem relações fiscais/regulatórias).
- **Causa**: regeneração automática pelo backend Cloud sandbox (drift recorrente já documentado).
- **Arquivos**: `.env`, `src/integrations/supabase/types.ts` (restaurados de `c75bb87f`, único baseline cujo conteúdo é coerente com `client.ts` + `config.toml` + teste de contrato).
- **Rollback**: `git show d34c86c2:.env > .env` e idem para `types.ts`.
- **Reteste**: `connection-binding.static.test.ts` PASS; `tsgo --noEmit` 0 erros; build OK.

### C-2 — Regressão de navegação: sub-aba "Catálogo Técnico" ausente (P1) — rodada anterior
- **Antes**: 5 testes falhando (`catalogo-unificacao-fase29`, `sidebar-adequacoes` ×2, `sidebar-padronizacao` ×2); Base Técnica com 4 filhos.
- **Causa**: na unificação (Fase 29) o filho `protocolos-catalogo-tecnico` foi removido junto com o item legado `/comercial/catalogo`, embora seja justamente o **destino** do redirect.
- **Arquivo**: `src/config/navigation.ts` (uma linha reinserida, idêntica à definição histórica, entre "Microrganismos" e "Culturas").
- **Rollback**: remover a linha `protocolos-catalogo-tecnico`.
- **Status nesta continuação**: já presente no HEAD `fbc0afaf` e **não foi refeita**. Verificada apenas por reteste (suíte de navegação PASS).

### C-3 — Rebind do staging reincidente no HEAD `fbc0afaf` (P0)
- **Antes**: `.env` = `yzszlzjpovmcteuxjznj`; `types.ts` = 2.052 linhas; 14 testes falhando.
- **Verificação prévia (sem restauração cega)**: `client.ts` e `config.toml` continuavam em `ikaauvsflpmamgxmkhoq`, e o teste de contrato versionado exige esse mesmo ref — 3 evidências independentes contra 1 divergente. Só então foi restaurado o baseline `c75bb87f` (21.850 linhas), único conteúdo coerente com as três.
- **Arquivos**: `.env`, `src/integrations/supabase/types.ts`. Backup do estado divergente preservado em `/tmp/h0/env.drift.bak` e `/tmp/h0/types.drift.bak`.
- **Rollback**: `git show fbc0afaf:.env > .env` e idem para `types.ts`.
- **Reteste**: `tsgo --noEmit` 0 erros · `vitest run` **3.073 PASS / 0 FAIL** · `vite build` SUCESSO.

Nenhuma regra de negócio, migration, RPC, RLS, rota, permissão ou dependência foi alterada nesta continuação. Nenhuma migration foi aplicada; nenhum banco remoto foi resetado; nada foi promovido a produção.


## 21. Achados

| ID | Sev | Domínio | Evidência | Impacto | Recomendação | Teste de regressão | Status |
|---|---|---|---|---|---|---|---|
| H0-001 | P0 | Ambiente | `PGHOST`/tools apontam para sandbox (`50 tabelas, 3 policies`); `supabase_migrations` inacessível | Impede §6 §8 §9 §10 (migrations, schema final, SECURITY DEFINER, RLS) | Rebind das ferramentas de execução ao staging `ikaauvsflpmamgxmkhoq` (ou fornecer `STAGING_DSN` somente-leitura) | script `scripts/rbac-audit/policies-report.sql` executável | **ABERTO** |
| H0-002 | P0 | Ambiente | `.env` + `types.ts` divergentes no HEAD | App compilaria contra projeto errado | Corrigido em C-1/C-3 | `connection-binding.static.test.ts` | CORRIGIDO |
| H0-002R | P0 | Ambiente | O mesmo drift **reincidiu** no HEAD `fbc0afaf` após já corrigido, derrubando 14 testes | Correção manual não se sustenta; qualquer build pode sair ligado ao projeto errado | Estabilizar a fonte do binding (parar a regeneração automática de `.env`/`types.ts` pelo sandbox) e travar o teste de contrato como gate de CI/publicação | `connection-binding.static.test.ts` em CI bloqueante | **ABERTO** |

| H0-003 | P1 | Navegação/Catálogo | 5 testes falhando no HEAD | Menu sem o destino canônico do redirect | Corrigido em C-2 | `catalogo-unificacao-fase29.test.ts` | CORRIGIDO |
| H0-004 | P1 | Estoque | Divergências A1/A2 da Fase 28B ainda no HEAD | Reserva sem idempotência / laço não transacional | Unificar em `rpc_estoque_operar_v1` com chave idempotente | harness SQL de reserva concorrente | ABERTO |
| H0-005 | P1 | Edge Functions | 3 harnesses de runtime implantáveis; 29 funções com service role | Superfície de execução privilegiada em produção | Excluir harnesses do deploy de produção; revisar escopo do service role | inventário de deploy por ambiente | ABERTO |
| H0-006 | P1 | Migrations | 634 `DROP POLICY` + 232 `DROP TRIGGER` com recriações | Estado final de RLS possivelmente divergente da intenção | Emitir matriz RLS real (H1) e congelá-la em teste | matriz RLS por tabela sensível | ABERTO |
| H0-007 | P2 | Qualidade | ESLint: 3.274 errors (majoritariamente `no-explicit-any`) | Erosão de tipos, risco de regressão silenciosa | Plano incremental por domínio; travar novo `any` em CI | `eslint --max-warnings` por pasta | ABERTO |
| H0-008 | P2 | Performance | Bundle único 5.398 kB (gzip 1.411 kB) | TTI ruim em campo/3G | Code-splitting por rota/portal | orçamento de bundle no build | ABERTO |
| H0-009 | P2 | Performance | 142 arquivos com `.select('*')`; 101 páginas com `.from(` sem paginação evidente | N+1, tráfego e memória | Colunas explícitas + `range()` nas listas grandes | testes de contrato de colunas | ABERTO |
| H0-010 | P2 | Rotas | ~7 pares de rotas duplicadas/legadas (§4) | Confusão de navegação e manutenção | Consolidar com redirects preservando deep links | teste de inventário de rotas | ABERTO |
| H0-011 | P2 | Mobile/offline | Sem teste de conflito/reconciliação pós-reconexão | Perda ou duplicação de registro em campo | Suite de conflito na fila offline | teste de fila com conflito | ABERTO |
| H0-012 | P2 | Autorização | Bypass legado de `administrador`/`gestor_comercial` nos guards | Acesso amplo não auditado | Confirmar decisão de negócio e registrar auditoria de acesso | teste RBAC por papel | ABERTO |
| H0-013 | P3 | Testes | `src/test/example.test.ts` obsoleto; E2E sem execução automatizada | Ruído de suíte | Remover exemplo; parametrizar E2E com usuários de teste | — | ABERTO |
| H0-014 | P3 | Storage | Nenhum bucket criado via migration | Provisionamento não reprodutível | Versionar criação de buckets/policies | replay de schema | ABERTO |

## 22. Código / rotas possivelmente legados

`src/components/guards/B2BRouteGuard.tsx` e `TechnicalRouteGuard.tsx` (não referenciados diretamente em `App.tsx`), `src/test/example.test.ts`, rotas duplicadas de §4, e a árvore `restoration/` (kits históricos — manter como evidência, excluir do bundle).

## 23. Bloqueadores para homologação

1. **H0-001 (P0)** — sem acesso somente-leitura ao staging `ikaauvsflpmamgxmkhoq`, os capítulos 4, 6, 7, 8, 9 e 10 do escopo H0 (migrations aplicadas, schema final, SECURITY DEFINER, RLS, grants, storage) **não podem ser certificados com evidência**.
2. **H0-004 (P1)** — idempotência de reserva de estoque.
3. **H0-005 (P1)** — harnesses de runtime e amplitude do service role nas Edge Functions.

---

## GATE FINAL

# H0 BLOQUEADA

**Motivo**: o binding do executor aponta para um projeto sandbox, e não para o staging autorizado. A metade "código" da baseline está certificada (typecheck 0 erros, 3.073 testes PASS, build de produção OK, inventários de rotas/perfis/migrations/Edge Functions concluídos), mas a metade "banco" (migrations aplicadas, schema final, SECURITY DEFINER, RLS, grants, storage) não pôde ser evidenciada. Declarar aprovação — mesmo com ressalvas — afirmaria segurança sem evidência, o que o próprio escopo proíbe.

**P0/P1 abertos**: H0-001 (P0), H0-004 (P1), H0-005 (P1), H0-006 (P1).

**Desbloqueio mínimo**: conceder ao executor acesso somente-leitura ao staging `ikaauvsflpmamgxmkhoq` (rebind das ferramentas de banco ou `STAGING_DSN` read-only) e re-executar apenas os capítulos 6–10.

**Composição recomendada da H1 (não executada)**:
- H1-A: reconciliação migrations repo × `supabase_migrations.schema_migrations` no staging.
- H1-B: inventário final do schema + matriz RLS por tabela sensível + grants `anon`/`authenticated`.
- H1-C: auditoria de todas as funções `SECURITY DEFINER` (owner, `search_path`, `auth.uid()`, EXECUTE, SQL dinâmico, isolamento de tenant).
- H1-D: replay completo do schema em Postgres efêmero local.
- H1-E: suíte oficial de homologação (§12) e correção de H0-004/H0-005.
