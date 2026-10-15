-- =====================================================================================
-- CANDIDATO 03 — NÃO APLICAR sem revisão independente. Requer 01 e 02. Gate continua OFF.
-- Recorte: (a) helpers SA de apresentações (parent/row/assert/preview) usados por change_global_volume,
-- create_global_volume_core e leitores de volume — privados ficam indisponíveis ANTES de qualquer leitura,
-- preview/token ou replay; (b) catálogos B2B (parceiro e técnico) por fornecedor comercial real.
-- "Antes" = md5 real lido no canônico em 15/10/2026; "depois" = corpo completo; diferenças em `-- [OWNER]`.
-- Não altera ACL: fn_b2b_resolve_base_unit_price, fn_resolve_commercial_price, rpc_commercial_simulator
-- seguem sem EXECUTE para anon/authenticated (confirmado pela revisão).
-- =====================================================================================

DO $$
DECLARE r record;
BEGIN
  IF to_regprocedure('platform_private.catalog_item_in_reader_scope(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'b2b_preflight_02_missing'; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('platform_private.catalog_volume_parent(text,uuid,boolean)','08f9568dd0b9527fcb661188eded1dde'),
    ('platform_private.catalog_volume_row(uuid)','892e124ebaac8203728ce8573ac0279b'),
    ('platform_private.catalog_volume_assert_row(uuid,text,uuid)','ad3752e8f8ac664eefadd409b67ef90a'),
    ('platform_private.catalog_volume_preview_token(uuid,text,uuid,jsonb,text,timestamp with time zone,text,uuid,jsonb)','2eaad379952d685d3b02eab8c3d4dc15'),
    ('platform_private.b2b_commercial_context()','02158d4204dea67308558f649113ba6d'),
    ('public.get_partner_catalog_secure(uuid)','4c8798e1567434a25b3fa9c9052f8759'),
    ('public.get_partner_catalog_tecnico_secure()','f1b68ffa8664b2655225eb298140860b')) v(fn,h) LOOP
    IF to_regprocedure(r.fn) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.fn))) <> r.h THEN
      RAISE EXCEPTION 'b2b_preflight_definition_drift: %', r.fn; END IF;
  END LOOP;
END $$;

-- ============================================================ (a) helpers SA de apresentações: só globais
CREATE OR REPLACE FUNCTION platform_private.catalog_volume_parent(p_tipo text, p_id uuid, p_lock boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  IF p_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('produto','microrganismo') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  IF p_tipo='produto' THEN
    IF p_lock THEN SELECT pg_catalog.to_jsonb(x) INTO v FROM public.produtos x WHERE x.id=p_id AND x.owner_organization_id IS NULL FOR UPDATE; -- [OWNER]
    ELSE SELECT pg_catalog.to_jsonb(x) INTO v FROM public.produtos x WHERE x.id=p_id AND x.owner_organization_id IS NULL; END IF; -- [OWNER]
  ELSE
    IF p_lock THEN SELECT pg_catalog.to_jsonb(x) INTO v FROM public.microrganismos x WHERE x.id=p_id AND x.owner_organization_id IS NULL FOR UPDATE; -- [OWNER]
    ELSE SELECT pg_catalog.to_jsonb(x) INTO v FROM public.microrganismos x WHERE x.id=p_id AND x.owner_organization_id IS NULL; END IF; -- [OWNER]
  END IF;
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.catalog_volume_row(p_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT pg_catalog.jsonb_build_object('id',v.id,'item_tipo',v.item_tipo,'item_id',COALESCE(v.produto_id,v.microrganismo_id),
    'volume_ml',v.volume_ml::text,'rotulo',v.rotulo,'preco_brl',v.preco_brl::text,'moeda',v.moeda,'ativo',v.ativo,'ordem',v.ordem,
    'preco_litro_brl',v.preco_litro_brl::text,'valor_dose_100ml_brl',v.valor_dose_100ml_brl::text,'doses_por_volume',v.doses_por_volume::text,
    'updated_at',v.updated_at)
  FROM public.catalogo_volumes v WHERE v.id=p_id AND v.owner_organization_id IS NULL; -- [OWNER]
$function$;

CREATE OR REPLACE FUNCTION platform_private.catalog_volume_assert_row(p_id uuid, p_tipo text, p_item uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE r public.catalogo_volumes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.catalogo_volumes WHERE id=p_id AND owner_organization_id IS NULL; -- [OWNER]
  IF NOT FOUND OR r.item_tipo IS DISTINCT FROM p_tipo OR COALESCE(r.produto_id,r.microrganismo_id) IS DISTINCT FROM p_item
    OR r.moeda IS DISTINCT FROM 'BRL'
    OR r.preco_litro_brl IS DISTINCT FROM pg_catalog.round(r.preco_brl/(r.volume_ml/1000.0),2)
    OR r.valor_dose_100ml_brl IS DISTINCT FROM pg_catalog.round(r.preco_litro_brl/10.0,2)
    OR r.doses_por_volume IS DISTINCT FROM pg_catalog.round(r.volume_ml/100.0,4) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_confirmation_failed'; END IF;
  IF r.ativo AND EXISTS (SELECT 1 FROM public.catalogo_volumes o WHERE o.id<>r.id AND o.ativo AND o.volume_ml=r.volume_ml
      AND o.item_tipo=r.item_tipo AND o.produto_id IS NOT DISTINCT FROM r.produto_id AND o.microrganismo_id IS NOT DISTINCT FROM r.microrganismo_id
      AND o.owner_organization_id IS NULL) THEN -- [OWNER]
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='catalog_volume_duplicate'; END IF;
END;
$function$;

-- Token de preview: irmãos privados nunca entram no hash (não há irmão privado de pai global pelo trigger
-- descendente; o filtro é defesa explícita).
CREATE OR REPLACE FUNCTION platform_private.catalog_volume_preview_token(p_actor uuid, p_operation text, p_id uuid, p_change jsonb, p_reason text, p_row_version timestamp with time zone, p_tipo text, p_item uuid, p_parent jsonb)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'v',1,'actor',p_actor,'operation',p_operation,'id',p_id,'change',p_change,'reason',pg_catalog.btrim(p_reason),
    'row_version',p_row_version,'parent',p_parent,
    'siblings',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.id,o.updated_at,o.ativo,o.volume_ml::text,o.preco_brl::text)
        ORDER BY o.id),'[]'::jsonb)
      FROM public.catalogo_volumes o WHERE o.item_tipo=p_tipo AND COALESCE(o.produto_id,o.microrganismo_id)=p_item AND o.id<>p_id
        AND o.owner_organization_id IS NULL) -- [OWNER]
  )::text,'UTF8')),'hex');
$function$;

-- ============================================================ (b) B2B: fornecedor comercial real
-- Fornecedor = partner_accounts.commercial_owner_organization_id do parceiro JÁ autorizado pelo leitor (nunca
-- organização vinda do cliente). Parceiro: deve coincidir com b2b_commercial_context(). Interno (admin/
-- gestor_comercial): somente se a empresa do ator for o próprio fornecedor. SA: NULL (somente global).
CREATE FUNCTION platform_private.catalog_b2b_supplier_org(p_partner_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid := auth.uid(); v_owner uuid; v_ctx jsonb;
BEGIN
  IF v_uid IS NULL OR p_partner_id IS NULL OR public.is_platform_superadmin(v_uid) THEN RETURN NULL; END IF;
  SELECT pa.commercial_owner_organization_id INTO v_owner FROM public.partner_accounts pa
   WHERE pa.id=p_partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF public.has_role(v_uid,'parceiro_b2b'::public.app_role) OR public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) THEN
    v_ctx := platform_private.b2b_commercial_context();
    IF v_ctx IS NULL OR (v_ctx->>'partner_id')::uuid IS DISTINCT FROM p_partner_id
       OR (v_ctx->>'commercial_owner_organization_id')::uuid IS DISTINCT FROM v_owner THEN RETURN NULL; END IF;
    RETURN v_owner;
  END IF;
  IF platform_private.catalog_reader_org() IS NOT DISTINCT FROM v_owner THEN RETURN v_owner; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_b2b_supplier_org(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
 RETURNS TABLE(item_id uuid, item_tipo text, product_id uuid, produto_nome text, produto_codigo text, descricao_curta text, preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric, produto_ativo boolean, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, unidade_preco_principal text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_super boolean; s record; r record;
  v_pid uuid; v_mid uuid; j_ha jsonb; j_li jsonb; j_do jsonb;
  n_ha numeric; n_li numeric; n_do numeric; v_base numeric; v_unid text;
  v_supplier uuid; -- [OWNER]
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF p_partner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_accounts pa
       WHERE pa.id = p_partner_id AND pa.ativo = true AND pa.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501';
  END IF;
  v_super := public.is_platform_superadmin(v_uid);
  IF NOT v_super THEN
    IF public.has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN
      RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501';
    END IF;
    SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
    IF NOT s.profile_ok OR s.org_partner IS DISTINCT FROM p_partner_id OR NOT s.partner_valid THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
    END IF;
    IF public.has_role(v_uid,'parceiro_b2b'::app_role) THEN
      IF s.user_partner_count <> 1 OR s.user_partner IS DISTINCT FROM p_partner_id THEN
        RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
      END IF;
    ELSIF NOT (public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor_comercial'::app_role)) THEN
      RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
    END IF;
    IF NOT s.has_catalog THEN RAISE EXCEPTION 'feature_not_entitled' USING ERRCODE='42501'; END IF;
  END IF;
  v_supplier := platform_private.catalog_b2b_supplier_org(p_partner_id); -- [OWNER] NULL => só global

  FOR r IN
    SELECT p.id, 'produto'::text AS tipo, p.nome, p.codigo, p.ativo,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado AS beneficios
      FROM public.produtos p LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND p.b2b_enabled = true
       AND (p.owner_organization_id IS NULL OR p.owner_organization_id = v_supplier) -- [OWNER]
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.ativo,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b, mtp.beneficios_agronomicos
      FROM public.microrganismos m LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND m.b2b_enabled = true
       AND (m.owner_organization_id IS NULL OR m.owner_organization_id = v_supplier) -- [OWNER]
  LOOP
    v_pid := CASE WHEN r.tipo='produto' THEN r.id END;
    v_mid := CASE WHEN r.tipo='microrganismo' THEN r.id END;
    j_ha := public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, 'hectare', NULL, current_date);
    j_li := public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, 'litro',   NULL, current_date);
    j_do := public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, 'dose',    NULL, current_date);
    n_ha := CASE WHEN COALESCE((j_ha->>'ok')::boolean,false) THEN NULLIF((j_ha->>'base_price')::numeric,0) END;
    n_li := CASE WHEN COALESCE((j_li->>'ok')::boolean,false) THEN NULLIF((j_li->>'base_price')::numeric,0) END;
    n_do := CASE WHEN COALESCE((j_do->>'ok')::boolean,false) THEN NULLIF((j_do->>'base_price')::numeric,0) END;
    v_unid := CASE WHEN n_ha IS NOT NULL THEN 'hectare' WHEN n_li IS NOT NULL THEN 'litro'
                   WHEN n_do IS NOT NULL THEN 'dose_100ml' ELSE 'sob_consulta' END;
    v_base := COALESCE(n_ha, n_li, n_do);
    item_id := r.id; item_tipo := r.tipo; product_id := v_pid;
    produto_nome := r.nome; produto_codigo := r.codigo;
    descricao_curta := CASE WHEN r.status_validacao='aprovado' THEN LEFT(COALESCE(r.resumo_curto,''),220) END;
    preco_tabela := ROUND(v_base,2);
    desconto_percentual := CASE WHEN v_base IS NOT NULL THEN 0::numeric END;
    preco_parceiro := ROUND(v_base,2);
    produto_ativo := r.ativo;
    resumo_curto := CASE WHEN r.status_validacao='aprovado' THEN r.resumo_curto END;
    explicacao_b2b := CASE WHEN r.status_validacao='aprovado' THEN r.explicacao_b2b END;
    beneficios_principais := CASE WHEN r.status_validacao='aprovado' THEN r.beneficios END;
    ficha_status := COALESCE(r.status_validacao,'sem_ficha');
    ficha_aprovada := (r.status_validacao = 'aprovado');
    valor_dose_brl := ROUND(n_do,2); valor_litro_brl := ROUND(n_li,2); valor_ha_brl := ROUND(n_ha,2);
    unidade_preco_principal := v_unid;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_partner_catalog_tecnico_secure()
 RETURNS TABLE(item_id uuid, item_tipo text, nome text, codigo text, descricao_curta text, tipo text, nome_cientifico text, funcao text, dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, preco_tabela_dose numeric, preco_tabela_litro numeric, preco_tabela_ha numeric, unidade_preco_principal text, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_super boolean; v_is_tec boolean; v_is_partner boolean; v_is_internal boolean;
  v_partner uuid; v_show_fin boolean := false; s record; r record;
  v_pid uuid; v_mid uuid; j_ha jsonb; j_li jsonb; j_do jsonb;
  n_ha numeric; n_li numeric; n_do numeric;
  v_supplier uuid; -- [OWNER]
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  v_super := public.is_platform_superadmin(v_uid);
  v_is_tec := public.has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_is_partner := public.has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_internal := public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor_comercial'::app_role);

  IF NOT v_super THEN
    IF NOT (v_is_tec OR v_is_partner OR v_is_internal) THEN
      RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
    END IF;
    SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
    IF NOT s.profile_ok THEN RAISE EXCEPTION 'inactive_scope' USING ERRCODE='42501'; END IF;
    IF v_is_tec OR v_is_partner THEN
      IF s.user_partner_count <> 1 OR s.org_partner IS NULL OR s.user_partner IS DISTINCT FROM s.org_partner
         OR NOT s.partner_valid THEN
        RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501';
      END IF;
      v_partner := s.org_partner;
      v_show_fin := v_is_partner AND NOT v_is_tec;
    END IF;
    IF NOT s.has_catalog THEN RAISE EXCEPTION 'feature_not_entitled' USING ERRCODE='42501'; END IF;
  END IF;
  -- [OWNER] parceiro: fornecedor do vínculo; interno: a própria empresa; SA: só global.
  v_supplier := CASE WHEN v_super THEN NULL
                     WHEN v_partner IS NOT NULL THEN platform_private.catalog_b2b_supplier_org(v_partner)
                     ELSE platform_private.catalog_reader_org() END;

  FOR r IN
    SELECT p.id, 'produto'::text AS itipo, p.nome, p.codigo, p.tipo::text AS ptipo,
           NULL::text AS nome_cientifico, p.funcao_completa AS funcao, p.dose_ml_ha,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado AS beneficios, p.descricao
      FROM public.produtos p JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND p.b2b_enabled = true AND ptp.status_validacao = 'aprovado'
       AND (p.owner_organization_id IS NULL OR p.owner_organization_id = v_supplier) -- [OWNER]
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.tipo::text,
           m.nome_cientifico, m.funcao_agronomica, m.dose_ml_ha,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b, mtp.beneficios_agronomicos, m.descricao
      FROM public.microrganismos m JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND m.b2b_enabled = true AND mtp.status_validacao = 'aprovado'
       AND (m.owner_organization_id IS NULL OR m.owner_organization_id = v_supplier) -- [OWNER]
  LOOP
    n_ha := NULL; n_li := NULL; n_do := NULL;
    IF v_show_fin THEN
      v_pid := CASE WHEN r.itipo='produto' THEN r.id END;
      v_mid := CASE WHEN r.itipo='microrganismo' THEN r.id END;
      j_ha := public.fn_resolve_commercial_price('partner', v_partner, NULL, NULL, v_pid, v_mid, 'hectare', NULL, current_date);
      j_li := public.fn_resolve_commercial_price('partner', v_partner, NULL, NULL, v_pid, v_mid, 'litro',   NULL, current_date);
      j_do := public.fn_resolve_commercial_price('partner', v_partner, NULL, NULL, v_pid, v_mid, 'dose',    NULL, current_date);
      n_ha := CASE WHEN COALESCE((j_ha->>'ok')::boolean,false) AND NOT COALESCE((j_ha->>'quote_required')::boolean,false) THEN NULLIF((j_ha->>'final_unit_price')::numeric,0) END;
      n_li := CASE WHEN COALESCE((j_li->>'ok')::boolean,false) AND NOT COALESCE((j_li->>'quote_required')::boolean,false) THEN NULLIF((j_li->>'final_unit_price')::numeric,0) END;
      n_do := CASE WHEN COALESCE((j_do->>'ok')::boolean,false) AND NOT COALESCE((j_do->>'quote_required')::boolean,false) THEN NULLIF((j_do->>'final_unit_price')::numeric,0) END;
    END IF;
    item_id := r.id; item_tipo := r.itipo; nome := r.nome; codigo := r.codigo;
    descricao_curta := COALESCE(r.resumo_curto, r.descricao);
    tipo := r.ptipo; nome_cientifico := r.nome_cientifico; funcao := r.funcao; dose_ml_ha := r.dose_ml_ha;
    valor_dose_brl := ROUND(n_do,2); valor_litro_brl := ROUND(n_li,2); valor_ha_brl := ROUND(n_ha,2);
    preco_tabela_dose := ROUND(n_do,2); preco_tabela_litro := ROUND(n_li,2); preco_tabela_ha := ROUND(n_ha,2);
    unidade_preco_principal := CASE WHEN n_ha IS NOT NULL THEN 'hectare' WHEN n_li IS NOT NULL THEN 'litro'
                                    WHEN n_do IS NOT NULL THEN 'dose_100ml' ELSE 'sob_consulta' END;
    resumo_curto := r.resumo_curto; explicacao_b2b := r.explicacao_b2b; beneficios_principais := r.beneficios;
    ficha_status := r.status_validacao; ficha_aprovada := true;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- Pós: marcador nas 6 funções alteradas do manifesto; ACL dos dois leitores B2B preservada (authenticated).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'platform_private.catalog_volume_parent(text,uuid,boolean)','platform_private.catalog_volume_row(uuid)',
    'platform_private.catalog_volume_assert_row(uuid,text,uuid)',
    'platform_private.catalog_volume_preview_token(uuid,text,uuid,jsonb,text,timestamp with time zone,text,uuid,jsonb)',
    'public.get_partner_catalog_secure(uuid)','public.get_partner_catalog_tecnico_secure()'] LOOP
    IF pg_get_functiondef(to_regprocedure(f)) NOT LIKE '%-- [OWNER]%' THEN RAISE EXCEPTION 'b2b_post_marker_missing: %', f; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)','EXECUTE')
     OR has_function_privilege('authenticated','public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)','EXECUTE') THEN
    RAISE EXCEPTION 'b2b_post_price_acl_reopened'; END IF;
END $$;
