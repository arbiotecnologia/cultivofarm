# F2-B — auditoria e candidata revisável — 18/10/2026

**Ref auditado: `swzpzcwiasxmjutrmvkm`**, confirmado no config e binding Supabase. Chamadas hospedadas do agente foram somente SELECT. Nenhum DDL/DML hospedado, publicação, alteração de Auth, roles, vínculos ou frontend. Não utilizado outro projeto.

## Status por subfase

| Subfase | Resultado |
|---|---|
| B0 baseline/helpers/policies | **PASS leitura**: quatro corpos, assinaturas e ACL; 29 policies |
| B1 candidata escalar | **PASS preparação limitada / NO-GO instalação**: dois escalares, contexto legado e callers ainda requerem aprovação |
| B2 helpers por par | **NO-GO operacional**: trigger valida usuário-alvo distinto do ator; self-only indiscriminado quebra contrato |
| B3 regressões SQL | **PASS local**: teste Vitest/PostgreSQL descartável; não prova hosted RLS |
| B4 RLS/portal reais | **NO-GO**, não realizados |
| B5 produção/publicação | **NO-GO**, nenhuma execução |

**F2-B completa NÃO está aprovada.** Foi interrompida a preparação de substituições dos helpers por par, conforme instrução de parar em conflito operacional.

## 1. Evidências atuais

- SELECT próprio: 1 vínculo, 1 não revogado, 0 tenant NULL, 0 divergências; perfil ativo no mesmo tenant; parceiro ativo/não deletado; 1 elegível. Nenhuma PII exportada.
- UNIQUE(user_id), checks e cinco triggers F1 preservados. O agregado não prova primeiro acesso, entitlement nem acesso real.
- O snapshot atual substitui a contagem histórica de dois vínculos/um NULL, sem inferir como houve regularização nem certificar sua trilha.

Todos os quatro helpers: sql, STABLE, SECURITY DEFINER, owner postgres, search_path=public; ACL EXECUTE postgres/authenticated/service_role, sem PUBLIC/anon. Sem concessão nova proposta.

| Assinatura | md5 pg_get_functiondef | Defeito atual |
|---|---|---|
| get_user_partner_id() → uuid | 77822b0ef57e42bfe9cd7075265402aa | LIMIT 1 sem revogação/perfil/tenant |
| get_partner_papel(uuid) → text | c892ee1df845b69950344953757ab472 | LIMIT 1 e alvo arbitrário |
| get_b2b_user_role_for_partner(uuid,uuid) → text | b2596473d00151ef41b4b2ce82e044cb | Por par, sem revogação/tenant |
| is_valid_b2b_partner_user(uuid,uuid) → boolean | 7b17274fb6dce728741a2a9c77710a76 | Atividade/role, sem revogação/tenant/deleted |

`public.has_role` INVOKER delega ao DEFINER privado, com perfil ativo e `platform_actor_access_ready`; este contempla senha provisória, operação processing e fencing de token. Não identificada recursão com os quatro helpers. Role não substitui vínculo nem autoriza impersonation.

## 2. Bloqueadores comprovados

**Terceiros:** `trg_validate_puc BEFORE INSERT OR UPDATE` chama `validate_partner_user_client_fn()`. Preenche role via helper por par e valida `NEW.user_id, NEW.partner_id`; também exige cliente ativo na carteira. Um gestor pode atribuir outro técnico: alvo ≠ ator. Self-only nos helpers por par quebraria essa operação, e negar alvo revogado pode impedir desativar sua atribuição. Não usar current_user=postgres como escape dentro de DEFINER.

`assign_b2b_user_client_secure` está fechado (`B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE`), mas policies de carteira e ações por alvo continuam existindo; fechamento da RPC não elimina o conflito. É necessário separar autorização do ator e validação do alvo em contratos existentes/privados fechados, auditar todos writers e definir desativação de atribuições revogadas antes de propor alteração.

**Tenant não universal:** `platform_private.b2b_commercial_context()` contempla commercial_owner e legacy_partner_tenant. O legado pode ter profile.organization_id diferente do owner se organizations.partner_account_id comprovar parceiro e guard aprovar. A candidata escalar é **somente commercial_owner**, coerente com a linha observada, não regra universal B2B. Preflight recusa linha incompatível; não prova fluxos futuros/concorrentes. Decisão sobre legado é gate.

**Caminhos irmãos:** contexto comercial lê partner_users diretamente, sem revoked_at/tenant_id. `useMyPartner` usa get_my_commercial_partner_context/projection, não estes helpers. Logo a candidata NÃO garante revogação de portal/projeção/cache. Branches técnicas de puc_select/ptc_select/pc_select e `can_user_access_cliente(uuid,uuid)` também não dependem exclusivamente do escalar; notify_managers_on_simulation_sent lê vínculos diretamente. Auditar sem ampliar escopo ou prometer revogação global.

## 3. Consumidores SQL e policies

15 callers diretos de get_user_partner_id, com ACL postgres/authenticated/service_role:

1. archive_partner_simulation_secure(uuid,text)
2. can_user_access_cliente(uuid)
3. convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)
4. create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)
5. get_b2b_technician_client_detail_secure(uuid)
6. get_b2b_technician_clients_secure(uuid,uuid)
7. get_b2b_user_client_detail_secure(uuid,text)
8. get_b2b_user_client_simulations_secure(uuid)
9. log_partner_catalog_access_secure(text,text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid)
10. rpc_partner_commercial_history(uuid,date,date)
11. rpc_partner_dashboard(uuid)
12. rpc_partner_message_counters(uuid)
13. rpc_portal_partner_credit_status()
14. send_partner_simulation_to_manager_secure(uuid)
15. simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)

16º caller: validate_partner_user_client_fn, usando ambos helpers por par. Nenhum caller direto SQL de get_partner_papel encontrado por prosrc; não prova ausência de chamadas dinâmicas/externas. Busca textual complementa pg_depend, que não cobre todos bodies PL/pgSQL.

29 policies observadas, todas public; nenhuma Storage diretamente nestes quatro helpers. Digest expressões/nome/tabela `44d347112e277cbfd89b3d7daad8b5d2`; não inclui roles/permissive/ACL, que exigem revisão separada.

| # | Tabela | Policies |
|---|---|---|
| 1 | commercial_campaign_partners | campanhas_partners_self |
| 2 | commercial_campaign_products | campanhas_products_partner |
| 3 | commercial_campaigns | campanhas_partner_select |
| 4 | partner_catalog_access_logs | pcal_select |
| 5 | partner_clients | pc_select |
| 6 | partner_engagement_metrics | pem_self |
| 7 | partner_order_idempotency | poi_select_scoped |
| 8 | partner_order_items | partner_order_items_select |
| 9–10 | partner_order_message_attachments | poma_insert, poma_select |
| 11–12 | partner_order_messages | msg_partner_insert, msg_partner_select |
| 13–16 | partner_order_templates | templates_partner_delete/insert/select/update |
| 17 | partner_orders | partner_orders_select |
| 18 | partner_product_prices | ppp_self_select |
| 19 | partner_simulation_items | partner_simulation_items_select |
| 20–22 | partner_simulations | partner_simulations_insert/select/update |
| 23–25 | partner_technician_clients | ptc_insert/select/update |
| 26–28 | partner_user_clients | puc_insert/select/update |
| 29 | production_planning | d51_5_production_planning_tenant_guard (RESTRICTIVE ALL) |

Contagem não significa fechamento integral: ORs admin/técnico independentes permanecem. Lista atual corrige inventário histórico; nenhuma policy alterada.

## 4. React, hooks, Edge

Inspeção independente de código não encontrou chamadas diretas aos quatro helpers em runtime React/Edge; tipos gerados não são callers.

- useMyPartner: contexto/projeção, fence sessão/tenant e cache. Não certifica revogação distribuída.
- PortalParceiroLayout consome contexto; nenhum seletor multi-parceiro comprovado.
- UsuariosClientesB2B e TecnicosProdutores contêm ações por usuário-alvo.
- usePartnerUsers: leitura direta por parceiro, mutations fechadas.
- Edge list-portal-users: enriquecimento via serviço, não chama helpers; não alterada/deployada.
- Cache same-identity segue gate fechado; bytes já baixados não são revogáveis.

## 5. Arquivos preparados e semântica

Todos em docs/auditorias, prefixo `vinculos-b2b-f2b-`, sufixo `20261018.sql`:

- preflight-readonly: SELECTs para auditor repetir.
- baseline: quatro definições originais completas.
- migracao: apenas dois escalares, transação/timeouts; checks de executor, overload/body/owner/ACL, UNIQUE, policies e incompatibilidades atuais. **Não pronta para instalação.**
- rollback: dois corpos exatos, checks da candidata, sem DROP/CASCADE/alteração de dados.
- preprova: BEGIN/ROLLBACK após instalação aprovada, claims sintéticas; não muda usuários reais nem prova sessão JWT.

Escalares contam TODOS não revogados antes da elegibilidade; 0/2+ NULL, mesmo quando só um entre dois é elegível. Exigem vigente, perfil/parceiro ativos, não deletado, owner provado e tenant coerente, barreira de acesso existente. Papel self-only, serviço sem UID não ganha introspecção. Sem signature/owner/ACL novos; helpers por par ficam originais.

**Rollback exato não é seguro automático:** restaura LIMIT 1/leitura de revogados; requer contenção e decisão explícita. Nenhum arquivo criado em supabase/migrations; nenhuma estrutura paralela.

## 6. Validação efetiva e limites

Vitest `src/test/saas/b2b-f2b-helpers-postgres.test.ts` executa `scripts/tests/b2b-f2b-helpers-local.py` em PostgreSQL 17.9 descartável, socket local, cleanup em finally. Corpos SQL reais; Auth/schema sintéticos, não guards/RLS de produção.

26 asserts: vínculo/papel atual, alvo estranho, revogado, vigência futura, perfil inativo/provisório/tenant NULL ou distinto, parceiro inativo/deletado/owner NULL ou divergente, processing/token antigo, zero/2+/ambiguidade parcial/histórico, anon/ACL, admin B, superadmin e service sem ator. Dois hashes provam rollback exato; pré-prova executada apenas com fixture local. Instalador completo recusa schema sem manifest: recusa esperada não é PASS de implantação. UNIQUE removida só em transação local descartável para cenário 2+.

Falhas iniciais de terminadores/alias SQL foram corrigidas e retestadas, não contadas como PASS. **Não realizados:** SQL hosted de alteração/pré-prova, login/logout/JWT, RLS A/B, terceiros, contexto legado real, concorrência hosted, fiscal/financeiro/Storage autenticado, portal/cache após revogação. Typecheck/build dependem do harness automático; lint global não executado, sem aprovação global alegada.

## 7. Próximo gate

1. Revisão independente de corpos/ref/ACL imediatamente antes da intervenção.
2. Resolver terceiros e legado, sem bypass por user_id/role/GUC.
3. Auditar contexto/projeção e branches de autorização independentes.
4. Homolog fiel com identidades válidas/primeiro acesso/guards; não presumir paridade.
5. Prova real: gestor A mantém seus pedidos; B/parceiro irmão não leem A; técnico somente carteira, sem finanças; produtor/interno sem B2B implícito; superadmin sem vínculo implícito; serviço por contrato. Cobrir 29 policies, pedidos, carteira, anexos/Storage, crédito/financeiro e fiscal mock/OFF.
6. Nova autorização para subfase instalável, backup/ata/contenção. **F2-B inteira NO-GO.**