# Gate 3 — D51.4: Inventário de módulos/rotas por papel tenant e superfícies sem tenant determinístico

Escopo: leitura estática do repositório (rotas, `src/lib/permissions.ts`, guards, RPCs/Edge Functions,
migrations versionadas em `supabase/migrations`, `scripts/rbac-audit`). Não houve conexão ao banco
(staging `ikaauvsflpmamgxmkhoq` indisponível via DSN no sandbox nesta execução) nem E2E autenticado —
achados de policy são **por leitura de migrations acumuladas**, não por estado atual confirmado em
`pg_policies`/`pg_proc`. Tratar como inventário + hipóteses a validar no próximo gate com acesso vivo.

## 1. Papéis tenant e módulos alcançáveis

Fonte única declarativa: `src/lib/permissions.ts:1-419` (`AppRole`, `ACCESS_MAP`, `getHomeForRole`).
Matriz de auditoria espelhada em `scripts/rbac-audit/matrix.ts:12-206`.

| Papel | Portal/home (`getHomeForRole`) | Módulos RW (amostra) | Módulos R (amostra) |
|---|---|---|---|
| `administrador` | `/dashboard/geral` | praticamente todos os módulos internos, fiscal, financeiro, comercial, portais | — |
| `gestor` | `/dashboard/geral` | operação, produção, comercial, financeiro, painel executivo | fiscal (empresa/produtos/serviços/clientes), `/fiscal/reconciliacao`, `/fiscal/prontidao` |
| `financeiro` | (ver `getHomeForRole`, bloco truncado) | `/financeiro/*`, `/fiscal/documentos`, `/fiscal/reconciliacao`, `/configuracoes/fiscal/produtos\|servicos\|clientes` | `/configuracoes/fiscal/empresa`, `/comercial/solicitacoes-b2b`, `/fiscal/prontidao` |
| `gestor_comercial` | — | `/comercial/*`, `/portal-parceiro/*` (gestão de parceiros), `/operacao/planejamento` (r) | `/clientes`, `/comercial/catalogo` |
| `consultor_tecnico` / `tecnico_agronomo` | `/app` | `/app/*` técnico, `/visita-tecnica`, `/agenda-tecnica`, `/solicitacoes` | `/clientes`, `/fazendas`, `/talhoes`, `/base-tecnica`, BI |
| `aplicador` | `/app` | `/aplicacoes`, `/app/aplicacoes` (via `APP_TECHNICAL_ROLES`) | `/entregas` |
| `operador_onfarm` / `producao` | — | `/cockpit-laboratorio`, `/estoque`, `/controle-qualidade`, `/envase`, `/lotes` | demais módulos técnicos/BI |
| `administrativo` | — | `/solicitacoes` | quase tudo em `r` (clientes, fazendas, OS, financeiro) |
| `cliente_produtor` | `/portal` | `/portal`, `/app/*` produtor (entregas, aplicações, recomendações, solicitar) | `/clientes`, `/fazendas`, `/talhoes`, `/entregas` |
| `parceiro_b2b` | `/portal-parceiro/pedidos` | `/portal-parceiro/*` (pedidos, catálogo, simulador, histórico, usuários-clientes) | `/portal-parceiro/financeiro`, `/portal-parceiro/fichas` |
| `parceiro_b2b_tecnico` | `/portal-parceiro/dashboard` | `/portal-parceiro/simulacoes`, `/meus-produtores`, `/fichas`, `/simulador` | `/portal-parceiro/dashboard`, `/portal-parceiro` |
| `superadmin` | `/plataforma` (provisório) | **nenhum módulo operacional** — por design não entra em `ACTIVE_ROLES`/`ACCESS_MAP` (`src/lib/permissions.ts:8-19`) | leitura de planos/assinaturas/histórico em `/plataforma` |

Guards runtime que reforçam (não substituem) essa matriz: `AppPortalGuard.tsx` (RPC `has_technical_access`),
`TechnicalFeatureGuard.tsx`, `ProducerFeatureGuard.tsx`, `B2BRouteGuard.tsx`, `VisitaRouteGuard.tsx`,
`PlataformaGuard.tsx` em `src/components/guards/`. A decisão final de papel efetivo por contexto ativo está
em `src/lib/navigation/portalRoleContext.ts` (`resolveEffectiveRouteRole`), que é só front — autorização real
depende de RLS/RPC no backend.

## 2. Mapeamento rota → tabela/RPC/Edge/Storage (amostra validada em `matrix.ts:61-206`)

| Rota | Tabela base | Lançamento via RPC/escrita direta | Observação |
|---|---|---|---|
| `/clientes`, `/fazendas`, `/talhoes` | `clientes`, `fazendas`, `talhoes` | INSERT direto | achado do runner: `administrativo` consegue INSERT embora UI seja `r` (README linha 54) |
| `/ordens-servico`, `/lotes`, `/envase` | `ordens_servico`, `lotes`, `envase` | INSERT direto | achado do runner: aceitam INSERT de quase qualquer papel autenticado — política de INSERT permissiva (README linha 51) |
| `/controle-qualidade` | `controle_qualidade` | INSERT direto | achado do runner: bloqueia `operador_onfarm` apesar do cockpit oferecer o lançamento — inconsistência front×RLS (README linha 56) |
| `/portal` (solicitação do produtor) | `portal_solicitacoes` | RPC (fluxo real) | sonda INSERT direta bloqueia `cliente_produtor`; esperado se a escrita é só via RPC `SECURITY DEFINER` — confirmar nome da RPC |
| `/portal-parceiro/pedidos` | `partner_orders` | RPC `create_partner_order_secure` | sonda INSERT direta bloqueia `parceiro_b2b` — mesmo padrão: escrita por RPC definer, não tabela |
| `/financeiro/receber` | `accounts_receivable` | INSERT direto | papéis esperados: `administrador`, `financeiro` |
| `/financeiro/notas-fiscais`, `/fiscal/*` | `fiscal_invoices`, `fiscal_events`, `company_fiscal_settings` | Edge Functions `fiscal-*` (abaixo) | escopo por `organization_id`, confirmado em `docs/auditoria-d51-gate-final.md:72` |

Runner real (`scripts/rbac-audit/run-rbac-audit.ts` + `policies-report.sql`) é a ferramenta já existente
para fechar esse gate contra o Supabase vivo — não reimplementar.

## 3. Edge Functions — presença/ausência de verificação de tenant

Busca por `organization_id|organizationId|tenant` no corpo de cada função (`supabase/functions/*/index.ts`).
37 das ~41 funções **não citam tenant/organization no próprio arquivo**, o que não prova ausência de isolamento
(pode delegar a RPC `SECURITY DEFINER` com checagem no banco) mas é sinal de P1 a verificar função a função:

- **Sem referência textual a tenant** (verificar se delegam a RPC isolada): `admin-audit-produtos-orfaos`,
  `admin-update-user-password` (hardened por D51, valida tenant via RPC server-only — ver `docs/auditoria-d51-gate-final.md:41`),
  `admin-wipe-produtos-catalog`, `ai-generate-ficha-campo`, `ai-refresh-fichas`, `ai-sugerir-alvos`,
  `aplicar-sla-alertas`, `check-monitoramentos-vencidos`, `communication-health`, `communication-provider-settings`,
  `create-user`, `entrega-runtime-harness`, `entrega-termo-pdf`, `enviar-alertas-notificacoes`,
  `enviar-alertas-resumo`, `enviar-pdf-aplicacao`, `enviar-pdf-visita`, `fase-e-runtime-harness`,
  `fiscal-binding-diagnostics`, `fiscal-certificate-revoke`, `fiscal-certificate-upload`, `fiscal-cnpj-lookup`,
  `fiscal-event-sign`, `fiscal-preflight`, `fiscal-sefaz-transport`, `fiscal-xml-engine`,
  `generate-financial-receipt`, `generate-financial-report`, `gerar-alertas-operacionais`,
  `hml-b2b-runtime-harness`, `list-portal-users`, `platform-complete-first-access`,
  `process-communication-outbox`, `send-push-notification`, `sync-calendar-event`, `sync-clima`,
  `test-communication-email`, `whatsapp-status-webhook`.
- **P0 a priorizar na triagem**: funções admin/plataforma que operam sobre dados de produção
  (`admin-wipe-produtos-catalog`, `admin-audit-produtos-orfaos`, `list-portal-users`, `create-user`,
  `generate-financial-report`, `generate-financial-receipt`, `fiscal-*`) — confirmar se recebem `organization_id`
  do JWT/sessão (via `auth.uid()`→`profiles`→`organization_id`) ou de payload do cliente (risco de IDOR
  cross-tenant se aceitarem `organization_id` do body sem cross-check servidor).
- `sync-clima`, `check-monitoramentos-vencidos`, `aplicar-sla-alertas`, `gerar-alertas-operacionais`,
  `enviar-alertas-resumo`, `process-communication-outbox` parecem jobs cron/batch — verificar se iteram
  **todas** as organizações (correto para job global) vs. deveriam ser escopados por execução (não aplicável
  se usam `service_role` e iteram por tenant internamente).

## 4. Fontes sem tenant determinístico / padrões globais (achados estruturais)

1. **`configuracoes_sistema`** — tabela singleton legada, sem `organization_id`. Migration mais recente
   (`supabase/migrations/20261002031850_...sql`) trocou policy pública por `authenticated` + `profiles.ativo`,
   mas **continua global a todos os tenants** (não filtra por organização). Confirmado como "singleton global
   histórico" em `docs/auditoria-d51-gate-final.md:73,88`. **P1**: qualquer módulo que leia parâmetros daqui
   herda comportamento cross-tenant por design — mapear quais telas consomem e se algum dado nela deveria ser
   por organização (ex.: parâmetros fiscais/operacionais que hoje moraram corretamente em
   `company_fiscal_settings`, que É escopado por `organization_id`).
2. **Storage buckets públicos**: `logos` e `consultor-arquivos` criados com `public = true`
   (`storage.buckets ... VALUES ('logos','logos', true)` em migration de branding). Bucket público não tem
   isolamento por tenant no nível de ACL do Supabase Storage — qualquer URL é acessível sem auth. **P0/P1**:
   confirmar que o *path* dentro do bucket usa prefixo `organization_id/...` e que nada sensível (ex. documento
   fiscal) é gravado lá; branding/logo público é aceitável, mas deve ser auditado explicitamente por módulo
   (`branding-portais`). Buckets privados (`clientes-docs`, `financial-docs`) têm políticas dedicadas — verificar
   se o filtro usa `organization_id` do caminho/objeto ou só `auth.uid()` (pode vazar entre usuários do mesmo
   tenant mas isolar entre tenants, o que é o requisito mínimo; checar ambos).
3. **831 `CREATE [OR REPLACE] FUNCTION`** acumuladas em `supabase/migrations` — número alto é esperado em
   histórico aditivo (vários forward-fixes). **Não é confiável auditar "quais RPCs existem hoje" por grep em
   migrations**: há superposições/`DROP`/redefinições. Isso é uma lacuna real do processo —
   **P1: gerar inventário vivo de `pg_proc`/`pg_policies` direto do Postgres** (o que este Gate 3 D51.4 não
   conseguiu fazer por falta de conectividade do sandbox ao DSN de staging).
4. **43 ocorrências de `USING (true)` / `WITH CHECK (true)`** em migrations (grep bruto, sem resolver
   sobreposição/DROP posterior) — não provam que a policy ativa hoje é permissiva, mas são candidatos a
   checar prioritariamente contra o estado vivo, por arquivo/tabela:
   `20260314022647`, `20260314030551`, `20260314031818`, `20260314041717`, `20260314151638`, `20260423211530`,
   `20260423222507`, `20260424003948`, `20260508141557`, `20260508144218`, `20260508202840`, `20260509131300`,
   `20260509150443`, `20260517195200`, `20260517205452`, `20260518025432`, `20260519150909`, `20260519190124`,
   `20260519230112`, `20260520025417` (+23 demais). Muitas datam de início de março/maio/2026 — anteriores às
   fases de hardening (`fase-f1..f4`, `comunicacao-fase*`, `fiscal-h*`) que tipicamente substituem `USING(true)`
   por filtro de `organization_id`/`has_role`. **Tratar como lista de verificação, não como veredito.**
5. **Achado já confirmado por execução real do runner RBAC** (`scripts/rbac-audit/README.md:46-65`,
   última rodada staging, 263 PASS / 30 FAIL):
   - `ordens_servico`, `lotes`, `envase`: INSERT aceito de papéis que a UI não autoriza (consultor, aplicador,
     produtor, parceiro B2B) — **policy de INSERT permissiva demais, P0** (abre lançamento cross-role, e por
     extensão cross-tenant se a policy não filtra organização do ator).
   - `clientes`, `fazendas`, `talhoes`: INSERT aceito de `administrativo` (UI é só leitura) — **P1**.
   - `controle_qualidade`: bloqueia `operador_onfarm` que a UI permite via cockpit — inconsistência inversa
     (front permite, banco nega) — **P2, mas quebra funcional**.
   - `portal_solicitacoes` e `partner_orders`: bloqueiam INSERT direto do papel esperado — aparentemente correto
     se a escrita real é só via RPC `SECURITY DEFINER` (`create_partner_order_secure` e equivalente para
     solicitações) — **ação: documentar essas RPCs como única via de escrita na matriz, não achado de bug**.
6. **Linter Postgres histórico (D51 gate final, `docs/auditoria-d51-gate-final.md:139-148`)**: 492 achados
   preexistentes — 472 WARN "SECURITY DEFINER executável por authenticated", 2 WARN executável por `public`,
   17 INFO RLS habilitada sem policy, 1 WARN proteção de senha vazada desativada. **Os 2 WARN público e os
   objetos `authenticated` ligados a SaaS/plataforma são P0 para este Gate 3** — uma função `SECURITY DEFINER`
   sem `search_path` fixo e exposta a `authenticated` é o vetor clássico de escalonamento cross-tenant.
7. **`user_roles`**: tabela de papéis existe desde `20260314022647` com reforço em `20260812134101`; `has_role()`
   é referenciada em 319 migrations — função helper provavelmente estável, mas **não foi confirmada aqui como
   tenant-aware** (precisa verificar se `has_role(uid, role)` também cruza `organization_id` ou só checa papel
   global). Se `has_role` não verificar organização, qualquer policy que dependa só dela é um padrão
   potencialmente global disfarçado de RBAC — **P0 a confirmar com `\sf has_role` no banco vivo**.

## 5. Plano de auditoria / teste A/B por módulo (próximo gate, com acesso vivo ao Supabase)

Para cada módulo abaixo: criar 2 organizações de teste (Tenant A / Tenant B) com 1 usuário por papel relevante
em cada, popular 1 registro por tabela crítica em A, autenticar como cada papel de B e tentar SELECT/INSERT/UPDATE
sobre o registro de A.

| Ordem | Módulo | Tabelas/RPCs-alvo | Teste A/B | Prioridade |
|---|---|---|---|---|
| 1 | Autorização SaaS/Plataforma | `platform_org_admin_invites`, RPCs `platform_claim_org_admin_provisioning`, `admin-update-user-password` | superadmin de B não deve ver/alterar convites de A; admin de A não deve setar senha de usuário de B | P0 |
| 2 | Produção (lotes/envase/CQ) | `lotes`, `envase`, `controle_qualidade`, `ordens_servico` | corrigir policy de INSERT permissiva antes do teste A/B; depois confirmar que `producao`/`operador_onfarm` de B não leem/escrevem lote de A | P0 |
| 3 | Fiscal | `company_fiscal_settings`, `fiscal_invoices`, `fiscal_events`, Edge `fiscal-*` | financeiro de B não deve emitir/ler nota de A; validar `organization_id` injetado só server-side nas Edge Functions | P0 |
| 4 | Comercial B2B | `partner_orders`, `partner_accounts`, `partner_simulations`, RPC `create_partner_order_secure` | parceiro de B não vê pedidos/simulações de A; gestor_comercial de A não vê parceiros de B | P0 |
| 5 | Financeiro interno | `accounts_receivable`, `accounts_payable`, Edge `generate-financial-report`/`-receipt` | financeiro de B não gera relatório/recibo de A a partir de payload manipulado | P0 |
| 6 | Portal do produtor | `portal_solicitacoes`, bucket `clientes-docs` | produtor de B não lê documento de A via URL assinada; checar prefixo de path no bucket | P1 |
| 7 | Técnico (app mobile) | `aplicacoes`, `registros_consultor`, `ordens_servico` (app) | técnico de B sem vínculo não acessa talhão/visita de A via RPC `has_technical_access` | P1 |
| 8 | Storage público | bucket `logos`, `consultor-arquivos` | confirmar que nenhum dado sensível está nesses buckets; se sim, migrar para bucket privado com policy por organização | P1 |
| 9 | Configurações globais | `configuracoes_sistema` | mapear telas consumidoras; decidir se algum campo deveria migrar para tabela por `organization_id` | P2 |
| 10 | RLS permissiva residual | lista de 43 arquivos `USING (true)` da seção 4.4 | para cada tabela, obter policy ativa real via `pg_policies` e fechar a lista a "resolvido"/"ainda ativo" | P0 (bloqueador do fechamento deste gate) |

### Pré-requisito para fechar o Gate 3 D51.4
Conectividade real ao Postgres de staging (DSN testado nesta sessão falhou: `ikaauvsflpmamgxmkhoq` não resolvido
pelo pooler a partir do sandbox). Sem isso, os itens 3–7 da seção 4 permanecem como **hipóteses de leitura
estática**, não achados confirmados. Rodar `RBAC_AUDIT_PASSWORD=... bun run audit:rbac` e `policies-report.sql`
a partir de um ambiente com rede liberada é o caminho mais rápido para converter esta lista em veredito P0/P1
definitivo.

## Retomada D51.5 — P0-D Produção/RBAC vivo

O estado vivo confirmou `organization_id` e índice nas superfícies diretas de Produção, com `tenant_isolation_d51_5` restritiva em `clientes`, `fazendas`, `talhoes`, `ordens_servico`, `lotes`, `envase` e `controle_qualidade`; registros legados sem organização permanecem invisíveis. `ordens_servico_onfarm` continua por cadeia determinística até `clientes`. Também foram confirmados desvios de papel: `administrativo` ainda constava em policies de mutação de cadastros, e as RPCs `SECURITY DEFINER` da esteira validavam papel/origem, porém não comprovavam organização do recurso em todas as leituras por ID. O fechamento P0-D substitui essas policies, endurece as RPCs alcançáveis e alinha as ações visíveis ao `ACCESS_MAP`. Evidências A/B e decisão final ficam na auditoria mestre.
