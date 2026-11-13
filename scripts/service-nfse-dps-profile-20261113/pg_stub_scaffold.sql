-- Andaime LOCAL descartável: tabelas mínimas e funções de autorização SIMULADAS.
-- Não reproduz RLS/JWT/rpc_fiscal_draft_save reais; serve só para exercitar a migração candidata.
create role authenticated nologin; create role anon nologin;
create schema auth; create schema platform_private;
create type app_role as enum ('administrador','financeiro','gestor');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table user_roles(user_id uuid, role app_role, org uuid);
create function public.has_role(u uuid, r app_role) returns boolean language sql stable as $$ select exists(select 1 from user_roles where user_id=u and role=r) $$;
create function public.h15_require_staff() returns void language sql as $$ select $$;
create function platform_private.fiscal_require_released_org() returns void language sql as $$ select $$;
create function public.h15_actor_organization() returns uuid language sql stable as $$ select org from user_roles where user_id=auth.uid() limit 1 $$;
create function public.h15_require_invoice(uuid) returns void language sql as $$ select $$;
create table catalog_services(id uuid primary key, organization_id uuid, name text, unit text, is_active boolean default true);
create table service_fiscal_profiles(id uuid primary key default gen_random_uuid(), organization_id uuid, service_id uuid, is_active boolean default true,
  lc116_item text, cnae text, municipal_taxation_code text, national_taxation_code text, incidence_municipality_ibge_code text, iss_rate numeric, iss_withheld_default boolean default false,
  fiscal_description_template text, federal_withholding_defaults jsonb);
create table service_engagements(id uuid primary key, organization_id uuid, service_id uuid, customer_id uuid, performed_on date, quantity numeric, unit_price numeric, description text, status text, fiscal_invoice_id uuid, billed_at timestamptz);
create table service_billing_requests(organization_id uuid, idempotency_key text, request_hash text, engagement_ids uuid[], fiscal_invoice_id uuid, created_by uuid);
create table company_fiscal_settings(organization_id uuid, is_active boolean, fiscal_environment text, updated_at timestamptz default now());
create table fiscal_invoices(id uuid primary key default gen_random_uuid(), organization_id uuid, invoice_type text, document_model text, document_origin text default 'MANUAL_RECORD', environment text,
  provider text default 'NONE', status text default 'DRAFT', normalized_status text default 'DRAFT', locked_at timestamptz, customer_id uuid, issue_date date, notes text,
  fiscal_profile_snapshot jsonb default '{}', tax_snapshot jsonb default '{}', fiscal_totals_snapshot jsonb default '{}', draft_version int default 1, total_amount numeric);
create table fiscal_invoice_items(id uuid primary key default gen_random_uuid(), fiscal_invoice_id uuid, item_sequence int, item_kind text, description text, quantity numeric, unit_value numeric, discount_value numeric,
  commercial_unit text, source_item_type text, source_item_id uuid, fiscal_profile_snapshot jsonb, tax_snapshot jsonb, tax_input_snapshot jsonb, net_value numeric);
create table nfse_transmissions(id uuid primary key default gen_random_uuid(), fiscal_invoice_id uuid);
-- Stub de rpc_fiscal_draft_save: CAS por draft_version, DRAFT obrigatório, substitui itens (mesma semântica do UPDATE real lida em produção).
create function public.rpc_fiscal_draft_save(p_invoice_id uuid, p_invoice jsonb, p_items jsonb, p_expected_version integer) returns jsonb language plpgsql as $$
declare v_id uuid; v_total numeric; v_ver int;
begin
  select coalesce(sum(round((it->>'quantity')::numeric*(it->>'unit_value')::numeric - coalesce((it->>'discount_value')::numeric,0),2)),0) into v_total from jsonb_array_elements(p_items) it;
  if p_invoice_id is null then
    insert into fiscal_invoices(organization_id, invoice_type, document_model, environment, customer_id, issue_date, notes, fiscal_profile_snapshot, total_amount)
    values (public.h15_actor_organization(), p_invoice->>'invoice_type', p_invoice->>'document_model', p_invoice->>'environment', (p_invoice->>'customer_id')::uuid, (p_invoice->>'issue_date')::date, p_invoice->>'notes', coalesce(p_invoice->'fiscal_profile_snapshot','{}'), v_total) returning id, draft_version into v_id, v_ver;
  else
    update fiscal_invoices set fiscal_profile_snapshot = coalesce(p_invoice->'fiscal_profile_snapshot','{}'), tax_snapshot = coalesce(p_invoice->'tax_snapshot','{}'), total_amount = v_total, draft_version = draft_version+1
     where id = p_invoice_id and status='DRAFT' and draft_version = p_expected_version returning id, draft_version into v_id, v_ver;
    if not found then raise exception 'conflict' using errcode='PT409'; end if;
  end if;
  delete from fiscal_invoice_items where fiscal_invoice_id = v_id;
  insert into fiscal_invoice_items(fiscal_invoice_id,item_sequence,item_kind,description,quantity,unit_value,discount_value,commercial_unit,source_item_type,source_item_id,fiscal_profile_snapshot,tax_snapshot,tax_input_snapshot,net_value)
  select v_id, ord, it->>'item_kind', it->>'description', (it->>'quantity')::numeric, (it->>'unit_value')::numeric, coalesce((it->>'discount_value')::numeric,0), it->>'commercial_unit', it->>'source_item_type', (it->>'source_item_id')::uuid,
         it->'fiscal_profile_snapshot', it->'tax_snapshot', coalesce(it->'tax_input_snapshot','{}'), round((it->>'quantity')::numeric*(it->>'unit_value')::numeric,2)
    from jsonb_array_elements(p_items) with ordinality x(it, ord);
  return jsonb_build_object('id', v_id, 'draft_version', v_ver, 'total_amount', v_total);
end $$;
grant usage on schema public, platform_private, auth to authenticated;
grant all on all tables in schema public to authenticated;
