-- Candidata (NÃO aplicada): complemento DPS NFS-e Nacional no perfil do serviço,
-- snapshot no faturamento e reaplicação ao MESMO rascunho NFSE HOMOLOGATION.
-- Gerada por generate.py. Aplicar somente após revisão do proprietário.
begin;

do $pre$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.rpc_service_billing_create_draft_v1(uuid[],text)'::regprocedure) <> '811e98cc47f27c802918e9731da71d5d' then
    raise exception 'PRE_DRIFT: rpc_service_billing_create_draft_v1 difere da captura';
  end if;
  if to_regclass('public.nfse_transmissions') is null then raise exception 'PRE_MISSING: nfse_transmissions'; end if;
  if to_regnamespace('platform_private') is null then raise exception 'PRE_MISSING: platform_private'; end if;
  if to_regprocedure('public.rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer)') is null then raise exception 'PRE_MISSING: rpc_fiscal_draft_save'; end if;
end $pre$;

-- 1) Validação do complemento (espelha supabase/functions/_shared/nfse/dpsProfile.ts).
create or replace function platform_private.service_nfse_dps_valid_v1(p jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare pc jsonb; fr jsonb; tt jsonb; k text;
  pct_re constant text := '^\d{1,3}(\.\d{1,2})?$';
begin
  if p is null or p = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p) <> 'object' or coalesce(p->>'v','') <> '1' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k <> all (array['v','nbs_code','service_location_ibge_code','pis_cofins','federal_retentions','tot_trib']) then return false; end if;
  end loop;
  if p ? 'nbs_code' and (jsonb_typeof(p->'nbs_code') <> 'string' or p->>'nbs_code' !~ '^\d{9}$') then return false; end if;
  if p ? 'service_location_ibge_code' and (jsonb_typeof(p->'service_location_ibge_code') <> 'string' or p->>'service_location_ibge_code' !~ '^\d{7}$') then return false; end if;
  pc := p->'pis_cofins';
  if pc is not null then
    if jsonb_typeof(pc) <> 'object' or exists (select 1 from jsonb_object_keys(pc) x where x <> all (array['cst','p_aliq_pis','p_aliq_cofins','ret_type'])) then return false; end if;
    if coalesce(pc->>'cst','') <> all (array['00','01','02','03','04','05','06','07','08','09','49','50','51','52','53','54','55','56','60','61','62','63','64','65','66','67','70','71','72','73','74','75','98','99']) then return false; end if;
    if (pc ? 'p_aliq_pis') <> (pc ? 'p_aliq_cofins') then return false; end if;
    if pc ? 'p_aliq_pis' and (jsonb_typeof(pc->'p_aliq_pis') <> 'number' or jsonb_typeof(pc->'p_aliq_cofins') <> 'number'
        or (pc->>'p_aliq_pis')::numeric not between 0 and 99.99 or (pc->>'p_aliq_cofins')::numeric not between 0 and 99.99
        or (pc->>'p_aliq_pis') !~ pct_re or (pc->>'p_aliq_cofins') !~ pct_re) then return false; end if;
    if pc ? 'ret_type' and (jsonb_typeof(pc->'ret_type') <> 'string' or pc->>'ret_type' !~ '^\d$') then return false; end if;
  end if;
  fr := p->'federal_retentions';
  if fr is not null then
    if jsonb_typeof(fr) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(fr) loop
      if k <> all (array['cp_rate','irrf_rate','csll_rate']) or jsonb_typeof(fr->k) <> 'number' or (fr->>k)::numeric not between 0 and 100 or (fr->>k) !~ pct_re then return false; end if;
    end loop;
  end if;
  tt := p->'tot_trib';
  if tt is not null then
    if jsonb_typeof(tt) <> 'object' then return false; end if;
    case tt->>'mode'
      when 'IND' then if (select count(*) from jsonb_object_keys(tt)) <> 1 then return false; end if;
      when 'PERCENT' then
        if (select count(*) from jsonb_object_keys(tt)) <> 4 then return false; end if;
        foreach k in array array['fed','est','mun'] loop
          if jsonb_typeof(tt->k) is distinct from 'number' or (tt->>k)::numeric not between 0 and 999.99 or (tt->>k) !~ pct_re then return false; end if;
        end loop;
      when 'SN' then
        if (select count(*) from jsonb_object_keys(tt)) <> 2 or jsonb_typeof(tt->'sn') is distinct from 'number'
           or (tt->>'sn')::numeric not between 0 and 99.99 or (tt->>'sn') !~ pct_re then return false; end if;
      else return false;
    end case;
  end if;
  return true;
end $$;
revoke all on function platform_private.service_nfse_dps_valid_v1(jsonb) from public, anon, authenticated;

create or replace function platform_private.trg_service_fiscal_profile_dps_check()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.federal_withholding_defaults is not null and jsonb_typeof(new.federal_withholding_defaults) <> 'object' then
    raise exception 'federal_withholding_defaults_not_object' using errcode = '22023';
  end if;
  if not platform_private.service_nfse_dps_valid_v1(new.federal_withholding_defaults->'nfse_dps') then
    raise exception 'nfse_dps_profile_invalid' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function platform_private.trg_service_fiscal_profile_dps_check() from public, anon, authenticated;
drop trigger if exists trg_service_fiscal_profile_dps_check on public.service_fiscal_profiles;
create trigger trg_service_fiscal_profile_dps_check before insert or update of federal_withholding_defaults
  on public.service_fiscal_profiles for each row execute function platform_private.trg_service_fiscal_profile_dps_check();

-- 2) Snapshot único do complemento para os serviços faturados juntos (divergência bloqueia).
create or replace function platform_private.service_nfse_dps_snapshot_v1(p_org uuid, p_services uuid[])
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_n int; v jsonb;
begin
  select count(distinct coalesce(p.federal_withholding_defaults->'nfse_dps','null'::jsonb)), min(coalesce(p.federal_withholding_defaults->'nfse_dps','null'::jsonb)::text)::jsonb
    into v_n, v
    from public.service_fiscal_profiles p
   where p.organization_id = p_org and p.is_active and p.service_id = any(p_services);
  if v_n > 1 then raise exception 'service_dps_profile_divergent' using errcode = '22023'; end if;
  if v is null or v = 'null'::jsonb then return null; end if;
  if not platform_private.service_nfse_dps_valid_v1(v) then raise exception 'nfse_dps_profile_invalid' using errcode = '22023'; end if;
  return v;
end $$;
revoke all on function platform_private.service_nfse_dps_snapshot_v1(uuid, uuid[]) from public, anon, authenticated;

-- 3) Faturamento: mesmo corpo capturado + snapshot nfse_dps no cabeçalho.
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
  v_dps jsonb;
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

  v_dps := platform_private.service_nfse_dps_snapshot_v1(v_org, (select array_agg(distinct service_id) from public.service_engagements where id = any(v_ids)));

  select case when upper(coalesce(fiscal_environment,'')) in ('HOMOLOGATION','HOMOLOGACAO') then 'HOMOLOGATION' else 'NOT_CONFIGURED' end
    into v_env from public.company_fiscal_settings where organization_id = v_org and is_active order by updated_at desc limit 1;

  v_res := public.rpc_fiscal_draft_save(null, jsonb_build_object(
      'invoice_type','NFSE','document_model','NFSE','environment', coalesce(v_env,'NOT_CONFIGURED'),
      'customer_id', v_customer, 'issue_date', current_date::text,
      'fiscal_profile_snapshot', case when v_dps is null then '{}'::jsonb else jsonb_build_object('nfse_dps', v_dps) end,
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

-- 4) Reaplicar perfil ao MESMO rascunho (sem nova nota, sem duplicidade).
create or replace function public.rpc_service_billing_reapply_profile_v1(p_invoice_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_inv public.fiscal_invoices;
  v_items jsonb := '[]'::jsonb;
  v_old_items jsonb;
  v_services uuid[];
  v_dps jsonb;
  v_header_snap jsonb;
  v_res jsonb;
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
  if p_invoice_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'invalid_arguments' using errcode = '22023'; end if;

  select * into v_inv from public.fiscal_invoices where id = p_invoice_id and organization_id = v_org for update;
  if not found or not exists (select 1 from public.service_billing_requests b where b.organization_id = v_org and b.fiscal_invoice_id = p_invoice_id) then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;
  perform public.h15_require_invoice(p_invoice_id);
  if exists (select 1 from public.nfse_transmissions t where t.fiscal_invoice_id = p_invoice_id) then
    raise exception 'invoice_already_transmitted' using errcode = 'PT409';
  end if;
  if v_inv.invoice_type <> 'NFSE' or v_inv.environment <> 'HOMOLOGATION' or v_inv.status <> 'DRAFT' or v_inv.normalized_status <> 'DRAFT'
     or v_inv.locked_at is not null or v_inv.provider <> 'NONE' or v_inv.document_origin <> 'MANUAL_RECORD' then
    raise exception 'invoice_not_reappliable' using errcode = 'PT409';
  end if;
  if v_inv.draft_version is distinct from p_expected_version then raise exception 'conflict' using errcode = 'PT409'; end if;

  select jsonb_agg(jsonb_build_object('s', i.item_sequence, 'f', i.fiscal_profile_snapshot, 't', i.tax_snapshot) order by i.item_sequence), array_agg(distinct i.source_item_id)
    into v_old_items, v_services
    from public.fiscal_invoice_items i where i.fiscal_invoice_id = p_invoice_id;

  for r in
    select i.*, p.id p_id, p.lc116_item, p.cnae, p.municipal_taxation_code, p.national_taxation_code,
           p.incidence_municipality_ibge_code, p.iss_rate, p.iss_withheld_default
      from public.fiscal_invoice_items i
      join public.catalog_services s on s.id = i.source_item_id and s.organization_id = v_org
      left join public.service_fiscal_profiles p on p.service_id = i.source_item_id and p.organization_id = v_org and p.is_active
     where i.fiscal_invoice_id = p_invoice_id and i.source_item_type = 'SERVICE'
     order by i.item_sequence
  loop
    if r.p_id is null then raise exception 'service_fiscal_profile_missing:%', r.source_item_id using errcode = 'P0002'; end if;
    -- Campos comerciais do item (descrição/quantidade/valor/unidade) são preservados como estão no rascunho.
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'item_kind', r.item_kind, 'description', r.description,
      'quantity', r.quantity, 'unit_value', r.unit_value, 'discount_value', r.discount_value,
      'commercial_unit', r.commercial_unit, 'source_item_type', r.source_item_type, 'source_item_id', r.source_item_id,
      'fiscal_profile_snapshot', jsonb_strip_nulls(jsonb_build_object('lc116_item', r.lc116_item, 'cnae', r.cnae,
          'municipal_tax_code', r.municipal_taxation_code, 'national_tax_code', r.national_taxation_code,
          'municipality_ibge_code', r.incidence_municipality_ibge_code)),
      'tax_snapshot', jsonb_strip_nulls(jsonb_build_object('iss_rate', r.iss_rate, 'iss_withheld', r.iss_withheld_default)),
      'tax_input_snapshot', coalesce(r.tax_input_snapshot, '{}'::jsonb)));
  end loop;
  if jsonb_array_length(v_items) <> jsonb_array_length(coalesce(v_old_items,'[]'::jsonb)) or jsonb_array_length(v_items) = 0 then
    raise exception 'invoice_items_not_service' using errcode = '22023';
  end if;

  v_dps := platform_private.service_nfse_dps_snapshot_v1(v_org, v_services);
  v_header_snap := (coalesce(v_inv.fiscal_profile_snapshot, '{}'::jsonb) - 'nfse_dps')
                   || case when v_dps is null then '{}'::jsonb else jsonb_build_object('nfse_dps', v_dps) end;

  -- Idempotente: sem mudança fiscal, nenhuma nova versão.
  if v_header_snap = coalesce(v_inv.fiscal_profile_snapshot, '{}'::jsonb)
     and (select jsonb_agg(jsonb_build_object('s', ord, 'f', it->'fiscal_profile_snapshot', 't', it->'tax_snapshot') order by ord)
            from jsonb_array_elements(v_items) with ordinality x(it, ord)) = v_old_items then
    return jsonb_build_object('invoice_id', p_invoice_id, 'changed', false, 'draft_version', v_inv.draft_version);
  end if;

  v_res := public.rpc_fiscal_draft_save(p_invoice_id, jsonb_build_object(
      'invoice_type', 'NFSE', 'document_model', v_inv.document_model, 'environment', 'HOMOLOGATION',
      'customer_id', v_inv.customer_id,
      'freight_value', coalesce((v_inv.fiscal_totals_snapshot->>'vFrete')::numeric, 0),
      'insurance_value', coalesce((v_inv.fiscal_totals_snapshot->>'vSeg')::numeric, 0),
      'other_value', coalesce((v_inv.fiscal_totals_snapshot->>'vOutro')::numeric, 0),
      'fiscal_profile_snapshot', v_header_snap,
      'tax_snapshot', coalesce(v_inv.tax_snapshot, '{}'::jsonb)),
    v_items, p_expected_version);
  return jsonb_build_object('invoice_id', p_invoice_id, 'changed', true, 'draft_version', v_res->'draft_version', 'total_amount', v_res->'total_amount');
end $$;
revoke all on function public.rpc_service_billing_reapply_profile_v1(uuid, integer) from public, anon;
grant execute on function public.rpc_service_billing_reapply_profile_v1(uuid, integer) to authenticated;

do $post$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.rpc_service_billing_create_draft_v1(uuid[],text)'::regprocedure) <> 'd0be511ce5c856816cef81c456bef530' then
    raise exception 'POST_MISMATCH: faturamento';
  end if;
end $post$;
commit;
