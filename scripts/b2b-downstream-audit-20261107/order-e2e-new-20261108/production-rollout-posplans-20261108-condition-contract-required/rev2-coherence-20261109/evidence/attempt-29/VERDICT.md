# Tentativa 29 — 7 + 23 corpos LIVE 09/11, resposta do vendedor (espelho PG17 descartável)

Guarda 81: **NÃO APROVADA** (falta revisão independente e as capturas abaixo). Correção do vendedor: **candidato REVIEW_ONLY, não instalado**.
Nada hospedado, publicado, ativado ou enviado. Gates fiscal/logístico/envios fechados. Tentativas 25–28 preservadas (diagnóstico incremental).

## Resultado
- exit 0 · harness 339/339 · CCR2 130/130 (PG 17.11 descartável).
- 7 corpos (tentativa 24) + **23 corpos** de `live-exact-7/capture-23-20261109.json` (SHA256 `24ada34a…411b`, md5 do texto verificado 23/23 ao carregar):
  md5(pg_get_functiondef) e ACL (aclitems ordenados) iguais à produção para **22/23**; 1 costura declarada (abaixo).
- `b2b_resale_delivery_order_valid_v1` agora é o LIVE `bd76345c…` (substitui o `79c74078…` da etapa 41; a diferença é a etapa 61 instalada).
  Dependência `resale_pilot_delivery_scope_v1` + `resale_pilot_allowlist_v1` copiados da etapa 61 instalada; md5 `2350b653…` = pin POST62.
- Gate logístico: `count(*) FILTER (WHERE enabled) = 0`, como produção.
- `partner_users.valid_from`: `timestamptz NOT NULL DEFAULT now()` no espelho (linhas sintéticas NULL → now()).

## Revogado negado com corpos reais
`get_user_partner_id` (`b334c3a4…`) e `c2_order_actor_scope` (`54c4327d…`) reais substituíram os stubs:
`c2_partner_order_attempt_authz` nega vínculo revogado (`forbidden_partner`), nega parceiro de outra empresa e autoriza o próprio.
`b2b_actor_scope` nega revogado, tenant divergente, valid_from futuro e parceiro inativo.

## Resposta do vendedor — defeito funcional real (não drift)
Os 5 de visibilidade têm os mesmos hashes de 06/11. Caminho real com corpos LIVE:
`respond_b2b_order_quote_secure` (4926a99c) → `public.b2b_phase1_order_visible` → `platform_private.b2b_phase1_order_visible`
→ `platform_private.b2b_phase1_partner_visible`. Para usuário interno sem papel externo exige `b2b_actor_scope(u).org_partner = parceiro`,
isto é, a organização do próprio ator ser o parceiro. O admin da empresa dona não satisfaz isso, embora `c2_external_origin_assert`
(ramo dono: h15 = empresa dona + `c2p1_settings_allowed`) já tenha autorizado. Reproduzido: `b2b_phase1_scope_denied`, sem mudança de estado.

Correção candidata (`seller-respond-fix-20261109/`, só dentro do respond, 3 ocorrências):
`public.b2b_phase1_order_visible(p_order_id)` → `(… OR platform_private.b2b_owner_internal_partner_readable(<parceiro do pedido>))`.
Visibilidade global intocada (md5 915f516e/8504f07f/6b3defc0/fa72ca18 conferidos após instalar). A checagem existente
administrador/gestor_comercial continua, então financeiro segue sem responder.
- PRE sem `app.reviewed_ref` aborta; PRE_OK; install; POST_OK (md5 novo `97bcdb98…`, owner, ACL); rollback restaura `4926a99c`; POST após rollback e rollback repetido recusam.
- Admin dono responde e o snapshot de resposta é aceito pela guarda 81.
- Negados sem mudança de estado: admin da empresa F, comprador PN, comprador P de outro parceiro, e admin A com vínculo externo ativo (cai em `b2b_phase1_scope_denied`).
- Arquivos e SHA256: `seller-respond-fix-20261109/SHA256SUMS` (PRE `3b711e4d…`, INSTALL `c0e2aa61…`, POST `48ca9378…`, ROLLBACK `359fb7bf…`, diff `eb424360…`).

## Costuras declaradas (não são prova LIVE)
- Auth: `auth.uid()`/`auth.jwt()` do harness por `request.jwt.claims`; sem `iat`, o ramo `access_valid_after` fica inerte. Não é JWT hospedado.
- `entitlements_for_user`: LIVE `7f4ec7fa…` não compila sem as tabelas SaaS (`organization_subscriptions`, `saas_*`); fica o provedor do espelho `96cee77d…`.
- Esquema reduzido e vazio, só se ausente: `ordens_servico`, `entregas` (+`estoque_produto_id`), `estoque_produto(id)`, `finished_product_gate_v1` (DDL da etapa 31, enabled=false),
  `authz_tickets`, `platform_org_admin_invites`, `user_clientes`, `fazendas`; colunas `profiles.senha_provisoria/created_at/updated_at`, `partner_users.version`.
- Corpos reais de capturas antigas do repo (instalados só se ausentes, NÃO reconfirmados 09/11):
  `assert_b2b_partner_scope` `f86f43f9…` (29/10), `b2b_commercial_context` `2f1063f0…` (29/10), `c2_producer_links` `881cdf48…` (29/10).
- ACL de `respond_b2b_order_quote_secure` pinada a partir do espelho (`{postgres,authenticated,service_role}=X`); o auditor precisa confirmar em LIVE, senão PRE aborta.

## Captura pendente
`capture-request-20261109b.json`.
