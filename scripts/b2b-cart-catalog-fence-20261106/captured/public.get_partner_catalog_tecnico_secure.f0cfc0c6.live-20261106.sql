CREATE OR REPLACE FUNCTION public.get_partner_catalog_tecnico_secure()
 RETURNS TABLE(item_id uuid, item_tipo text, nome text, codigo text, descricao_curta text, tipo text, nome_cientifico text, funcao text, dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, preco_tabela_dose numeric, preco_tabela_litro numeric, preco_tabela_ha numeric, unidade_preco_principal text, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_visibility_scope uuid[];
  v_uid uuid := auth.uid();
  v_super boolean; v_is_tec boolean; v_is_partner boolean; v_is_internal boolean;
  v_partner uuid; v_show_fin boolean := false; s record; r record;
  v_pid uuid; v_mid uuid; j_ha jsonb; j_li jsonb; j_do jsonb;
  n_ha numeric; n_li numeric; n_do numeric;
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

  v_visibility_scope := platform_private.c1b_catalog_visibility_scope(v_partner);
  FOR r IN
    SELECT p.id, 'produto'::text AS itipo, p.nome, p.codigo, p.tipo::text AS ptipo,
           NULL::text AS nome_cientifico, p.funcao_completa AS funcao, p.dose_ml_ha,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado AS beneficios, p.descricao
      FROM public.produtos p JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND p.b2b_enabled = true AND p.owner_organization_id = platform_private.catalog_tenant_seller(v_partner) AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id=ANY(v_visibility_scope) AND cv.entity_type='produto' AND cv.hidden IS TRUE AND cv.produto_id=p.id) AND ptp.status_validacao = 'aprovado'
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.tipo::text,
           m.nome_cientifico, m.funcao_agronomica, m.dose_ml_ha,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b, mtp.beneficios_agronomicos, m.descricao
      FROM public.microrganismos m JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND m.b2b_enabled = true AND m.owner_organization_id = platform_private.catalog_tenant_seller(v_partner) AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id=ANY(v_visibility_scope) AND cv.entity_type='microrganismo' AND cv.hidden IS TRUE AND cv.microrganismo_id=m.id) AND mtp.status_validacao = 'aprovado'
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
$function$
