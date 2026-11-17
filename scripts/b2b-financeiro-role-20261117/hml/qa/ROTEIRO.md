# QA hospedado HML — Financeiro B2B (vrlcdwmlytukrjezrrnf)

Nada aqui roda em produção. Senhas/JWTs ficam só com o operador; evidência leva IDs em hash.

## Ordem (cada passo só após o anterior passar)
1. `hml/01-capture.sql.readonly` (C1, C4–C8) → devolver. Faltam: md5 HML de `external_provisioning_scope`, `admin_provision_user_profile_v1`, `b2b_finish_provisioning`, `rpc_partner_message_counters`, `rpc_portal_partner_financial`, `b2b_own_obligations`, `is_valid_b2b_partner_user`, `h15_actor_organization`, `has_role`, `platform_actor_access_ready`, `require_service_role`, `is_platform_superadmin`, `entitlements_for_user`; **ACL de `fn_b2b_credit_exposure`** (corpo HML legado não tem gate de ator: se `authenticated` tiver EXECUTE, qualquer sessão lê crédito de qualquer parceiro — achado independente do Financeiro); `partner_users_papel_check`; enum.
2. `python3 hml/build_hml.py` (já gerado) → `01-pre-hml` (`SET app.expected_ref='vrlcdwmlytukrjezrrnf'`) deve dar `PRE_PASS`. Se `B2B_FIN_PRE_DRIFT:<fn>`, devolver o corpo HML dessa função; não repinar.
3. `02a-install-enum-hml` (commit isolado) → `02b-install-hml` → `03-post-hml` = `POST_PASS` → `02c-install-access-transition-hml`.
4. Edges no HML: `create-user` (patch do pacote) e `tenant-user-admin` (`scripts/user-edit-access-email-links-20261117/edge`). Gate do frontend permanece OFF em produção.
5. Fixtures sintéticos (somente por writers canônicos, prefixo `QA-FIN-<data>`; registrar cada ID em `qa-ids.json`):
   - Empresa X: parceiros A e B; Empresa Y: parceiro C (ou reutilizar fixtures HML sintéticos já existentes, nunca contas de clientes/funcionários).
   - Usuários: no HML o provisionamento de produção não existe (captura 17/11). Criar Técnico/Gestor pelo cadastro HML existente e obter Financeiro A/B/C **somente** pela transição canônica 02c em Editar Usuário (Técnico → Financeiro com vínculo/versão). Nunca usar `admin_provision_user_profile_v1` legado para o papel financeiro. Senha definida pelo próprio operador; sem convites/emails (comunicação OFF).
   - Títulos/pedidos: apenas os existentes sintéticos do HML; não emitir NF, cobrança ou baixa.
6. `HML_ANON_KEY=… QA_FIN_A=… QA_FIN_B=… QA_FIN_C=… QA_GESTOR_A=… QA_TECNICO_A=… QA_PARTNER_A=… QA_PARTNER_B=… QA_PARTNER_C=… python3 hml/qa/jwt_suite.py` → `evidence-hml-jwt.json`, código 0.
7. Transições (Editar Usuário, admin QA da empresa X): Técnico A → Financeiro A; Financeiro B → Gestor B; tentativa com parceiro de outra empresa (deve negar); versão de vínculo desatualizada (PT409). Após cada uma: JWT antigo do alvo deve ser negado; repetir passo 6 com `QA_FIN_REVOKED` = sessão antiga.
8. Navegador desktop (1280) e celular (390): login Financeiro A → `/portal-financeiro-b2b` (resumo, títulos, parcelas, histórico, CSV, crédito “indisponível” no HML); URL `/portal-gestor` e `/pedidos` negadas; trocar sessão A→C sem resíduo; revogar papel com tela aberta → tela/CSV somem em ≤30 s. Gestor A e Técnico A: portais habituais sem regressão. Capturas sem dados pessoais.
9. Limpeza: só IDs de `qa-ids.json` (revogar vínculos/papéis pelo Editar Usuário; fixtures de dado pelo writer canônico); `04c`/`04-rollback-hml` só se for reverter o pacote.

## Crédito
No HML o crédito fica **fechado por construção** (cadeia B4 ausente). A prova do crédito real exige a cadeia B4 no HML via pacote próprio revisado ou prova em produção após instalação controlada; até lá o crédito não é liberado.

## Achados da captura HML 17/11 (parte 1) — fora do escopo do Financeiro, reportar ao proprietário
- `admin_provision_user_profile_v1` HML (9a2e228a) é INVOKER com EXECUTE para PUBLIC/anon/authenticated; proteção depende só das políticas (C6 pendente).
- ACL com TRUNCATE (`D`) para anon/authenticated em `user_roles`, `partner_order_messages`; para authenticated em `partner_users`, `partner_order_financial_links`, `partner_order_payment_schedule`, `financial_audit_log`, `accounts_receivable_installments`, `receivable_payments`. Contradiz o estado “04 aplicado na homologação”; RLS não cobre TRUNCATE.
- `fn_b2b_credit_exposure` HML legado sem gate de ator, mas EXECUTE só postgres/service_role (sem exposição a sessões).

## Captura parte 2 (C6–C8) — análise
- `parceiro_b2b_financeiro` ausente do enum HML → 02a-hml necessário (commit isolado antes de 02b).
- Leituras diretas que um Financeiro com vínculo alcançaria no HML sem o pacote: `pofl_partner_select_own` (só vínculo, sem papel) e `partner_accounts_self_select` (`b2b_coherent_self_partner`). Ambas fechadas pelas políticas RESTRICTIVE `b2b_finance_role_direct_closed` do 02b; a suíte JWT verifica as duas tabelas.
- Demais leituras exigem `parceiro_b2b` ou papéis internos (`financeiro` interno ≠ papel externo) → não alcançáveis pelo Financeiro B2B.
- HML difere da produção (fora do escopo, reportar): falta `b2b_phase1_tenant_guard` RESTRICTIVE em `partner_order_financial_links` e `financial_rpc_only_*` em parcelas.
- Gatilhos de `partner_users` que a transição 02c aciona divergem da produção: `partner_users_derive_tenant` (HML 84266976 / prod def221f8) e `cf_user_guards_v1.touch_related_profiles` (HML 7700e706 / prod e5911c38). **Bloqueio**: rodar `hml/02-capture-triggers.sql.readonly` (C9) antes de instalar 02c no HML; a bateria de transição será refeita com esses corpos reais.
