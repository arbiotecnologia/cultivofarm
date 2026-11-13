set local lock_timeout='4s';

create table public.catalog_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.h15_actor_organization() references public.organizations(id),
  code text,
  name text not null check (btrim(name) <> '' and length(name) <= 200),
  description text check (description is null or length(description) <= 2000),
  unit text not null default 'UN' check (btrim(unit) <> '' and length(unit) <= 10),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_services_id_org_key unique (id, organization_id)
);
grant select, insert, update on public.catalog_services to authenticated;
grant all on public.catalog_services to service_role;
alter table public.catalog_services enable row level security;
create unique index ux_catalog_services_org_name_active on public.catalog_services(organization_id, lower(btrim(name))) where is_active;
create unique index ux_catalog_services_org_code on public.catalog_services(organization_id, lower(btrim(code))) where code is not null and btrim(code) <> '';
create policy catalog_services_org_boundary on public.catalog_services as restrictive for all to public
  using (organization_id = (select public.h15_actor_organization()))
  with check (organization_id = (select public.h15_actor_organization()));
create policy catalog_services_select on public.catalog_services for select to authenticated using (
  public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro')
  or public.has_role((select auth.uid()),'gestor_comercial') or public.has_role((select auth.uid()),'administrativo'));
create policy catalog_services_insert on public.catalog_services for insert to authenticated with check (
  public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro'));
create policy catalog_services_update on public.catalog_services for update to authenticated
  using (public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro'))
  with check (public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro'));

create or replace function public.catalog_services_guard() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise exception 'catalog_service_identity_immutable' using errcode = '22023';
    end if;
    new.created_at := old.created_at; new.created_by := old.created_by;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
revoke all on function public.catalog_services_guard() from public, anon, authenticated;
create trigger trg_catalog_services_guard before insert or update on public.catalog_services for each row execute function public.catalog_services_guard();

-- Perfil fiscal de serviço vinculado ao serviço da mesma empresa (tabela vazia na inspeção).
alter table public.service_fiscal_profiles add constraint service_fiscal_profiles_service_org_fk
  foreign key (service_id, organization_id) references public.catalog_services(id, organization_id);

alter table public.clientes add constraint clientes_id_org_key unique (id, organization_id);

create table public.service_engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.h15_actor_organization() references public.organizations(id),
  service_id uuid not null,
  customer_id uuid not null,
  performed_on date not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total_amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  description text check (description is null or length(description) <= 2000),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','BILLED','CANCELED')),
  fiscal_invoice_id uuid references public.fiscal_invoices(id),
  billed_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_engagements_service_org_fk foreign key (service_id, organization_id) references public.catalog_services(id, organization_id),
  constraint service_engagements_customer_org_fk foreign key (customer_id, organization_id) references public.clientes(id, organization_id),
  constraint service_engagements_billed_coherent check ((status = 'BILLED') = (fiscal_invoice_id is not null))
);
grant select, insert, update on public.service_engagements to authenticated;
grant all on public.service_engagements to service_role;
alter table public.service_engagements enable row level security;
create index ix_service_engagements_org_customer on public.service_engagements(organization_id, customer_id, performed_on desc);
create index ix_service_engagements_invoice on public.service_engagements(fiscal_invoice_id) where fiscal_invoice_id is not null;
create policy service_engagements_org_boundary on public.service_engagements as restrictive for all to public
  using (organization_id = (select public.h15_actor_organization()))
  with check (organization_id = (select public.h15_actor_organization()));
create policy service_engagements_select on public.service_engagements for select to authenticated using (
  public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro'));
create policy service_engagements_insert on public.service_engagements for insert to authenticated with check (
  public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro'));
create policy service_engagements_update on public.service_engagements for update to authenticated
  using (public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro'))
  with check (public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'gestor') or public.has_role((select auth.uid()),'financeiro'));

create or replace function public.service_engagements_guard() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  -- Chamadores diretos (authenticated) nunca faturam nem alteram registro faturado;
  -- somente a RPC de faturamento (definer) muda para BILLED.
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      if new.status not in ('DRAFT','READY') or new.fiscal_invoice_id is not null or new.billed_at is not null then
        raise exception 'service_engagement_billing_forbidden' using errcode = '42501';
      end if;
      if not exists (select 1 from public.catalog_services s where s.id = new.service_id and s.organization_id = new.organization_id and s.is_active) then
        raise exception 'service_inactive_or_foreign' using errcode = '22023';
      end if;
    else
      if old.status in ('BILLED','CANCELED') then
        raise exception 'service_engagement_locked' using errcode = '55006';
      end if;
      if new.status = 'BILLED' or new.fiscal_invoice_id is not null or new.billed_at is not null then
        raise exception 'service_engagement_billing_forbidden' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise exception 'service_engagement_identity_immutable' using errcode = '22023';
    end if;
    new.created_at := old.created_at; new.created_by := old.created_by;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
revoke all on function public.service_engagements_guard() from public, anon, authenticated;
create trigger trg_service_engagements_guard before insert or update on public.service_engagements for each row execute function public.service_engagements_guard();

create table public.service_billing_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  idempotency_key text not null,
  request_hash text not null,
  engagement_ids uuid[] not null,
  fiscal_invoice_id uuid not null references public.fiscal_invoices(id),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint service_billing_requests_key unique (organization_id, idempotency_key)
);
grant select on public.service_billing_requests to authenticated;
grant all on public.service_billing_requests to service_role;
alter table public.service_billing_requests enable row level security;
create policy service_billing_requests_org_boundary on public.service_billing_requests as restrictive for all to public
  using (organization_id = (select public.h15_actor_organization()));
create policy service_billing_requests_select on public.service_billing_requests for select to authenticated using (
  public.has_role((select auth.uid()),'administrador') or public.has_role((select auth.uid()),'financeiro'));

create or replace function public.rpc_service_billing_create_draft_v1(p_engagement_ids uuid[], p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_ids uuid[];
  v_hash text;
  v_req public.service_billing_requests;
  v_count int;
  v_customers int;
  v_customer uuid;
  v_items jsonb := '[]'::jsonb;
  v_env text;
  v_res jsonb;
  v_invoice uuid;
  r record;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform public.h15_require_staff();
  perform platform_private.fiscal_require_released_org();
  if not (public.has_role(v_user,'administrador'::app_role) or public.has_role(v_user,'financeiro'::app_role)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_org := public.h15_actor_organization();
  if v_org is null then raise exception 'H15_ORGANIZATION_FORBIDDEN' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128 or p_idempotency_key !~ '^[A-Za-z0-9_.:-]+$' then
    raise exception 'idempotency_key_invalid' using errcode = '22023';
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(coalesce(p_engagement_ids,'{}'::uuid[])) x where x is not null;
  if v_ids is null or array_length(v_ids,1) < 1 or array_length(v_ids,1) > 200 then
    raise exception 'engagements_required' using errcode = '22023';
  end if;
  v_hash := md5(array_to_string(v_ids, ','));

  perform pg_advisory_xact_lock(hashtextextended(v_org::text || '|' || p_idempotency_key, 0));
  select * into v_req from public.service_billing_requests where organization_id = v_org and idempotency_key = p_idempotency_key;
  if found then
    if v_req.request_hash <> v_hash then raise exception 'idempotency_key_reused' using errcode = 'PT409'; end if;
    return jsonb_build_object('invoice_id', v_req.fiscal_invoice_id, 'replayed', true);
  end if;

  perform 1 from public.service_engagements where id = any(v_ids) and organization_id = v_org order by id for update;
  select count(*), count(distinct customer_id), min(customer_id::text)::uuid into v_count, v_customers, v_customer
    from public.service_engagements where id = any(v_ids) and organization_id = v_org;
  if v_count <> array_length(v_ids,1) then raise exception 'engagement_not_found' using errcode = 'P0002'; end if;
  if v_customers <> 1 then raise exception 'engagements_mixed_customers' using errcode = '22023'; end if;
  if exists (select 1 from public.service_engagements where id = any(v_ids) and status <> 'READY') then
    raise exception 'engagement_not_ready' using errcode = 'PT409';
  end if;

  for r in
    select e.*, s.name s_name, s.unit s_unit, s.is_active s_active, p.id p_id, p.lc116_item, p.cnae, p.municipal_taxation_code, p.national_taxation_code,
           p.incidence_municipality_ibge_code, p.iss_rate, p.iss_withheld_default, p.fiscal_description_template
      from public.service_engagements e
      join public.catalog_services s on s.id = e.service_id and s.organization_id = e.organization_id
      left join public.service_fiscal_profiles p on p.service_id = e.service_id and p.organization_id = e.organization_id and p.is_active
     where e.id = any(v_ids) order by e.performed_on, e.id
  loop
    if r.p_id is null then raise exception 'service_fiscal_profile_missing:%', r.service_id using errcode = 'P0002'; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'item_kind','SERVICE',
      'description', coalesce(nullif(btrim(r.description),''), nullif(btrim(r.fiscal_description_template),''), r.s_name),
      'quantity', r.quantity, 'unit_value', r.unit_price, 'discount_value', 0,
      'commercial_unit', r.s_unit, 'source_item_type','SERVICE', 'source_item_id', r.service_id,
      'fiscal_profile_snapshot', jsonb_strip_nulls(jsonb_build_object('lc116_item', r.lc116_item, 'cnae', r.cnae,
          'municipal_tax_code', r.municipal_taxation_code, 'national_tax_code', r.national_taxation_code,
          'municipality_ibge_code', r.incidence_municipality_ibge_code)),
      'tax_snapshot', jsonb_strip_nulls(jsonb_build_object('iss_rate', r.iss_rate, 'iss_withheld', r.iss_withheld_default)),
      'tax_input_snapshot', '{}'::jsonb));
  end loop;

  select case when upper(coalesce(fiscal_environment,'')) in ('HOMOLOGATION','HOMOLOGACAO') then 'HOMOLOGATION' else 'NOT_CONFIGURED' end
    into v_env from public.company_fiscal_settings where organization_id = v_org and is_active order by updated_at desc limit 1;

  v_res := public.rpc_fiscal_draft_save(null, jsonb_build_object(
      'invoice_type','NFSE','document_model','NFSE','environment', coalesce(v_env,'NOT_CONFIGURED'),
      'customer_id', v_customer, 'issue_date', current_date::text,
      'notes', 'Faturamento de serviços prestados (' || array_length(v_ids,1) || ' registro(s))'),
    v_items, null);
  v_invoice := (v_res->>'id')::uuid;
  if v_invoice is null then raise exception 'draft_not_created' using errcode = 'P0001'; end if;

  update public.service_engagements set status = 'BILLED', fiscal_invoice_id = v_invoice, billed_at = now()
   where id = any(v_ids) and organization_id = v_org and status = 'READY';
  get diagnostics v_count = row_count;
  if v_count <> array_length(v_ids,1) then raise exception 'engagement_state_changed' using errcode = 'PT409'; end if;

  insert into public.service_billing_requests(organization_id, idempotency_key, request_hash, engagement_ids, fiscal_invoice_id, created_by)
  values (v_org, p_idempotency_key, v_hash, v_ids, v_invoice, v_user);
  return jsonb_build_object('invoice_id', v_invoice, 'replayed', false, 'total_amount', v_res->'total_amount');
end $$;
revoke all on function public.rpc_service_billing_create_draft_v1(uuid[], text) from public, anon;
grant execute on function public.rpc_service_billing_create_draft_v1(uuid[], text) to authenticated;

create or replace function public.rpc_service_nfse_readiness_v1()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid; c record; v_missing text[] := '{}';
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform public.h15_require_staff();
  v_org := public.h15_actor_organization();
  select nfse_enabled, nfse_provider, nfse_credential_ref is not null and btrim(nfse_credential_ref) <> '' has_cred,
         fiscal_environment, municipality_ibge_code, municipal_registration, nfse_series
    into c from public.company_fiscal_settings where organization_id = v_org and is_active order by updated_at desc limit 1;
  if not found then return jsonb_build_object('ready', false, 'missing', jsonb_build_array('company_fiscal_settings')); end if;
  if not coalesce(c.nfse_enabled,false) then v_missing := v_missing || 'nfse_enabled'; end if;
  if coalesce(c.nfse_provider,'') in ('','NONE') then v_missing := v_missing || 'nfse_provider'; end if;
  if not c.has_cred then v_missing := v_missing || 'nfse_credential'; end if;
  if coalesce(c.municipality_ibge_code,'') !~ '^\d{7}$' then v_missing := v_missing || 'municipality_ibge_code'; end if;
  return jsonb_build_object('ready', cardinality(v_missing) = 0, 'provider', c.nfse_provider,
    'environment', c.fiscal_environment, 'missing', to_jsonb(v_missing));
end $$;
revoke all on function public.rpc_service_nfse_readiness_v1() from public, anon;
grant execute on function public.rpc_service_nfse_readiness_v1() to authenticated;