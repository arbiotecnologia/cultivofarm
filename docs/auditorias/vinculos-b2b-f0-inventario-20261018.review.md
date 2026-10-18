# Fase 0 — Inventário exato de `partner_users` e plano corrigido — 2026-10-18 (READ-ONLY, nada aplicado)

Ref canônico: `swzpzcwiasxmjutrmvkm`. Toda a coleta foi SELECT read-only
(pg_proc/pg_policy/pg_trigger/pg_constraint/pg_indexes). **Nenhum DDL/DML executado.**
"Verificado" = observado no banco/código nesta rodada; "Hipótese" = inferência a confirmar.

## 1. Estrutura atual (VERIFICADO)

- Colunas: `id, partner_id, user_id, created_at, papel` (papel ∈ gestor|tecnico, CHECK).
- Constraints: PK `id`; **`partner_users_user_id_key UNIQUE(user_id)`** (vínculo único);
  FK `partner_id → partner_accounts(id) ON DELETE CASCADE`.
- Índices: `partner_users_pkey`, `partner_users_user_id_key`, `idx_partner_users_user_id`, `idx_partner_users_partner`.
- Triggers: `a00_cf_user_gate` (BEFORE STATEMENT, `cf_user_guards_v1.acquire_gate()`),
  `a00_cf_user_no_truncate` (TRUNCATE), `z90_cf_touch_profile` (AFTER ROW, `touch_related_profiles()`).
- Policy própria: 1 permissive SELECT ("Tenant admins can read same organization partner links").
- Policies em `storage.objects`: **nenhuma** referencia partner_users diretamente.

## 2. Funções que tocam `partner_users` (VERIFICADO — 21 objetos, 22 overloads)

Pressupõem vínculo único (BLOQUEADORES do multi-vínculo):
- **`get_user_partner_id()`** — `SELECT partner_id ... WHERE user_id=auth.uid() LIMIT 1` **sem ORDER BY**: com 2+ vínculos, parceiro resolvido de forma não determinística → risco de vazamento cross-parceiro. Usada por ~29 policies (abaixo).
- **`get_partner_papel(user_id)`** — mesmo padrão `LIMIT 1` sem ORDER BY.
- `get_my_commercial_partner_context` / `get_my_commercial_partner_projection` (usadas por `useMyPartner`) — resolvem UM parceiro por sessão (HIPÓTESE: mesma limitação; corpos não relidos nesta rodada).

Já contextualizadas por parceiro (compatíveis com multi-vínculo):
- `is_valid_b2b_partner_user(p_user_id, p_partner_id)` — EXISTS por par + parceiro ativo + papel B2B. Modelo a generalizar.
- `get_b2b_user_role_for_partner(p_user_id, p_partner_id)` — papel por par.

Escritores/gestão: `admin_provision_user_profile_v1` (cria vínculo no provisionamento),
`set_partner_user_papel(p_link_id, p_papel)`, `b2b_finish_provisioning`,
`b2b_complete_provisioning_compensation`, `tenant_admin_list_users` (lê para enriquecer lista).
Negócio que depende do contexto de parceiro: `approve_partner_order`, `reject_partner_order`,
`request_partner_order_items`, `respond_b2b_order_quote_secure`, `set_partner_order_delivery_date`,
`recalc_partner_order_production`, `rpc_portal_partner_financial` (2 overloads),
`rpc_b2b_list_selectable_payment_plans`, `save_partner_portal_branding`,
`notify_managers_on_simulation_sent`, `can_user_access_cliente`.

## 3. Policies dependentes dos helpers de vínculo único (VERIFICADO — 29)

Via `get_user_partner_id`/`get_partner_papel`/helpers: `partner_orders_select`,
`partner_order_items_select`, `partner_simulations_select/insert/update`,
`partner_simulation_items_select`, `partner_order_messages` (partner insert/select),
`partner_order_message_attachments` (partner insert/select), `partner_order_templates` (4),
`partner_order_idempotency (poi_select_scoped)`, `partner_order_payment_schedule (pops_select)`,
`partner_order_payment_terms (popt_select)`, `partner_order_financial_links (pofl_partner_select_own)`,
`partner_user_clients` (puc insert/select/update), `partner_technician_clients` (ptc insert/select/update),
`partner_clients (pc_select)`, `partner_product_prices (ppp_self_select)`,
`partner_engagement_metrics (pem_self)`, `partner_catalog_access_logs (pcal_select)`,
`commercial_campaigns/campaign_partners/campaign_products` (3), `production_timeline_events`,
`production_planning` (restrictive D51.5). Domínios atingidos: pedidos, financeiro,
simulações, mensagens/anexos, templates, carteira, campanhas, produção.

## 4. Consumidores React/Edge (VERIFICADO)

- `src/hooks/useMyPartner.ts` — contexto comercial único por sessão (RPCs acima); valida org/papel/modo. BLOQUEADOR: pressupõe 1 parceiro.
- `src/hooks/usePartnerUsers.ts` — CRUD da aba de usuários do parceiro; trata `partner_users_user_id_key` no erro (confirma vínculo único).
- `src/pages/portal-parceiro/UsuariosClientesB2B.tsx`, `TecnicosProdutores.tsx` — leituras diretas de `partner_users` por partner_id (compatíveis com multi-vínculo).
- `src/lib/partnerUserProfiles.ts` — enriquecimento nome/email (neutro).
- Edge `list-portal-users` — lista vínculos por parceiro (compatível).
- Seletor de contexto do portal: hoje não existe seleção de parceiro (1 por usuário). BLOQUEADOR de UX para multi-vínculo.

## 5. Correções de desenho do plano (a)–(g) — incorporadas

(a) **Recorrência temporal:** abandona-se `UNIQUE(user_id, partner_id)` permanente.
Modelo: histórico na própria tabela com `revoked_at`; unicidade APENAS de vínculo ativo:
`UNIQUE(user_id, partner_id) WHERE revoked_at IS NULL`. Revogar→revincular = nova linha
(ou reativação controlada via RPC que revoga a anterior). Ciclos ficam no histórico append-only.

(b) **tenant_id derivado no servidor:** coluna `tenant_id uuid NOT NULL` preenchida por
trigger BEFORE INSERT/UPDATE a partir de `partner_accounts.commercial_owner_organization_id`;
trigger rejeita qualquer valor divergente do parceiro (imutável pelo cliente). Backfill da
Fase 1 validado linha a linha (falha = abort da migration).

(c) **Papel `parceiro_b2b` em user_roles:** a RPC de revogação só remove o papel quando
NÃO existir outro vínculo ativo do usuário (mesma transação, lock do usuário). Com outro
vínculo ativo, papel permanece.

(d) **Helpers de vínculo único:** `get_user_partner_id()`/`get_partner_papel()` passam a
ser **fail-closed**: retornam NULL quando houver 0 ou 2+ vínculos ativos (nunca `LIMIT 1`
aleatório). O caminho autorizado em multi-vínculo é por par: `is_valid_b2b_partner_user` /
`get_b2b_user_role_for_partner` + contexto de parceiro selecionado (nova RPC de contexto
que recebe `p_partner_id` e valida vínculo ativo). Policies migradas do helper escalar
para o predicado por par na Fase Guards, ANTES do cutover.

(e) **Cross-tenant:** toda RPC de gestão deriva o tenant de `auth.uid()` (perfil ativo) e
exige que TODOS os parceiros envolvidos tenham `commercial_owner_organization_id` igual a
esse tenant; operação com parceiros de tenants distintos é negada (fail-closed), mesmo
para superadmin sem vínculo comprovado.

(f) **Efeito imediato da revogação:** a revogação é efetiva na mesma transação (RLS para
de autorizar já no próximo statement). Sessões/caches em outros dispositivos dependem do
recorte de cache same-identity (gate false) — **bloqueio declarado para liberar a UI de
revogação**; sem ele, a revogação é server-side imediata mas o frontend do titular pode
manter contexto até expirar/recarregar.

(g) **Rollback do cutover é COMPENSAÇÃO, não undo trivial:** recriar `UNIQUE(user_id)`
exige antes revogar (compensar) todos os vínculos ativos excedentes por usuário, com
preflight de contagem e aprovação explícita. Tratar o cutover como **portão unidirecional**:
só avançar com homologação completa das fases anteriores. Não prometer rollback fácil.

## 6. Sequência (cada fase = migration própria; SQL proposto, NÃO executado)

1. **F0 (esta)** — inventário read-only. Aceite: lista fechada acima confirmada por revisor.
2. **Aditiva** — colunas (`valid_from`, `revoked_at`, `revoked_by`, `revoke_reason`, `tenant_id`),
   histórico append-only, trigger de tenant_id, backfill validado, helpers fail-closed
   (0/2+ → NULL) — comportamento atual preservado (tudo ativo, ≤1 vínculo).
3. **Guards** — migração das 29 policies e funções de contexto para predicado por par /
   vínculo ativo; RPCs de gestão (revogar/criar) com CAS, locks ordenados, idempotência,
   motivo, histórico. Matriz de testes: perfis tenant A/B × parceiro A/B × produtor,
   técnico, interno × pedidos/financeiro/storage/fiscal × múltiplos contextos.
4. **Homologação** — harness transacional hosted pelo auditor (BEGIN/ROLLBACK), duas
   conexões, concorrência, replay, cross-tenant negado.
5. **Cutover (portão unidirecional)** — remover `UNIQUE(user_id)`, criar unicidade
   parcial ativa. Pré-condição: fases 2–4 homologadas + plano de compensação aprovado.
6. **UI** — seletor de parceiro no portal, revogação/novo vínculo em Configurações
   (depende do cache same-identity para invalidar sessão do titular).
7. **Migração controlada de dados** — nenhuma prevista; vínculos existentes permanecem.

## 7. Riscos residuais / hipóteses a confirmar

- Corpos de `get_my_commercial_partner_context/projection` e das RPCs de pedido:
  pressupõem contexto único? (HIPÓTESE — reler na fase Aditiva.)
- `ON DELETE CASCADE` de partner_accounts → partner_users: com histórico, avaliar
  impedir DELETE de parceiro com vínculos (HIPÓTESE: hoje não há DELETE de parceiros).
- Edge `fase-e-runtime-harness` referencia partner_users (arquivo de teste/harness).
