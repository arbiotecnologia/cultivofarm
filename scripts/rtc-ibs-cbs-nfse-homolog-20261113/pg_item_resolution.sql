-- Stubs mínimos (dados fictícios); prova só a lógica do resolvedor, não RLS/JWT.
create schema if not exists platform_private;
create role anon; create role authenticated;
create table public.product_fiscal_profiles(product_id uuid, is_active bool, ibs_cbs_configuration jsonb default '{}');
create table public.microrganismos(id uuid primary key, product_id uuid, owner_organization_id uuid);
create table public.microorganism_fiscal_profiles(microorganism_id uuid, is_active bool);
ALTER TABLE public.microorganism_fiscal_profiles ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Resolve no servidor o IBS/CBS do item NF-e (perfil do produto e/ou do microrganismo comercializável
-- ligado ao produto). Divergência entre perfis falha fechado; ausência -> NULL (payload inalterado).
CREATE OR REPLACE FUNCTION platform_private.fiscal_nfe_item_ibs_cbs_config_v1(p_type text, p_source uuid, p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $f$
DECLARE v_prod jsonb; v_micro jsonb; v_n int;
BEGIN
  IF p_source IS NULL THEN RETURN NULL; END IF;
  IF upper(coalesce(p_type,'')) IN ('MICROORGANISM','MICROORGANISMO','MICRORGANISMO') THEN
    SELECT nullif(f.ibs_cbs_configuration,'{}'::jsonb) INTO v_micro
      FROM public.microorganism_fiscal_profiles f JOIN public.microrganismos m ON m.id = f.microorganism_id
     WHERE f.microorganism_id = p_source AND f.is_active AND (m.owner_organization_id IS NULL OR m.owner_organization_id = p_org);
    RETURN v_micro;
  END IF;
  SELECT nullif(pf.ibs_cbs_configuration,'{}'::jsonb) INTO v_prod
    FROM public.product_fiscal_profiles pf WHERE pf.product_id = p_source AND pf.is_active LIMIT 1;
  SELECT count(DISTINCT f.ibs_cbs_configuration), min(f.ibs_cbs_configuration::text)::jsonb INTO v_n, v_micro
    FROM public.microorganism_fiscal_profiles f JOIN public.microrganismos m ON m.id = f.microorganism_id
   WHERE m.product_id = p_source AND f.is_active AND f.ibs_cbs_configuration <> '{}'::jsonb
     AND (m.owner_organization_id IS NULL OR m.owner_organization_id = p_org);
  IF v_n > 1 OR (v_n = 1 AND v_prod IS NOT NULL AND v_prod <> v_micro) THEN
    RAISE EXCEPTION 'FISCAL_IBS_CBS_PROFILE_CONFLICT: perfis IBS/CBS divergentes para o item %', p_source USING ERRCODE = '22023';
  END IF;
  RETURN coalesce(v_prod, CASE WHEN v_n = 1 THEN v_micro END);
END $f$;
REVOKE ALL ON FUNCTION platform_private.fiscal_nfe_item_ibs_cbs_config_v1(text,uuid,uuid) FROM PUBLIC, anon, authenticated;


\set A '00000000-0000-4000-8000-0000000000a1'
\set B '00000000-0000-4000-8000-0000000000b2'
\set P1 '00000000-0000-4000-8000-000000000101'
\set P2 '00000000-0000-4000-8000-000000000102'
\set P3 '00000000-0000-4000-8000-000000000103'
\set M1 '00000000-0000-4000-8000-000000000201'
\set M2 '00000000-0000-4000-8000-000000000202'
\set M3 '00000000-0000-4000-8000-000000000203'
insert into product_fiscal_profiles values (:'P1',true,'{"cst_ibs_cbs":"000","c":"X"}'),(:'P2',true,'{}'),(:'P3',true,'{"cst_ibs_cbs":"000","c":"X"}');
insert into microrganismos values (:'M1',:'P2',:'A'),(:'M2',:'P3',:'A'),(:'M3',:'P2',:'B');
insert into microorganism_fiscal_profiles values (:'M1',true,'{"cst_ibs_cbs":"410","c":"M"}'),(:'M2',true,'{"cst_ibs_cbs":"410","c":"DIFF"}'),(:'M3',true,'{"cst_ibs_cbs":"000","c":"OUTRA"}');
do $t$ declare r jsonb; ok bool;
begin
  r := platform_private.fiscal_nfe_item_ibs_cbs_config_v1('PRODUCT','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-0000000000a1');
  assert r->>'c'='X', 'produto: usa perfil do produto'; raise notice 'PASS produto';
  r := platform_private.fiscal_nfe_item_ibs_cbs_config_v1('PRODUCT','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-0000000000a1');
  assert r->>'c'='M', 'micro ligado ao produto (mesma empresa), outra empresa ignorada'; raise notice 'PASS micro comercializavel via produto';
  r := platform_private.fiscal_nfe_item_ibs_cbs_config_v1('MICROORGANISM','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-0000000000a1');
  assert r->>'c'='M'; raise notice 'PASS item direto de microrganismo';
  r := platform_private.fiscal_nfe_item_ibs_cbs_config_v1('MICROORGANISM','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-0000000000b2');
  assert r is null, 'micro de outra empresa nao vaza'; raise notice 'PASS isolamento entre empresas';
  r := platform_private.fiscal_nfe_item_ibs_cbs_config_v1('PRODUCT','00000000-0000-4000-8000-000000000999','00000000-0000-4000-8000-0000000000a1');
  assert r is null; raise notice 'PASS ausencia -> NULL (payload inalterado)';
  ok := false;
  begin perform platform_private.fiscal_nfe_item_ibs_cbs_config_v1('PRODUCT','00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-0000000000a1');
  exception when sqlstate '22023' then ok := true; end;
  assert ok, 'divergencia produto x micro bloqueia'; raise notice 'PASS divergencia bloqueia';
  assert platform_private.fiscal_nfe_item_ibs_cbs_config_v1('PRODUCT','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-0000000000a1')
       = platform_private.fiscal_nfe_item_ibs_cbs_config_v1('PRODUCT','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-0000000000a1');
  raise notice 'PASS deterministico';
end $t$;
