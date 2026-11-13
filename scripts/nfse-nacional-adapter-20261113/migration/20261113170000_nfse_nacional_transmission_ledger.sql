-- CANDIDATA (não aplicada). Ledger de transmissão NFS-e Nacional e RPCs
-- service-only. Não habilita emissão: company_fiscal_settings.nfse_enabled,
-- credenciais, fiscal_environment_marker e flags da Edge permanecem como estão.
-- Pré-condição: projeto swzpzcwiasxmjutrmvkm (verificado abaixo, fail-closed).
do $$ begin
  if (select project_ref from public.fiscal_environment_marker limit 1) is distinct from 'swzpzcwiasxmjutrmvkm' then
    raise exception 'NFSE_LEDGER_WRONG_PROJECT';
  end if;
end $$;

create table if not exists public.nfse_transmissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  company_settings_id uuid not null references public.company_fiscal_settings(id),
  fiscal_invoice_id uuid not null references public.fiscal_invoices(id),
  actor_id uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{16,128}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  environment text not null check (environment in ('HOMOLOGATION','PRODUCTION')),
  endpoint_host text not null,
  dps_series text not null check (dps_series ~ '^\d{1,5}$'),
  dps_number bigint not null check (dps_number between 1 and 999999999999999),
  dps_id text check (dps_id ~ '^DPS\d{42}$'),
  dps_xml_sha256 text check (dps_xml_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'PENDING' check (state in ('PENDING','SENT','SUCCEEDED','FAILED','BLOCKED')),
  outcome text not null default 'PENDING' check (outcome in ('PENDING','AUTHORIZED','REJECTED','RECONCILIATION_REQUIRED','NOT_FOUND','TRANSPORT_ERROR')),
  http_status integer,
  access_key text check (access_key ~ '^\d{50}$'),
  nfse_number text check (nfse_number ~ '^\d{1,15}$'),
  processed_at text,
  nfse_xml_sha256 text check (nfse_xml_sha256 ~ '^[0-9a-f]{64}$'),
  nfse_xml_path text,
  error_code text,
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  verification jsonb not null default '[]'::jsonb check (jsonb_typeof(verification) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nfse_tx_host_env check ((environment = 'HOMOLOGATION' and endpoint_host = 'sefin.producaorestrita.nfse.gov.br') or (environment = 'PRODUCTION' and endpoint_host = 'sefin.nfse.gov.br')),
  constraint nfse_tx_authorized_key check (outcome <> 'AUTHORIZED' or (access_key is not null and dps_id is not null and nfse_xml_sha256 is not null)),
  unique (organization_id, idempotency_key),
  unique (company_settings_id, environment, dps_series, dps_number)
);
create unique index if not exists nfse_tx_one_open_per_invoice on public.nfse_transmissions(fiscal_invoice_id)
  where state in ('PENDING','SENT') or outcome in ('AUTHORIZED','RECONCILIATION_REQUIRED');
create unique index if not exists nfse_tx_access_key_unique on public.nfse_transmissions(access_key) where access_key is not null;

grant select on public.nfse_transmissions to authenticated;
grant all on public.nfse_transmissions to service_role;
alter table public.nfse_transmissions enable row level security;
drop policy if exists nfse_tx_select_org_staff on public.nfse_transmissions;
create policy nfse_tx_select_org_staff on public.nfse_transmissions for select to authenticated
  using (organization_id = public.h15_actor_organization()
         and (public.has_role(auth.uid(),'administrador'::public.app_role) or public.has_role(auth.uid(),'financeiro'::public.app_role) or public.has_role(auth.uid(),'gestor'::public.app_role)));

create or replace function public.rpc_nfse_transmit_begin_v1(_actor uuid, _invoice_id uuid, _idempotency_key text, _fingerprint text, _environment text, _endpoint_host text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','pg_temp' as $$
declare inv public.fiscal_invoices; c public.company_fiscal_settings; v_org uuid; v_env text; ex public.nfse_transmissions; r public.nfse_transmissions; v_series text; v_next bigint; v_prod boolean; v_ref text;
begin
  if coalesce(current_setting('role', true), '') <> 'service_role' and current_user <> 'service_role' then raise exception 'NFSE_SERVICE_ONLY' using errcode = '42501'; end if;
  if _actor is null or _invoice_id is null then raise exception 'NFSE_ARGUMENT_REQUIRED' using errcode = '22023'; end if;
  if coalesce(public.h15_service_actor_invoice_access(_actor, _invoice_id), false) is not true then raise exception 'FISCAL_RESOURCE_FORBIDDEN' using errcode = '42501'; end if;
  if not (public.has_role(_actor,'administrador'::public.app_role) or public.has_role(_actor,'financeiro'::public.app_role)) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if _idempotency_key is null or _idempotency_key !~ '^[A-Za-z0-9_.:-]{16,128}$' then raise exception 'idempotency_key_invalid' using errcode = '22023'; end if;
  if _fingerprint is null or _fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'NFSE_FINGERPRINT_INVALID' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('nfse_tx|' || _invoice_id::text, 0));
  select * into inv from public.fiscal_invoices where id = _invoice_id for update;
  if not found then raise exception 'invoice_not_found' using errcode = 'P0002'; end if;
  v_org := inv.organization_id;

  select * into ex from public.nfse_transmissions where organization_id = v_org and idempotency_key = _idempotency_key;
  if found then
    if ex.request_fingerprint <> _fingerprint or ex.fiscal_invoice_id <> _invoice_id then raise exception 'idempotency_key_reused' using errcode = 'PT409'; end if;
    return to_jsonb(ex) || jsonb_build_object('idempotent_replay', true);
  end if;

  if inv.invoice_type <> 'NFSE' then raise exception 'invoice_not_nfse' using errcode = '22023'; end if;
  if inv.normalized_status <> 'DRAFT' then raise exception 'invoice_not_draft' using errcode = 'PT409'; end if;
  select * into c from public.company_fiscal_settings where id = inv.company_settings_id and organization_id = v_org and is_active;
  if not found then raise exception 'company_fiscal_settings_missing' using errcode = 'P0002'; end if;
  if not coalesce(c.nfse_enabled, false) or coalesce(c.nfse_provider,'') <> 'NFSE_NACIONAL' or coalesce(btrim(c.nfse_credential_ref),'') = '' then
    raise exception 'NFSE_NOT_CONFIGURED' using errcode = 'PT409'; end if;
  v_env := case when upper(coalesce(c.fiscal_environment,'')) in ('HOMOLOGATION','HOMOLOGACAO') then 'HOMOLOGATION'
                when upper(coalesce(c.fiscal_environment,'')) in ('PRODUCTION','PRODUCAO') then 'PRODUCTION' end;
  if v_env is null or v_env <> _environment then raise exception 'NFSE_ENVIRONMENT_MISMATCH' using errcode = '22023'; end if;
  if v_env = 'HOMOLOGATION' and inv.environment is distinct from 'HOMOLOGATION' then raise exception 'NFSE_ENVIRONMENT_MISMATCH' using errcode = '22023'; end if;
  if v_env = 'PRODUCTION' then
    select project_ref, production_emission_allowed into v_ref, v_prod from public.fiscal_environment_marker limit 1;
    if v_ref is distinct from 'swzpzcwiasxmjutrmvkm' or coalesce(v_prod, false) is not true then raise exception 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED' using errcode = '42501'; end if;
  end if;
  if exists (select 1 from public.nfse_transmissions t where t.fiscal_invoice_id = _invoice_id
             and (t.state in ('PENDING','SENT') or t.outcome in ('AUTHORIZED','RECONCILIATION_REQUIRED'))) then
    raise exception 'NFSE_TRANSMISSION_ACTIVE' using errcode = 'PT409'; end if;

  v_series := coalesce(nullif(btrim(c.nfse_series::text),''), '1');
  perform pg_advisory_xact_lock(hashtextextended('nfse_dps|' || c.id::text || '|' || v_env || '|' || v_series, 0));
  select coalesce(max(dps_number), 0) + 1 into v_next from public.nfse_transmissions where company_settings_id = c.id and environment = v_env and dps_series = v_series;
  insert into public.nfse_transmissions(organization_id, company_settings_id, fiscal_invoice_id, actor_id, idempotency_key, request_fingerprint, environment, endpoint_host, dps_series, dps_number)
  values (v_org, c.id, _invoice_id, _actor, _idempotency_key, _fingerprint, v_env, _endpoint_host, v_series, v_next) returning * into r;
  return to_jsonb(r) || jsonb_build_object('idempotent_replay', false);
end $$;

create or replace function public.rpc_nfse_transmit_record_v1(_transmission_id uuid, _state text, _outcome text, _patch jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','pg_temp' as $$
declare t public.nfse_transmissions; ok boolean; p jsonb := coalesce(_patch, '{}'::jsonb);
begin
  if coalesce(current_setting('role', true), '') <> 'service_role' and current_user <> 'service_role' then raise exception 'NFSE_SERVICE_ONLY' using errcode = '42501'; end if;
  select * into t from public.nfse_transmissions where id = _transmission_id for update;
  if not found then raise exception 'transmission_not_found' using errcode = 'P0002'; end if;
  if t.outcome = 'AUTHORIZED' then raise exception 'NFSE_TRANSMISSION_TERMINAL' using errcode = 'PT409'; end if;
  ok := case
    when t.state = 'PENDING' then (_state, _outcome) in (('SENT','PENDING'), ('BLOCKED','PENDING'))
    when t.state = 'SENT' then (_state = 'SENT' and _outcome = 'RECONCILIATION_REQUIRED')
                             or (_state = 'SUCCEEDED' and _outcome in ('AUTHORIZED','RECONCILIATION_REQUIRED'))
                             or (_state = 'FAILED' and _outcome in ('REJECTED','NOT_FOUND','TRANSPORT_ERROR'))
    when t.outcome = 'RECONCILIATION_REQUIRED' then (_state = 'SUCCEEDED' and _outcome in ('AUTHORIZED','RECONCILIATION_REQUIRED')) or (_state = 'FAILED' and _outcome = 'NOT_FOUND')
    else false end;
  if not ok then raise exception 'NFSE_TRANSITION_INVALID:% % -> % %', t.state, t.outcome, _state, _outcome using errcode = 'PT409'; end if;
  if _state = 'SENT' and t.state = 'PENDING' and (coalesce(p->>'dpsId','') !~ '^DPS\d{42}$' or coalesce(p->>'dpsXmlSha256','') !~ '^[0-9a-f]{64}$') then
    raise exception 'NFSE_SENT_REQUIRES_DPS' using errcode = '22023'; end if;
  if _state = 'SENT' and t.state = 'PENDING' and (
       substr(p->>'dpsId', 26) <> lpad(t.dps_series, 5, '0') || lpad(t.dps_number::text, 15, '0')
       or substr(p->>'dpsId', 4, 22) <> (select coalesce(c.municipality_ibge_code,'') || '2' || lpad(regexp_replace(coalesce(c.cnpj,''),'\D','','g'), 14, '0')
                                          from public.company_fiscal_settings c where c.id = t.company_settings_id)) then
    raise exception 'NFSE_DPS_NUMBER_MISMATCH' using errcode = '22023'; end if;

  update public.nfse_transmissions set
    state = _state, outcome = _outcome,
    dps_id = coalesce(dps_id, p->>'dpsId'), dps_xml_sha256 = coalesce(dps_xml_sha256, p->>'dpsXmlSha256'),
    http_status = coalesce((p->>'httpStatus')::int, http_status),
    access_key = coalesce(access_key, nullif(p->>'accessKey','')),
    nfse_number = coalesce(nullif(p->>'nfseNumber',''), nfse_number),
    processed_at = coalesce(nullif(p->>'processedAt',''), processed_at),
    nfse_xml_sha256 = coalesce(nullif(p->>'nfseXmlSha256',''), nfse_xml_sha256),
    nfse_xml_path = coalesce(nullif(p->>'nfseXmlPath',''), nfse_xml_path),
    error_code = case when p ? 'errorCode' then left(p->>'errorCode', 80) else error_code end,
    errors = case when jsonb_typeof(p->'errors') = 'array' then p->'errors' else errors end,
    verification = case when jsonb_typeof(p->'verification') = 'array' then p->'verification' else verification end,
    updated_at = now()
  where id = t.id returning * into t;

  if _outcome = 'AUTHORIZED' then
    if t.access_key is null then raise exception 'NFSE_ACCESS_KEY_REQUIRED' using errcode = '22023'; end if;
    update public.fiscal_invoices set status = 'ISSUED', access_key = t.access_key, provider = 'NFSE_NACIONAL', provider_reference = t.access_key,
           invoice_number = coalesce(t.nfse_number, invoice_number), series = t.dps_series, authorized_at = now(),
           provider_status_raw = 'SEFIN_NACIONAL_NFSE_GERADA'
     where id = t.fiscal_invoice_id and normalized_status = 'DRAFT';
    if not found then raise exception 'NFSE_INVOICE_STATE_CHANGED' using errcode = 'PT409'; end if;
  end if;
  return to_jsonb(t);
end $$;

revoke all on function public.rpc_nfse_transmit_begin_v1(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_nfse_transmit_record_v1(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_nfse_transmit_begin_v1(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.rpc_nfse_transmit_record_v1(uuid, text, text, jsonb) to service_role;
