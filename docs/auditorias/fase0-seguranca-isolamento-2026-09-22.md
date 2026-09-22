# Fase 0 — Auditoria de segurança e isolamento multiempresa (somente leitura)

Data: 2026-09-22 · Alvo: Supabase canônico `swzpzcwiasxmjutrmvkm` · Método: consultas de catálogo, linter do Supabase e leitura de código. Nenhuma escrita em banco, código, Storage, usuários ou configuração foi executada nesta rodada.

---

## A) Resumo executivo

O sistema está estruturalmente bem protegido na camada de banco: 230 tabelas com RLS habilitada, nenhuma grant direta para `anon`, 678 funções SECURITY DEFINER todas com `search_path` fixo, e as políticas de escrita exigem papéis verificados no servidor. O isolamento fiscal por empresa (plano H15) está **aplicado no schema**: `company_fiscal_settings.organization_id`, `fiscal_invoices.company_settings_id`, políticas com `h15_actor_organization()`/`h15_company_access()` e índice único por organização ativa.

Não foram encontrados achados CRÍTICOS comprovados. Os pontos que impedem um GO imediato para homologação são, em ordem: (1) o `.env` gerenciado pela plataforma ainda aponta para um ref não canônico — inerte em runtime, mas mantém o gate de vínculo reprovando; (2) 466 funções SECURITY DEFINER executáveis por qualquer usuário autenticado — superfície grande que precisa de triagem dirigida; (3) proteção contra senhas vazadas desativada no Auth; (4) 2 funções SECURITY DEFINER executáveis por anônimos que exigem revisão de entropia de token; (5) as RPCs fiscais que ainda selecionam emitente globalmente, pendência declarada no próprio plano H15.

O modelo de isolamento multiempresa hoje é por caminhos (cliente_id / partner_id / papéis), não por coluna de organização global — coerente com a realidade atual de **1 organização, 1 emitente fiscal, 4 usuários**. O risco cross-tenant real é baixo neste momento, mas a defesa organizacional ampla cobre apenas o módulo fiscal.

Status técnico: **NO-GO condicionado** para iniciar homologação — sem bloqueador CRÍTICO, mas com 2 bloqueadores de processo (itens 1 e 2 acima) a resolver antes dos testes oficiais. Detalhes na seção I.

## B) Matriz empresa / perfil / portal / backend

Dados atuais (contagens, sem PII):

| Dimensão | Valor medido |
|---|---|
| Organizações (`organizations`) | 1 |
| Emitentes fiscais ativos (`company_fiscal_settings`) | 1 (organization_id preenchido) |
| Usuários de autenticação (`auth.users`) | 4 |
| Perfis (`profiles`) | 4 — 3 com `organization_id` nulo |
| Vínculos de papel (`user_roles`) | 4 |
| Usuários de parceiro (`partner_users`) | 1 |
| Vínculos usuário↔cliente (`user_clientes`) | 1 |

Perfis do enum `app_role` (13): `administrador`, `gestor`, `tecnico_agronomo`, `producao`, `administrativo`, `consultor_tecnico`, `aplicador`, `operador_onfarm`, `financeiro`, `gestor_comercial`, `cliente_produtor`, `parceiro_b2b`, `parceiro_b2b_tecnico`.

Correspondência perfil × portal × enforcement:

| Perfil | Portais | Frontend (`src/lib/permissions.ts`, guardas) | Backend (RLS/policies) |
|---|---|---|---|
| administrador | Admin + todos | rw em praticamente tudo; gates Executivo/BI | `has_role(...,'administrador')` nas policies de gestão |
| gestor | Admin + Executivo | rw administrativo; gate Executivo (com administrador) | policies `Staff`/`Gestor` |
| gestor_comercial | Comercial/B2B | rw comercial | `partner_accounts`/`partner_orders` INSERT/UPDATE por papel |
| financeiro | Financeiro | r em cadastros, rw financeiro | `is_financial_staff()` em AR/AP/documentos |
| administrativo | Admin (leitura ampla) | r | policies `Staff` |
| producao / operador_onfarm | Produção/On-Farm | rw operacional | policies por papel |
| consultor_tecnico / tecnico_agronomo / aplicador | Técnico/Campo (`/app/*`) | `AppPortalGuard` + `TechnicalFeatureGuard`; `has_technical_access` | policies técnicas por papel |
| cliente_produtor | Portal do produtor | `ProducerFeatureGuard` | `can_user_access_cliente`, `fi_producer_read` |
| parceiro_b2b / parceiro_b2b_tecnico | Portal parceiro | `B2BRouteGuard`, `DashboardRouter` | `partner_users` → `partner_id IN (...)`; `ar_partner_select_own_b2b` |

Nenhuma divergência grave foi encontrada entre o mapa declarativo do frontend e as políticas do banco: o frontend se limita a espelhar o que o banco impõe, e as rotas têm guardas que consultam papéis reais. A validação autoritativa está no servidor.

## C) Inventário de RLS / policies / grants

Medido agora no canônico:

- **230 tabelas** (`r`/`p`) no schema `public`; **0 sem RLS** habilitada; **4 com FORCE RLS**.
- **544 policies** no total.
- **6 tabelas com RLS e nenhuma policy** (bloqueio total via Data API — provavelmente intencional para tabelas internas/harness): `_f42_harness_fixtures`, `commercial_payment_plans`, `communication_provider_settings`, `communication_provider_settings_rate_limit`, `comunicacao_inapp_dispatch`, `fiscal_certificate_material`. O linter reporta 16 ocorrências do mesmo tipo — as 10 adicionais estão fora das tabelas `r`/`p` do `public` (views/outros schemas); **pendente confirmar quais são**.
- **0 tabelas com grant para `anon`** em `public`.
- **0 grants de DELETE para `authenticated`** — exclusões passam por políticas/RPC específicas.
- **13 policies de SELECT com predicado `true`** para `authenticated` (catálogos e referências: `catalogo_alvos`, `catalogo_problemas`, `culturas`, `formulacoes`, `cq_parametros_referencia`, `sla_configuracoes`, `configuracoes_sistema`, `etiqueta_templates`, `financial_settings`, `fiscal_environment_marker`, `codigo_sequencias`, `monitoramento_avisos`, `objetivos_visita_sugestoes`). Nenhuma expõe dado de tenant; classificação INFORMATIVO, com atenção a `financial_settings` e `monitoramento_avisos` (revisar se há conteúdo sensível por empresa).
- **Grants explícitos ausentes em `information_schema.role_table_grants`** para `authenticated`/`service_role` — o acesso funciona em produção, o que indica concessão via default ACLs. **Pendente:** confirmar os default ACLs, pois grants em nível de coluna (uma defesa possível para `profiles`) não estão sendo usadas de forma visível.

Políticas exemplares verificadas (todas com verificação de papel no servidor):

- `profiles`: leitura própria/admin/staff/colejas de organização; UPDATE próprio **com trigger `guard_profile_sensitive_fields`** que bloqueia alteração de `cliente_id`, `organization_id`, `ativo`, `email` por não-admin (`profile_sensitive_fields_forbidden`). Isso neutraliza o principal risco de autoelevação via perfil.
- `user_roles`: apenas admin gerencia; usuário lê só as próprias.
- `accounts_receivable` / `accounts_payable`: `is_financial_staff()`; leitura B2B restrita a `origin_type='B2B_ORDER'` + papel + `partner_id` resolvido no servidor via `partner_users`.
- `fiscal_invoices`: `fi_staff_select/insert/update` (admin/gestor + `h15_company_access(company_settings_id)`) e `fi_producer_read` preservada; DELETE bloqueado (`false AND ...`).
- `clientes`: `Staff manage clients` / `GestorComercial manage clients` por papel — sem filtro de tenant além do papel, coerente com o modelo de empresa única atual.

## D) Inventário de SECURITY DEFINER / Edge / Storage

**Funções Postgres:**
- **678 SECURITY DEFINER** no `public`; **0 sem `search_path` fixo**; **0 executáveis por `anon` exceto 2**: `rpc_validar_comprovante_entrega(p_validation_token uuid)` e `rpc_validar_rastreio_produto(p_trace_token uuid)` — validação pública por token de rastreio, aparentemente intencional. Pendência: verificar entropia/validade dos tokens e rate-limit.
- **466 executáveis por qualquer usuário autenticado** (alerta do linter). A maioria são helpers de autorização e RPCs de domínio com checagem interna de papel, mas o volume exige triagem dirigida antes da homologação (ver seção E).
- Helpers de organização H15 (`h15_actor_organization`, `h15_company_access`): SECURITY DEFINER, `search_path` fixo, sem EXECUTE para `anon`. `has_role` e `is_financial_staff`: conformes.

**Edge Functions (38 no repositório):**
- `verify_jwt=false` somente em `whatsapp-status-webhook` (webhook de provedor, por design) — **pendente** confirmar validação de assinatura/segredo do webhook no código.
- Incidente de 2026-09-18 documentado em `supabase/config.toml`: republicação automática derrubou `verify_jwt` de todas as funções; hoje as funções fiscais e administrativas estão reafirmadas com `verify_jwt=true` no config.
- 31 funções usam `SUPABASE_SERVICE_ROLE_KEY` **apenas no servidor** (padrão correto); nenhuma chave elevada no frontend (`src/` usa somente a publishable key com guardas `assertCanonicalSupabaseBinding`).
- `create-user` valida papel de administrador no servidor via RPC `has_role` antes de criar usuários e papéis.
- 17 funções com CORS `Access-Control-Allow-Origin: *` — aceitável para API autenticada por JWT, mas recomendado restringir à origem do app (BAIXO).
- 5 funções de harness/internas aceitam `x-internal-secret` (`INTERNAL_FUNCTION_SECRET`) — padrão adequado, dependente do segredo estar configurado.

**Storage (7 buckets listados no canônico):**
- Todos privados exceto `logos` (público, por design, para identidade visual).
- Policies de `storage.objects` (14) por bucket com predicados de papel e caminho: `entrega-documentos` (staff/cliente com regex de pasta por UUID), `aplicacao-evidencias` (owner + `aplicacao_storage_path_permitido`), `financial-docs` (staff financeiro), `logos` (leitura anônima + upload restrito por vínculo cliente/parceiro).
- `fiscal-certificates`, `fiscal-xml` e `visitas-pdf`: **nenhuma policy de cliente** — acesso exclusivamente via service_role/Edge (coerente com H17).
- Limites de tamanho e MIME configurados por bucket (PDF/XML/mídia, 10–15 MB; logos 2 MB).
- Risco de enumeração/IDOR: baixo — caminhos são UUIDs e políticas validam vínculo; **pendente** teste autenticado real para confirmar IDOR em cada bucket.

## E) Vulnerabilidades / pendências priorizadas

| # | Classificação | Achado | Evidência | Impacto/exploração | Correção recomendada | Bloqueador? |
|---|---|---|---|---|---|---|
| 1 | **ALTO** (processo) | `.env` gerenciado pela plataforma aponta ref não canônico | Arquivo `.env` na raiz com `VITE_SUPABASE_*` de ref proibido; consumido só por teste estático de vínculo | Nulo em runtime (cliente usa literais + `bindingGuard`), mas o gate `check-frontend-binding.sh` falha (exit 10) e a suíte de vínculo fica vermelha | Reapontar/desvincular a integração gerenciada da plataforma (configuração de projeto, fora do código) ou adotar a Opção B do relatório de vínculo | **Sim** — a suíte de vínculo precisa estar verde para homologar |
| 2 | **ALTO** | 466 funções SECURITY DEFINER executáveis por qualquer autenticado | Linter Supabase (lint 0029) | Um usuário autenticado pode chamar RPCs administrativas/financeiras fora dos fluxos da UI; a proteção depende da checagem interna de cada função | Triagem dirigida: revoke EXECUTE de `authenticated` nas funções que só a UI usa por caminhos internos; prioridade: financeiras, fiscais e admin | **Sim** (triagem, não correção total) |
| 3 | **MÉDIO** | Leaked password protection desativada | Linter (auth) | Senhas comprometidas aceitas no login/cadastro | Ativar em Auth → Policies | Não, mas rápido de resolver |
| 4 | **MÉDIO** | 2 SECURITY DEFINER executáveis por anônimos | `rpc_validar_comprovante_entrega`, `rpc_validar_rastreio_produto` (lint 0028) | Enumeração de tokens de validação se entropia baixa | Verificar geração de token (128+ bits), expiração e rate-limit | Não |
| 5 | **MÉDIO** | RPCs fiscais ainda resolvem emitente globalmente | Plano H15, itens 7–8 (pendente por declaração do próprio plano) | Se um 2º emitente for criado, RPCs podem cruzar empresas | Concluir item 8 do H15 antes de habilitar segundo emitente | Não enquanto houver 1 emitente; **sim** antes de multiempresa real |
| 6 | **MÉDIO** | 2 materialized views sem `security_invoker` | `mv_esteira_laboratorio`, `mv_fluxo_visita_tecnica` | Se expostas via Data API com grants de owner, contornam RLS das tabelas-fonte | Confirmar grants/exposição; recriar como view com `security_invoker` ou restringir | Não, pendente confirmação |
| 7 | **BAIXO** | `whatsapp-status-webhook` sem JWT | `supabase/config.toml` | Webhook forjado se não houver validação de assinatura | Confirmar validação de segredo no handler | Não |
| 8 | **BAIXO** | 16 avisos "RLS enabled no policy" | Linter | Tabelas inacessíveis (fail-closed) — sem exposição, mas geram ruído | Nomear e documentar as 16 | Não |
| 9 | **BAIXO** | CORS `*` em 17 Edges | grep nos handlers | Facilita uso de terceiros com JWT roubado | Restringir origem | Não |
| 10 | **BAIXO** | 1 policy de DELETE em tabela de log de auditoria | contagem em `%audit%`/`%log%` (56 policies; 1 DELETE) | Se em tabela de auditoria relevante, destruição de trilha | Identificar qual e remover | Não, pendente identificação |
| 11 | **INFORMATIVO** | Default ACLs não visíveis em `information_schema` | consultas de grants | Dificulta auditoria de privilégios | Documentar os default ACLs vigentes | Não |
| 12 | **INFORMATIVO** | Defesa organizacional ampla limitada ao módulo fiscal | só 2 colunas `organization_id` no schema | Multiempresa real exigirá estender o modelo além do fiscal | Planejar pós-homologação | Não |

## F) Comparação com auditorias e planos existentes

- **Vínculo canônico (Fase 0 de 17/09 e gate H7d):** os 5 pontos de vínculo ativos continuam conformes (`client.ts`, `bindingGuard.ts`, `fiscalBinding.ts`, `config.toml`, `canonicalProject.ts`). O `.env` divergente persiste como pendência de plataforma (achado #1).
- **H15 — isolamento fiscal por empresa (18/09):** itens 3, 4, 5 e 6 do plano **aplicados no schema** — evidência: colunas `company_fiscal_settings.organization_id` e `fiscal_invoices.company_settings_id` existem; índice renomeado para `ux_company_fiscal_settings_active_organization` (singleton por organização); políticas `company_fiscal_settings_insert/update/delete` e `fi_staff_*` usam `h15_actor_organization()`/`h15_company_access()`; helpers instalados com search_path fixo e sem EXECUTE anônimo. Pendente: item 8 (RPCs com seleção global de emitente) — achado #5.
- **H17 — certificados (bucket `fiscal-certificates`):** confirmado agora — 0 policies de cliente no bucket, acesso só via service_role, coerente com o relatório.
- **Incidente de verify_jwt (18/09):** a proteção declarada no `config.toml` está no lugar.
- **Auditorias RBAC anteriores:** nenhuma regressão visível — 0 grants `anon`, 0 grants de DELETE para `authenticated`, `user_roles` só gerenciável por admin.

## G) Plano de correção em fases (futuro, fora desta rodada)

1. **F1 — Vínculo:** resolver o `.env` gerenciado (Opção A na plataforma, ou Opção B formalizando o gate). Reversível; critério: suíte de vínculo 30/30 verde.
2. **F2 — Triagem de SECURITY DEFINER:** inventário das 466, revoke de EXECUTE para `authenticated` nas de uso interno, mantendo helpers de autorização. Fase a módulo; reversível por função.
3. **F3 — Auth:** ativar leaked password protection; revisar tokens públicos das 2 RPCs anônimas.
4. **F4 — Views e logs:** tratar `mv_*`, identificar a policy de DELETE em log, restringir CORS.
5. **F5 — H15 item 8:** adequar RPCs de emitente (pré-requisito para 2º emitente).

## H) Critérios de aceite por fase (resumo)

- F1: gate estático exit 0; suíte de vínculo completa verde; nenhum ref proibido em `dist/`.
- F2: linter 0029 sem ocorrências nas funções triadas; testes de RLS existentes verdes; fluxos da UI intactos.
- F3: linter de Auth sem alerta de senha vazada; login de usuários de teste aceito normalmente.
- F4: views sensíveis com `security_invoker` ou sem exposição via API; nenhuma policy de DELETE em logs; CORS por origem.
- F5: testes SQL transacionais do H15 (organização correta/incorreta/ausente) verdes no staging antes de qualquer 2º emitente.

## I) Recomendação GO/NO-GO para iniciar homologação

**NO-GO condicionado.** Não há bloqueador CRÍTICO de segurança comprovado nesta rodada, e o estado estrutural (RLS integral, papéis no servidor, storage fechado, H15 aplicado) é sólido. Mas, para que os testes oficiais tenham valor, devem ser resolvidos antes do início:

1. **F1 (vínculo)** — a suíte de vínculo precisa estar verde (bloqueador de processo).
2. **F2 (triagem das 466 SECURITY DEFINER)** — ao menos a triagem das funções financeiras/fiscais/administrativas, com revoke onde cabível.

F3–F5 podem correr em paralelo à homologação. Não foi verificado nesta rodada (por exigir sessão real de cada perfil): testes autenticados de IDOR em Storage e de leitura cruzada entre perfis — registrar como etapas obrigatórias da própria homologação.

---

### Pendências de verificação desta rodada (com motivo)

- Quais são as 16 ocorrências do linter "RLS sem policy" (as 6 do `public` foram nomeadas; as demais exigem consulta ao linter por item).
- Default ACLs vigentes (grants não aparecem em `information_schema.role_table_grants`).
- Validação de assinatura do webhook WhatsApp no handler.
- Identificação da tabela de log com policy de DELETE.
- Exposição via Data API das materialized views `mv_*`.
- Testes de IDOR/leitura cruzada com sessão real (própria homologação).
