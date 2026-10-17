# Writers — catálogo read-only 2026-10-17 12:50 UTC

Ref validado em `supabase/config.toml`: `swzpzcwiasxmjutrmvkm`. Uma consulta SELECT via ferramenta Supabase retornou assinaturas/MD5, sem registros de usuários e sem executar writers. Fonte: `tool-results://supabase--read_query/20261017-125023-994942`. Filtro por nome e texto DML; **não é closure universal** (SQL dinâmico, callers externos e grants diretos não cobertos).

Os corpos completos atuais dos seguintes writers/callers ainda devem ser auditados para locks; assinatura presente não equivale a prova de corpo/ordem:

```text
platform_private.create_organization_core(text,text,text,text,text,boolean,jsonb)
platform_private.set_org_principal_admin_core(uuid,uuid,text,uuid,uuid)
platform_private.transition_subscription_core(uuid,text,text,uuid,uuid)
platform_private.update_org_admin_core(uuid,text,text,text,text,timestamp with time zone,uuid)
platform_private.update_organization_profile_core(uuid,text,text,text,text,timestamp with time zone,uuid,jsonb)
platform_private.user_edit_f2_common(uuid,timestamp with time zone,jsonb,app_role[],uuid[],uuid,uuid)
public._org_set_status(uuid,text,text)
public.admin_edit_user_profile_v1(uuid,timestamp with time zone,jsonb,app_role[],uuid[],uuid,uuid)
public.admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text)
public.b2b_complete_provisioning_compensation(uuid,uuid,uuid)
public.b2b_finish_provisioning(uuid,uuid,uuid)
public.expire_due_trials(integer)
public.org_onboarding_complete()
public.org_onboarding_save(jsonb)
public.platform_accept_org_admin_email_delivery(uuid,uuid)
public.platform_archive_plan_version(uuid,text,uuid)
public.platform_claim_admin_access(uuid,uuid,uuid,text,boolean)
public.platform_claim_org_admin_email_delivery(uuid,integer)
public.platform_claim_org_admin_email_delivery(uuid,uuid,boolean,integer)
public.platform_claim_org_admin_provisioning(uuid,text,text,text,text,text,boolean)
public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean)
public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean,boolean)
public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean,boolean,text)
public.platform_complete_org_admin_email_change(uuid,uuid)
public.platform_create_organization(text,text,text,text,text,boolean,jsonb)
public.platform_end_feature_override(uuid,text)
public.platform_end_feature_override(uuid,text,uuid)
public.platform_extend_trial(uuid,timestamp with time zone,text,uuid)
public.platform_fail_org_admin_email_delivery(uuid,uuid,text,integer)
public.platform_fail_org_admin_provisioning(uuid,uuid,text)
public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid)
public.platform_finish_admin_access(uuid,uuid,uuid,uuid,text)
public.platform_mark_org_admin_email_ambiguous(uuid,uuid,text)
public.platform_publish_plan_version(text,numeric,text,text,jsonb,timestamp with time zone,text,uuid)
public.platform_publish_plan_version_draft(uuid,text,uuid,text)
public.platform_register_org_admin(uuid,uuid,uuid,text,text,text,text,text,boolean)
public.platform_save_plan_version_draft(uuid,text,numeric,text,text,integer,jsonb,timestamp with time zone,jsonb,text,uuid)
public.platform_set_feature_override(uuid,text,text,text,timestamp with time zone,numeric)
public.platform_set_feature_override(uuid,text,text,text,timestamp with time zone,numeric,uuid)
public.platform_transition_subscription(uuid,text,text,uuid,uuid)
public.save_client_portal_branding(uuid,text,text,text)
public.save_partner_portal_branding(uuid,text,text,text)
public.set_partner_user_papel(uuid,text)
public.tenant_admin_set_user_active(uuid,boolean)
```

`public.sync_user_cliente_principal()` retornou o hash fornecido `1d053564ccd5fa672a10ec87d5cb0baa`; corpo já recebido. `transition_subscription_core` retornou `e7e3b57debf67673a82e3f4f7c2daa48`; nenhuma ativação/reexecução.

Catálogo também encontrou `public.handle_new_user()`, `platform_private.conclude_provisional_password()` e `platform_private.conclude_provisional_password_server(uuid)`: fronteira existente de Auth, **não modificar nem ampliar este recorte**. Não reivindicar coverage dessa fronteira com stubs. Writers diretos clientes/partner por SDK, triggers-filhos de audit/recalc/default financeiro e SQL dinâmico precisam inventário além do filtro. `link_partner_user(...)` não foi confirmado por esta consulta; não inventar assinatura/instalação.

Contenção service-role explícita: `generate-financial-report`, `generate-financial-receipt`, `fiscal-xml-engine`, `entrega-termo-pdf` ainda podem emitir signed URLs. Policy authenticated/anon não os bloqueia. Exigir retirada/negação server-side dos ramos de assinatura com teste contra cliente antigo e preservação do download autenticado; não confiar na versão do cliente. Nenhuma Edge alterada/deployada nesta rodada; T0 indefinido.