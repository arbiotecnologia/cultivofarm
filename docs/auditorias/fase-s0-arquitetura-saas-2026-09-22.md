# Fase S0 — Auditoria arquitetural SaaS (planos, módulos, features, perfis, entitlements)

Data: 2026-09-22 · Modo: SOMENTE LEITURA · Backend: Supabase canônico `swzpzcwiasxmjutrmvkm`
Nenhuma tabela, migration, policy, RPC, Edge Function, secret, dado ou publicação foi alterada nesta rodada.

Fonte do pedido: `CULTIVO_FARM_-_ARQUITETURA_SaaS_DE_PLANOS_pasted.md` (403 linhas).

---

## A. Resumo executivo

O Cultivo Farm **não possui hoje nenhuma estrutura SaaS de planos/assinaturas**: zero tabelas `saas_*`, nenhum conceito de plano comercial de plataforma, assinatura, feature contratada, override ou limite de uso no banco. O que existe é uma arquitetura **RBAC forte e centralizada no servidor** (13 perfis, ~120 rotas mapeadas, guards de rota, RPCs de contexto e uma família `can_user_access_*`), e um modelo de tenant **implícito** — a produção real é de empresa única (1 organização, 1 emitente fiscal), com tenancy espalhado em `cliente_id` (31 tabelas) e `partner_id` (25 tabelas), e `organization_id` presente apenas em `profiles` e `company_fiscal_settings` (plano H15).

A camada SaaS prevista no documento é **viável** e pode se apoiar em três estruturas existentes que são exatamente o que o documento pede: (1) `organizations` como âncora de assinatura; (2) `get_my_available_portal_contexts()` como padrão canônico de resolução server-side de contexto — o futuro `get_my_entitlements()` deve seguir este molde; (3) as tabelas `*_audit_log` domínio a domínio como padrão de auditoria before/after. O padrão de feature flags atual (`featureFlags.ts`) é **compile-time e global** — serve a módulos internos (fiscal, comunicação), não a clientes por organização, e não deve ser estendido para SaaS.

Principais lacunas para SaaS: ausência total das tabelas do modelo (`saas_plans` … `organization_subscription_history`), ausência de `organization_id` na maioria das tabelas de negócio (a adição em massa é o maior risco de regressão de todo o programa — recomendação: assinatura por organização resolve no nível de acesso, sem exigir tenant column em todas as tabelas de imediato), inexistência de Superadmin (o `administrador` atual é admin **operacional**, não SaaS), e o programa de homologação em andamento (Fase 0 de segurança recém-concluída com NO-GO condicionado) deve ser priorizado antes de qualquer migração S1.

---

## B. Metodologia e evidência

Consultas de catálogo executadas somente leitura no canônico + leitura de código-fonte. Sem `parse_document` em código; sem SQL de escrita; sem `supabase--migration`/`run_sql`.

Amostras de evidência bruta:
- `select ... from information_schema.tables where table_name ~ 'plan|subscri|module|feature|entitle|organiz|...'` → nenhum `saas_*`; `saas_%` count = 0.
- `pg_proc` (funções com nome ~ role/access/organiz/context/plan/feature) → família `can_user_access_*`, `has_role`, `get_my_available_portal_contexts`, `h15_actor_organization`, `h15_company_access`, `rpc_admin_*_commercial_plans` (definições lidas).
- Colunas de `organizations`, `user_roles`, `company_fiscal_settings`, `get_my_available_portal_contexts()` (definição completa lida).

---

## 1. Mapa dos módulos existentes

Rotas registradas em `src/App.tsx` (173 ocorrências `path=`), páginas em `src/pages/**`, menus declarativos em `src/config/portalMenus.ts` (portais Produtor e Parceiro) e `AppSidebar` (console interno). Guardas: `src/components/guards/` (AppPortalGuard, B2BRouteGuard, ProducerFeatureGuard, TechnicalRouteGuard, TechnicalFeatureGuard, VisitaRouteGuard).

| # | Módulo | Rotas principais | Páginas (amostra) | Portal | Perfis que veem | Perfis que alteram | Tabelas/RPC/Edge (amostra) |
|---|--------|------------------|-------------------|--------|-----------------|--------------------|-----------------------------|
| 1 | Dashboard/Executivo | `/dashboard/geral`, `/dashboard/executivo`, `/executivo` | DashboardUnificado, VisaoGeral | Console | admin, gestor | — (leitura) | RPC `rpc_executivo_plano_acao` |
| 2 | Clientes/Produtores | `/clientes`, `/fazendas`, `/talhoes` | Clientes, Fazendas, ClienteDetalhe | Console | admin, gestor + leitores | admin, gestor, gestor_comercial | `clientes`, `fazendas`, `talhoes`; RPC `can_user_access_cliente` |
| 3 | Base Técnica/Protocolos | `/base-tecnica` | Protocolos | Console | técnicos + admin/gestor | admin, gestor | tabelas de protocolos/fichas |
| 4 | Ordens de Serviço | `/ordens-servico` | OrdensServico | Console | técnicos, produção | técnicos | `ordens_servico`, planejamento |
| 5 | Laboratório | `/cockpit-laboratorio` | CockpitLaboratorio | Console | operador_onfarm, producao | operador_onfarm, producao | RPCs de planejamento (`_sync_planning_from_os`, `publish_planning_to_lab`, `lab_request_replanning`) |
| 6 | Produção (lotes/CQ/envase) | `/lotes`, `/controle-qualidade`, `/envase` | Lotes, ControleQualidade, EnvasePage | Console | producao | producao | `lotes`, `controle_qualidade` |
| 7 | Estoque | `/estoque` | Estoque, EstoqueEmbalagens | Console | operador_onfarm, producao | idem | reservas; `reservas_auditoria` |
| 8 | Entregas | `/entregas` | Entregas | Console + Produtor | ampla | admin, gestor | entregas; comprovantes |
| 9 | Aplicações | `/aplicacoes` | Aplicacoes | Console + Produtor | aplicador, produtor(r) | aplicador | `aplicacoes`; RPC `can_user_access_aplicacao` |
| 10 | Visitas Técnicas | `/visita-tecnica`, `/agenda-tecnica`, `/fluxo-tecnico` | VisitaTecnica, AgendaTecnica | Console + `/app` | técnicos | técnicos | visitas; `VisitaRouteGuard`; Edge `enviar-pdf-visita`, `sync-clima` |
| 11 | Comercial B2B | `/comercial/*` (parceiros, pedidos, simulador, catálogo, condições, campanhas, indicadores) | PedidosB2B, SimuladorComercial… | Console | admin, gestor_comercial | idem | `commercial_payment_plans` + assignments; RPCs `rpc_admin_*_commercial_plan*`, `simulate_b2b_payment_plan_secure` |
| 12 | Portal Parceiro B2B | `/portal-parceiro/*` (13 rotas) | — | Portal Parceiro | parceiro_b2b, parceiro_b2b_tecnico | idem | `partner_users`, `partner_accounts`; RPC `get_b2b_user_role_for_partner`, `log_partner_catalog_access_secure` |
| 13 | Portal Produtor | `/portal/*` (11 itens de menu) | — | Portal Produtor | cliente_produtor | idem | `user_clientes` |
| 14 | Mobile `/app` | `/app/*` (18 rotas) | páginas app/ | Mobile técnico+produtor | técnicos, cliente_produtor | técnicos | RPCs de contexto |
| 15 | Financeiro | `/financeiro/*` (18 rotas + 7 B2B) | ContasReceber, ContasPagar, FluxoCaixa, DRE… | Console | admin, gestor, financeiro | idem | AR/AP; `financial_audit_log`, `financial_governance_audit_log`; Edges `generate-financial-*` |
| 16 | Fiscal | `/fiscal/documentos`, `/fiscal/reconciliacao`, `/fiscal/prontidao`, `/configuracoes/fiscal/*` | FiscalDocumentos, FiscalEmpresa… | Console | admin, financeiro, gestor(r) | admin, financeiro | `company_fiscal_settings`, `fiscal_invoices`, `fiscal_events`; H15; Edge `fiscal-xml-engine` |
| 17 | BI/Relatórios | `/bi-agronomico`, `/bi-operacional`, `/relatorios` | BIAgronomico, BIOperacional, Relatorios | Console | ampla (r) | — | `bi_refresh_audit`; views `mv_esteira_laboratorio`, `mv_fluxo_visita_tecnica` |
| 18 | Alertas/Monitoramento | `/alertas-operacionais`, `/monitoramento-alertas`, `/previsao-agronomica` | AlertasOperacionais… | Console | ampla | ampla | Edges `enviar-alertas-*`, `gerar-alertas-operacionais`, `check-monitoramentos-vencidos` |
| 19 | Comunicação | rotas gated por flag `comunicacaoModule` | ComunicacaoConfigTab | Console | admin | admin | `comunicacao_*`; Edges `communication-health`, `whatsapp-status-webhook` |
| 20 | Configurações/Administração | `/configuracoes` (usuários, papéis, parâmetros) | Configuracoes | Console | todos (r), admin (rw) | admin | `profiles`, `user_roles`; RPC `admin_edit_user_profile_v1`; Edge `create-user`, `list-portal-users` |
| 21 | Auditoria | `/auditoria`, `/auditoria-sync` | Auditoria, AuditoriaSync | Console | admin, gestor(r) | — | `*_audit_log` (12+ tabelas) |

**38 Edge Functions** em `supabase/functions/` (inventário completo no diretório; relevantes por privilegio: `create-user`, `list-portal-users`, `admin-update-user-password`, `fiscal-xml-engine`, `fiscal-certificate-*`, `generate-financial-*`, `send-push-notification`, `whatsapp-status-webhook`, `hml-b2b-runtime-harness`).

## 2. Mapa de features existentes

Duas fontes de "feature" existem e ambas são **internas, não comerciais**:
- `src/config/featureFlags.ts`: 12 flags (10 fiscais + 2 de comunicação), valores **em build-time** — adequadas para gating interno de rollout, inúteis para SaaS por organização.
- `ACCESS_MAP` em `src/lib/permissions.ts`: granularidade rota × perfil (`rw`/`r`/`none`) — é o embrião do conceito de feature, mas acoplado a perfis, não a planos.

## 3. Matriz módulo × perfil

Concentrada em `permissions.ts` (`ACCESS_MAP`, ~120 entradas). Síntese por perfil (home em `getHomeForRole`):

| Perfil | Portal padrão | Escopo principal |
|---|---|---|
| administrador | `/dashboard/geral` | tudo (rw) |
| gestor | `/dashboard/geral` | operacional amplo, fiscal r, sem comercial |
| financeiro | `/financeiro` | financeiro rw + fiscal rw |
| gestor_comercial | `/comercial/dashboard-consolidado` | comercial/compras B2B |
| operador_onfarm | `/cockpit-laboratorio` | lab/estoque |
| producao | `/operacao/dashboard-producao` | produção |
| administrativo | `/solicitacoes` | solicitações, leituras |
| consultor_tecnico / tecnico_agronomo / aplicador | `/app` | campo (mobile) + visitas |
| cliente_produtor | `/portal` | portal produtor |
| parceiro_b2b | `/portal-parceiro/pedidos` | portal parceiro |
| parceiro_b2b_tecnico | `/portal-parceiro/dashboard` | portal parceiro (técnico) |

## 4. Matriz rota × permissão

Existente e auditável em `ACCESS_MAP` (rota → perfil → `rw`/`r`/`none`), com resolução por prefixo (`resolveRoute`). **Limitação estrutural**: é declaração estática de frontend; a autorização real de dado está nas policies RLS e RPCs do banco. Nenhuma rota carrega noção de plano/entitlement.

## 5. Estruturas atuais reutilizáveis (evidência)

1. **`organizations`** (id, nome, partner_account_id, ativo, timestamps) — âncora natural de `organization_subscriptions`. Hoje com 1 linha em produção.
2. **`get_my_available_portal_contexts()`** — SECURITY DEFINER, `search_path` fixo, resolve tudo server-side a partir de `auth.uid()`, retorna JSONb com contexto padrão e flags. É o **molde exato** para `get_my_entitlements()`.
3. **Família `can_user_access_*`** (cliente, fazenda, aplicacao, solicitacao, arquivo, estoque_embalagem, produto_etiqueta, registro_consultor, alerta) — padrão de autorização de registro por vínculo, reutilizável para checagens de limite/feature em nível de linha.
4. **`has_role` + `user_roles`** (tabela separada, enum `app_role`) — fundação RBAC correta; novos papéis (ex.: `superadmin`) entram aqui via enum/migration.
5. **H15** (`h15_actor_organization`, `h15_company_access`, `profiles.organization_id`, `company_fiscal_settings.organization_id`) — primeira camada de organização real; prova de conceito de tenant por organização no domínio fiscal.
6. **Padrão de auditoria** — 12+ tabelas `*_audit_log` com autor, timestamps, motivo (ex.: `financial_audit_log`, `commercial_audit_log`, `fiscal_audit_log`); o doc exige before/after — os modelos comerciais (`commercial_audit_log`) já registram motivo e payload.
7. **RPCs admin de planos comerciais** (`rpc_admin_create_commercial_plan` etc.) — padrão de mutação administrativa com validação server-side e log; **conceito distinto** de planos SaaS (são condições de pagamento B2B) — não reutilizar a tabela, apenas o padrão.
8. **`user_access_preferences`** — persistência de contexto por usuário; equivalente futuro de preferências de plano/portal.
9. **Guards de rota React** — ponto único de extensão para bloqueio "recurso não contratado" (mensagem diferenciada do doc).
10. **Storage e Edge hardening já mapeados** na Fase 0 (`docs/auditorias/fase0-seguranca-isolamento-2026-09-22.md`) — pré-requisito de segurança para S1.

## 6. Redundâncias encontradas

- **Autorização em 3 camadas não equivalentes**: `ACCESS_MAP` (frontend), guards React (6 arquivos), RLS/RPC (banco). É intencional (defesa em profundidade), mas qualquer novo eixo (feature/entitlement) terá de ser adicionado nas três — risco de divergência.
- **Flags duplicadas em ambientes**: `featureFlags.ts` (código) vs `VITE_*` (env) vs `COMMUNICATION_*` (doc de projeto) — três mecanismos de gating internos.
- **Tenant por duas chaves**: `cliente_id` e `partner_id` coexistem sem coluna organização comum; `organizations.partner_account_id` sugere que parceiro é sub-entidade de organização — mapear antes de S1.
- **`commercial_payment_plans`** ("planos" comerciais B2B) vs futuros `saas_plans` — colisão nominal; documentar distinção para evitar confusão em revisões futuras.

## 7. Lacunas para funcionamento SaaS

1. Zero estrutura de plano/assinatura/módulo/feature/override/limite no banco (0 tabelas `saas_%`).
2. Nenhum conceito de **Superadmin** — `administrador` é operacional; elevação SaaS exige papel novo e separação de administração SaaS × operacional (doc exige).
3. `organization_id` ausente da maioria das tabelas de negócio — entitlement por organização não consegue filtrar linhas sem estratégia definida (ver item 8/11).
4. Nenhum cache/controlador de entitlement por sessão (doc exige evitar consulta por menu item).
5. Nenhuma tabela de consumo/usage para limites.
6. Sem estados de ciclo de vida (TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED/EXPIRED) em nenhum lugar.
7. Sem "Meu Plano" (tela) e sem painel Superadmin.
8. Billing desacoplado — nada existe (correto nesta fase; manter fora do schema principal).

## 8. Modelo de dados recomendado (para Fase S1 — NÃO implementar agora)

Conforme o doc, apenas se não houver equivalente — confirmado que não há:

```
saas_modules(id, key, nome, ativo)                        -- Produção, Financeiro, Fiscal, Comercial...
saas_features(id, module_id, key, nome, ativo)            -- feature granular
saas_plans(id, key, nome, ativo, is_default)
saas_plan_features(plan_id, feature_id, limite_valor, ativo)  -- limite default do plano
organization_subscriptions(id, organization_id, plan_id, status enum
  ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED'),
  vigencia_inicio/fim, created_by, unique ativa por organização)
organization_feature_overrides(id, subscription_id, feature_id,
  tipo ('GRANT','REVOKE','LIMIT'), limite_valor, motivo, valido_ate)
organization_subscription_history(assinatura_id, usuario, origem,
  valor_anterior, valor_novo, motivo, organizacao, created_at)   -- antes/depois
saas_usage_counters(organization_id, feature_id, periodo, contador)  -- Fase S5
```

Regras: overrides sempre vencem sobre o plano; plano nunca é mutado para diferenciar cliente (evita planos duplicados); histórico imutável; `organization_id` em toda tabela SaaS com RLS.

## 9. Estratégia de entitlement

Um único RPC canônico server-side, no molde de `get_my_available_portal_contexts()`:

`get_my_entitlements()` → JSONb com: organização ativa, assinatura válida, set de features concedidas, limites aplicáveis (plano + override vigente), e flags de estado (suspensa/expirada ⇒ leitura conforme política). `STABLE`, SECURITY DEFINER com `search_path` fixo, `auth.uid()` como única identidade, EXECUTE revogado de anon. Frontend busca **uma vez por sessão** (cache em provider React com invalidação por troca de contexto); operações críticas revalidam server-side (as próprias RPCs de negócio consultam entitlements antes de gravar). Nada de `plan === 'premium'` no frontend — o doc veda e o padrão atual (contextos) já evita isso.

## 10. Estratégia RBAC

Manter `user_roles` + `has_role` como autorização funcional (o que o perfil pode fazer) e adicionar o eixo SaaS como **camada ortogonal** (o que a empresa contratou). Permissão efetiva = organização ativa ∧ assinatura válida ∧ feature contratada ∧ perfil autorizado ∧ vínculo correto. Novo papel `superadmin` no enum `app_role`, gerido por `user_roles`, sem bypass de RLS genérico. Mensagens diferenciadas no frontend: "Recurso não contratado pela empresa" (entitlement) vs "Seu perfil não possui permissão" (RBAC).

## 11. Impactos em RLS

- Tabelas SaaS: RLS com policies separadas — superadmin (escrita), organização (leitura da própria assinatura via `h15_actor_organization`-like), sem acesso anon.
- Tabelas de negócio: **opcional** adicionar `organization_id` — custo alto (31 tabelas por `cliente_id` etc.). Recomendação: a checagem de entitlement ocorre em RPCs/policies existentes via função `fn_subscription_active_for(auth.uid())` dentro das policies onde for crítico (fiscal, financeiro primeiro), sem reescrever o modelo de vínculo cliente/partner na S1–S3.
- Guardas existentes do H15 (triggers de organização em `profiles`) devem impedir auto-alteração de `organization_id` — estender a `h15_profile_organization_guard` para cobrir novos campos.

## 12. Impactos em RPCs

- Novas RPCs admin-SaaS (criar plano, assinar, override, suspender) — SECURITY DEFINER, search_path fixo, revogar EXECUTE de anon, validar papel no servidor (`has_role(_user_id, 'superadmin')`), gravar histórico.
- RPCs de negócio críticas ganham verificação de entitlement server-side (limite atingido ⇒ erro explícito e seguro).
- `get_my_entitlements()` segue o padrão de `get_my_available_portal_contexts()`.

## 13. Impactos em Edge Functions

- Edges com `service_role` (31 na Fase 0) precisarão validar entitlement quando agirem em nome de organizações (ex.: `generate-financial-*`, `fiscal-xml-engine`) — idealmente consultando o banco, não repetindo lógica.
- Nenhum edge deve aceitar `organization_id` do cliente como prova de autorização (Fase 0 já verificou `create-user` validando papel via RPC no servidor — padrão a seguir).
- Futuro webhook de billing (S7) como Edge dedicado, sem acoplar schema a gateway.

## 14. Impactos no frontend

- Provider de entitlements (cache por sessão, invalidação em troca de contexto/`roles_updated`).
- Guards de rota ganham ramificação "não contratado" (exibição bloqueada com explicação para admin/gestor; oculto para operacionais — doc UI/UX).
- Menus (`portalMenus.ts`, `AppSidebar`) passam a filtrar por feature; nada de lógica comercial no cliente.
- "Meu Plano" (empresa) e painel Superadmin (separado do admin operacional).

## 15. Riscos de regressão

1. **ALTO**: tocar em `ACCESS_MAP`/guards para introduzir entitlements pode quebrar os 6 guards auditados e a suíte de vínculo — fazer por extensão (nova camada), não por reescrita.
2. **ALTO**: adicionar `organization_id` massivamente em tabelas de negócio — risco de divergência com vínculos `cliente_id`/`partner_id` existentes. Evitar na S1–S3.
3. **MÉDIO**: colisão `commercial_payment_plans` (B2B) × `saas_plans` — nomenclatura e revisão.
4. **MÉDIO**: cache de entitlement obsoleto após downgrade/suspensão — invalidação obrigatória e revalidação nas operações críticas.
5. **BAIXO**: flags internas (`featureFlags.ts`) sendo interpretadas como entitlements — documentar que são rollout interno.

## 16. Plano de migrations futuras (resumo; nenhuma executada)

- S1: enum de status de assinatura; `saas_modules`, `saas_features`, `saas_plans`, `saas_plan_features`, `organization_subscriptions`, `organization_subscription_history` (+ GRANTs, RLS, policies por superadmin/organização, índices por `organization_id`).
- S2: `get_my_entitlements()` + funções de checagem (SECURITY DEFINER, search_path fixo, EXECUTE revogado de anon).
- S3: `organization_feature_overrides`; integração nos guards/menus/RPCs críticos.
- S4: papel `superadmin` + policies do painel.
- S5: `saas_usage_counters` + validação de limite server-side.
- S6: migração gradual módulo a módulo (fiscal e financeiro por último).
- S7: billing desacoplado.

## 17. Rollback

Migrations aditivas e reversíveis (down: drop das tabelas SaaS sem tocar tabelas de negócio); feature flags para ativar camada de entitlement por ambiente; nenhum dado operacional migrado — assinatura inicial criada como seed para a organização existente, removível sem perda de dados; histórico imutável preservado mesmo após downgrade (doc).

## 18. Critérios de aceite (por fase)

- S1: assinatura da organização real ativa com plano default; políticas RLS verificadas por matriz de perfis; auditoria registra toda mudança.
- S2: `get_my_entitlements()` responde features/limites corretos para cada estado de assinatura; zero consulta extra por menu; EXECUTE revogado de anon (conferido no catálogo).
- S3: bloqueio visível com mensagem correta para recurso não contratado; nenhum acesso por URL direta (teste com sessão real).
- S4: superadmin isolado do admin operacional (nenhum compartilhamento de policies).
- S5: limites validados no servidor com erro explícito; contadores concorrentes seguros.
- Cada fase: typecheck, build, vitest (155+ testes financeiros como canário de não-regressão), verificação funcional na prévia — evidência real de exit.

## 19. Plano de testes

Do doc (empresa sem/módulo, perfil sem/com autorização, URL direta, RPC manual, alterar organization_id, autoelevação, upgrade/downgrade/suspensão/reativação, override temporário, limites, duplo clique, concorrência, multiempresa) — executável em duas camadas: **estática/vitest** (guards, provider de entitlements, mensagens diferenciadas) e **sessão real** (RLS cross-tenant, RPC manual com/sem papel, autoelevação) — esta exige usuários de teste e homologação, marcada como pendência de fase futura (Fase 0 de segurança ainda tem NO-GO condicionado e a suíte de vínculo reprova por causa do `.env` da plataforma — resolver antes de S1).

## 20. Divisão das fases S1–S7

- **S1 Core SaaS**: tabelas do modelo, seed da organização atual, RLS/policies, histórico.
- **S2 Entitlement Engine**: `get_my_entitlements()` + funções de checagem + cache de sessão.
- **S3 RBAC + SaaS**: integração em guards, menus, RPCs críticas; mensagens diferenciadas; "Meu Plano".
- **S4 Superadmin**: papel + painel de administração SaaS separado do operacional.
- **S5 Limites/consumo**: contadores, validação server-side, exibição de consumo.
- **S6 Migração gradual dos módulos**: ordem sugerida — Produção/Estoque → Comercial → Financeiro → Fiscal (por último, conforme doc).
- **S7 Billing**: gateway desacoplado (Stripe/Asaas/Mercado Pago/Pagar.me), webhook próprio, sem acoplamento de schema.

---

## Entrega final — inventário exato desta rodada

**Arquivos analisados**: `src/lib/permissions.ts` (406 linhas, completo), `src/config/portalMenus.ts` (completo), `src/config/featureFlags.ts` (completo), `src/App.tsx` (rotas/guards), `src/pages/**` (listagem por módulo), `src/components/guards/*` (6 guards, do contexto da conversa), `supabase/functions/` (inventário de 38), relatório Fase 0 `docs/auditorias/fase0-seguranca-isolamento-2026-09-22.md`.

**Tabelas analisadas**: catálogo completo do `public` filtrado por plano/assinatura/módulo/feature/entitlement/organização/limite/uso/billing/role/permissão/auditoria (25 correspondências listadas; 0 `saas_%`); colunas de `organizations`, `user_roles`, `company_fiscal_settings`, `profiles`, `partner_users`, `user_clientes`, `user_access_preferences`.

**RPCs relevantes**: `get_my_available_portal_contexts` (definição lida na íntegra), `h15_actor_organization` (íntegra), `has_role`, família `can_user_access_*` (9), `get_b2b_user_role_for_partner`, `rpc_admin_*_commercial_plan*` (6), `simulate_b2b_payment_plan_secure`, `log_partner_catalog_access_secure`, `log_my_access_denied_secure`, `admin_edit_user_profile_v1` (de rodada anterior).

**Edge Functions relevantes**: 38 no total; críticas por privilégio/entitlement futuro: `create-user`, `list-portal-users`, `admin-update-user-password`, `fiscal-xml-engine`, `fiscal-certificate-upload/revoke`, `generate-financial-report/receipt`, `send-push-notification`, `enviar-alertas-*`, `communication-health`, `whatsapp-status-webhook`, `hml-b2b-runtime-harness`.

**Estruturas reutilizáveis**: ver seção 5 (10 itens).
**Estruturas realmente novas necessárias**: as 8 tabelas do item 8 + `get_my_entitlements()` + funções de checagem + papel `superadmin` + provider/cache frontend + telas Superadmin e "Meu Plano".

**Riscos**: seção 15. **Pendências**: suíte de vínculo reprova pelo `.env` da plataforma (pré-requisito S1); Fase 0 de segurança com NO-GO condicionado; testes de isolamento com sessão real não executáveis nesta rodada; mapear relação `organizations.partner_account_id` ↔ `partner_accounts` antes do modelo final de tenant.

**Recomendação para a Fase S1**: condicionar o início à resolução do `.env`/vínculo e ao aceite do NO-GO da Fase 0; então criar o core (item 8/16) com a organização existente como seed, seguindo os padrões comprovados (`get_my_available_portal_contexts`, `user_roles`, H15), sem tocar nas tabelas de negócio.
