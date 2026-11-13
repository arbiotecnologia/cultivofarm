do $pre$ begin
  if (select project_ref from public.fiscal_environment_marker limit 1) is distinct from 'swzpzcwiasxmjutrmvkm' then raise exception 'PRE_WRONG_PROJECT'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.rpc_service_billing_reapply_profile_v1(uuid,integer)'::regprocedure) <> '136791c1e4f4fa13046db96c789c0a98' then raise exception 'PRE_MISMATCH: reapply'; end if;
end $pre$;

create table if not exists platform_private.nfse_homolog_send_allowlist (
  organization_id uuid not null references public.organizations(id),
  company_settings_id uuid not null references public.company_fiscal_settings(id),
  reason text not null check (length(btrim(reason)) between 10 and 500),
  created_at timestamptz not null default now(),
  created_by text not null default current_user,
  revoked_at timestamptz,
  primary key (organization_id, company_settings_id)
);
revoke all on table platform_private.nfse_homolog_send_allowlist from public, anon, authenticated, service_role;
alter table platform_private.nfse_homolog_send_allowlist enable row level security;

create or replace function public.rpc_nfse_homolog_send_allowed_v1(_actor uuid, _invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare inv public.fiscal_invoices; c public.company_fiscal_settings; v_ref text; v_prod boolean;
begin
  if coalesce(current_setting('role', true), '') <> 'service_role' and current_user <> 'service_role' then raise exception 'NFSE_SERVICE_ONLY' using errcode = '42501'; end if;
  if _actor is null or _invoice_id is null then return jsonb_build_object('allowed', false, 'reason', 'argument_required'); end if;
  if coalesce(public.h15_service_actor_invoice_access(_actor, _invoice_id), false) is not true then return jsonb_build_object('allowed', false, 'reason', 'forbidden'); end if;
  if not (public.has_role(_actor,'administrador'::public.app_role) or public.has_role(_actor,'financeiro'::public.app_role)) then return jsonb_build_object('allowed', false, 'reason', 'forbidden'); end if;
  select * into inv from public.fiscal_invoices where id = _invoice_id;
  if not found or inv.invoice_type <> 'NFSE' then return jsonb_build_object('allowed', false, 'reason', 'invoice_not_nfse'); end if;
  if inv.environment is distinct from 'HOMOLOGATION' then return jsonb_build_object('allowed', false, 'reason', 'invoice_not_homologation'); end if;
  select * into c from public.company_fiscal_settings where id = inv.company_settings_id and organization_id = inv.organization_id and is_active;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'company_fiscal_settings_missing'); end if;
  if upper(coalesce(c.fiscal_environment,'')) <> 'HOMOLOGATION' or upper(coalesce(c.nfse_configuration->>'environment','')) <> 'HOMOLOGATION' then return jsonb_build_object('allowed', false, 'reason', 'emitter_not_homologation'); end if;
  if c.production_enabled is distinct from false then return jsonb_build_object('allowed', false, 'reason', 'production_enabled'); end if;
  if coalesce(c.nfse_provider,'') <> 'NFSE_NACIONAL' or not coalesce(c.nfse_enabled,false) or coalesce(btrim(c.nfse_credential_ref),'') = '' then return jsonb_build_object('allowed', false, 'reason', 'nfse_not_configured'); end if;
  select project_ref, production_emission_allowed into v_ref, v_prod from public.fiscal_environment_marker limit 1;
  if v_ref is distinct from 'swzpzcwiasxmjutrmvkm' or coalesce(v_prod, true) is not false then return jsonb_build_object('allowed', false, 'reason', 'environment_marker'); end if;
  if not exists (select 1 from platform_private.nfse_homolog_send_allowlist a
                  where a.organization_id = inv.organization_id and a.company_settings_id = c.id and a.revoked_at is null) then
    return jsonb_build_object('allowed', false, 'reason', 'not_allowlisted'); end if;
  return jsonb_build_object('allowed', true, 'reason', null);
end $$;
revoke all on function public.rpc_nfse_homolog_send_allowed_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_nfse_homolog_send_allowed_v1(uuid, uuid) to service_role;

do $m$
declare d text; a1 text := 'p.iss_rate, p.iss_withheld_default'; a2 text := '''municipality_ibge_code'', r.incidence_municipality_ibge_code)),';
begin
  d := pg_get_functiondef('public.rpc_service_billing_reapply_profile_v1(uuid,integer)'::regprocedure);
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 or (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'ANCHOR_MISMATCH'; end if;
  d := replace(d, a1, a1 || ', p.ibs_cbs_configuration p_ibs_cbs');
  d := replace(d, a2, '''municipality_ibge_code'', r.incidence_municipality_ibge_code, ''ibs_cbs'', r.p_ibs_cbs)),');
  execute d;
end $m$;

do $post$ begin
  if not exists (select 1 from pg_proc where oid = 'public.rpc_service_billing_reapply_profile_v1(uuid,integer)'::regprocedure and prosrc like '%''ibs_cbs'', r.p_ibs_cbs%'
                  and array_to_string(proacl, ',') = 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres') then raise exception 'POST_MISMATCH: reapply'; end if;
  if exists (select 1 from platform_private.nfse_homolog_send_allowlist) then raise exception 'POST_ALLOWLIST_NOT_EMPTY'; end if;
end $post$;