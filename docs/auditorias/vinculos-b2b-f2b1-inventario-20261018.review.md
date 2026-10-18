# F2-B1 — catálogo de leitores diretos — 18/10/2026

Fonte: SELECT próprio de `pg_proc.prosrc ~ '\mpartner_users\M'` no ref canônico `swzpzcwiasxmjutrmvkm`. **31 funções atuais** (inclui writers/guards, não 31 canais de acesso). Busca lexical exata não detecta SQL montado dinamicamente; FKs, policies e callers indiretos devem ser reconciliados separadamente. Não confundir ocorrências em migrations/restoration com runtime instalado.

| # | Assinatura atual | MD5 pg_get_functiondef | Classificação |
|---|---|---|---|
| 1 | cf_audit_users_20260922.touch_related_profiles() | 724850695eceec229a5f31487ff620e0 | Guard em schema de auditoria; não resolver B2B |
| 2 | cf_user_guards_v1.acquire_gate() | b0dd9a14d5fd799a40df0975baf4c5a6 | Gate transacional; preservado |
| 3 | cf_user_guards_v1.touch_related_profiles() | e5911c3801be399f9de57e038b390e79 | Invalidação perfil; não prova cache distribuído |
| 4 | platform_private.b2b_actor_scope(uuid) | c85cb35201682c3c86b9a327d24c8482 | Conta todas as linhas, ignora revogação/tenant |
| 5 | platform_private.b2b_assignment_identity_coherent(uuid,uuid,uuid) | 98caa1464f97b1c21eeb836ceff4992d | Elegibilidade de alvo owner-only; sem revogação |
| 6 | platform_private.b2b_commercial_context() | 02158d4204dea67308558f649113ba6d | Portal/legado, sem revogação; B1b candidata |
| 7 | platform_private.b2b_direct_partner_row_allowed() | 8967832dbfa4ee782c4c063ca5e1e3d4 | Contenção negativa: NÃO acrescentar filtro cegamente, risco de tornar true |
| 8 | platform_private.tenant_admin_user_links(uuid[]) | 3afce3d71111e0db56ee485360558b2a | Metadados administrativos; presença ≠ acesso efetivo |
| 9 | platform_private.user_edit_f2_common(uuid,timestamp with time zone,jsonb,app_role[],uuid[],uuid,uuid) | d5e006ba09bfe53004971d512fc6cd49 | Writer comum, preservado; auditar CAS/associações separadamente |
| 10 | platform_private.user_edit_f2_version(uuid) | a5a96db7a57594670a91c89720f95b14 | Versão/fingerprint; não resolver de acesso |
| 11 | admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text) | 9a2e228a68f369f32fe323c6c2a7f1b8 | Provisionamento; não reabrir |
| 12 | approve_partner_order(uuid,text,date) | 8e266945b058393ce780b1d10b20f6b3 | Writer/notificações; contrato operacional exige revisão |
| 13 | b2b_complete_provisioning_compensation(uuid,uuid,uuid) | 68c1bb298b9f546866ac217c3c631011 | Compensação, não revogação comercial |
| 14 | b2b_finish_provisioning(uuid,uuid,uuid) | af0ba33b4a621e398323dc4fe6cc3dd6 | Finalização, guards próprios; não prova todos leitores |
| 15 | can_user_access_cliente(uuid,uuid) | c610786fc9f6d6a44453b9e63c91e974 | Branch B2B sem revogação; alvo arbitrário, separar contrato |
| 16 | get_b2b_user_role_for_partner(uuid,uuid) | b2596473d00151ef41b4b2ce82e044cb | Elegibilidade por par, usada em trigger |
| 17 | get_partner_papel(uuid) | c892ee1df845b69950344953757ab472 | LIMIT 1, introspecção de alvo |
| 18 | get_user_partner_id() | 77822b0ef57e42bfe9cd7075265402aa | LIMIT 1, canal escalar |
| 19 | is_valid_b2b_partner_user(uuid,uuid) | 7b17274fb6dce728741a2a9c77710a76 | Elegibilidade não autoriza ator |
| 20 | notify_managers_on_simulation_sent() | 45e577d434ab2deff58748ac86ce865f | Destinatários, sem revogação; serviços OFF preservados |
| 21 | recalc_partner_order_production(uuid) | 6b46438f25454fd1c239aa4963496309 | Writer/notificações; não certificar acesso pela presença textual |
| 22 | reject_partner_order(uuid,text) | 00e8de46e566d0b4e28d32f990514ff7 | Writer/notificações, revisão adicional |
| 23 | request_partner_order_items(uuid,text) | c9e9c05db76910604b6f5e612aabeabe | Writer/notificações, revisão adicional |
| 24 | respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text) | e57d3a6416910937bd02c9180dff0cf1 | Pedido/comercial, revisão adicional |
| 25 | rpc_b2b_list_selectable_payment_plans() | eb47ea09af200744f9e4431b8a3f1828 | Financeiro/comercial, revisão adicional |
| 26 | rpc_portal_partner_financial() | 832b0b107151ffd2c2f2be385964c22a | Financeiro, revisão adicional |
| 27 | rpc_portal_partner_financial(uuid) | ecd99f80a194bb9b540a4c197e0b9afe | Financeiro por parâmetro, revisão adicional |
| 28 | save_partner_portal_branding(uuid,text,text,text) | 62ee777a7631f6d57165ee749faa97e2 | Branding writer, revisão adicional |
| 29 | set_partner_order_delivery_date(uuid,date) | 3f6e9e10bd8f0364d64f89722e5e0f3d | Writer, revisão adicional |
| 30 | set_partner_user_papel(uuid,text) | 0a1733a9d21951dd272f41c993fa9a3a | Role/vínculo writer; não reabrir |
| 31 | tenant_admin_list_users(text,app_role,boolean,integer,integer) | e25b27d3ce041868ec0e9c0c8a2325f1 | Listagem administrativa; vínculo histórico deve permanecer consultável |

Sem schema explícito nos itens 11–31: `public`. Corpos grandes foram consultados; classificação de writer/revisão adicional NÃO é certificação de vulnerabilidade executável nem fechamento de auditoria do fluxo inteiro.

## Seis policies com leitura direta atual

1. `partner_order_financial_links/pofl_partner_select_own` — partner_users por ator, sem revoked_at.
2. `partner_order_payment_schedule/pops_select` — pedido/vínculo, sem revoked_at.
3. `partner_order_payment_terms/popt_select` — pedido/vínculo, sem revoked_at.
4. `partner_technician_clients/ptc_insert` — existência do alvo por par, sem revoked_at; ator via escalar.
5. `production_timeline_events/ptl_select_staff_or_partner` — pedido/vínculo, sem revoked_at.
6. `storage.objects/branding logo upload parceiro` — gestor por path, sem revoked_at; coexistem contenções RESTRICTIVE para logos (não concluir permissão só pela permissiva).

São independentes das **29 policies por helpers**, com sobreposição em ptc_insert. Nenhuma alterada. O digest das 29 incluindo roles/comando/permissive é `5a621e86afa1861398ab70784eaae6e4`; digest anterior limitado às expressões era `44d347112e277cbfd89b3d7daad8b5d2`.

## Runtime React/Edge e cache (investigação independente read-only)

- `src/hooks/usePartnerUsers.ts:60–79`: lista todos por parceiro, sem vigência; :86–102 exclui disponíveis por qualquer vínculo, inclusive revogado. Mutations fechadas.
- `src/pages/portal-parceiro/UsuariosClientesB2B.tsx:45–51` e `TecnicosProdutores.tsx:32–38`: consultas diretas por parceiro/alvo sem vigência.
- `src/hooks/useMyPartner.ts:22–55`: contexto/projeção, não escalares; `PortalParceiroLayout.tsx` consome resultado.
- `src/hooks/useStorageAccessScope.ts:8–17`: identidade/tenant/roles/época, não versão do vínculo. `src/lib/authz/authzEpochGate.ts:3` false; monitor `useAuth.tsx:350–409` depende do gate.
- `supabase/functions/fase-e-runtime-harness/index.ts:93,175,183`: INSERT/DELETE por serviço em harness, não fluxo normal; não executado/deployado.
- `list-portal-users` enriquece vínculos via contratos administrativos; não é prova de autorização do titular.

Revogar mantendo identidade/tenant/role não prova limpeza da sessão aberta. Não abrir gate de cache neste recorte. Consultas administrativas podem legitimamente preservar histórico, mas devem diferenciar vínculo vigente de antigo antes de habilitar gestão.
