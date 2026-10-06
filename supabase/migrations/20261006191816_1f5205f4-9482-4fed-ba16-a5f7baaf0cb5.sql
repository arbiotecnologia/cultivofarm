-- Rollback: recriar as definições anteriores a partir de 20261006190720 (forward-fix preferível).
CREATE SCHEMA IF NOT EXISTS platform_private;

CREATE OR REPLACE FUNCTION platform_private.b2b_actor_scope(_uid uuid)
RETURNS TABLE(profile_ok boolean, org_partner uuid, user_partner uuid, user_partner_count int, partner_valid boolean, has_catalog boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH pr AS (
    SELECT o.partner_account_id
      FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
     WHERE p.user_id = _uid AND p.ativo = true AND o.ativo = true AND o.status = 'ativa'
     LIMIT 1
  ), pu AS (
    SELECT count(*)::int c, min(partner_id::text)::uuid pid FROM public.partner_users WHERE user_id = _uid
  )
  SELECT EXISTS (SELECT 1 FROM pr),
         (SELECT partner_account_id FROM pr),
         (SELECT pid FROM pu), (SELECT c FROM pu),
         EXISTS (SELECT 1 FROM pr JOIN public.partner_accounts pa ON pa.id = pr.partner_account_id
                  WHERE pa.ativo = true AND pa.deleted_at IS NULL),
         EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos');
$$;
REVOKE ALL ON FUNCTION platform_private.b2b_actor_scope(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_actor_scope(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.can_view_catalog_internal(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _uid IS NOT NULL
     AND (auth.uid() IS NULL AND current_user IN ('service_role','postgres') OR _uid = auth.uid())
     AND (
       public.is_platform_superadmin(_uid)
       OR (
         EXISTS (SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
                  WHERE p.user_id = _uid AND p.ativo = true AND o.ativo = true AND o.status = 'ativa')
         AND (public.has_role(_uid,'administrador') OR public.has_role(_uid,'gestor')
           OR public.has_role(_uid,'consultor_tecnico') OR public.has_role(_uid,'tecnico_agronomo')
           OR public.has_role(_uid,'gestor_comercial') OR public.has_role(_uid,'operador_onfarm')
           OR public.has_role(_uid,'producao') OR public.has_role(_uid,'administrativo')
           OR public.has_role(_uid,'financeiro'))
         AND EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos')
       )
     );
$$;
REVOKE ALL ON FUNCTION public.can_view_catalog_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_catalog_internal(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
RETURNS TABLE(item_id uuid, item_tipo text, product_id uuid, produto_nome text, produto_codigo text, descricao_curta text, preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric, produto_ativo boolean, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, unidade_preco_principal text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_super boolean; s record; r record;
  v_pid uuid; v_mid uuid; j_ha jsonb; j_li jsonb; j_do jsonb;
  n_ha numeric; n_li numeric; n_do numeric; v_base numeric; v_unid text;
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

  FOR r IN
    SELECT p.id, 'produto'::text AS tipo, p.nome, p.codigo, p.ativo,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado AS beneficios
      FROM public.produtos p LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND p.b2b_enabled = true
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.ativo,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b, mtp.beneficios_agronomicos
      FROM public.microrganismos m LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND m.b2b_enabled = true
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
REVOKE ALL ON FUNCTION public.get_partner_catalog_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_partner_catalog_tecnico_secure()
RETURNS TABLE(item_id uuid, item_tipo text, nome text, codigo text, descricao_curta text, tipo text, nome_cientifico text, funcao text, dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, preco_tabela_dose numeric, preco_tabela_litro numeric, preco_tabela_ha numeric, unidade_preco_principal text, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
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

  FOR r IN
    SELECT p.id, 'produto'::text AS itipo, p.nome, p.codigo, p.tipo::text AS ptipo,
           NULL::text AS nome_cientifico, p.funcao_completa AS funcao, p.dose_ml_ha,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado AS beneficios, p.descricao
      FROM public.produtos p JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND p.b2b_enabled = true AND ptp.status_validacao = 'aprovado'
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.tipo::text,
           m.nome_cientifico, m.funcao_agronomica, m.dose_ml_ha,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b, mtp.beneficios_agronomicos, m.descricao
      FROM public.microrganismos m JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND m.b2b_enabled = true AND mtp.status_validacao = 'aprovado'
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
REVOKE ALL ON FUNCTION public.get_partner_catalog_tecnico_secure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_tecnico_secure() TO authenticated, service_role;

-- Resolvedor de preço-base: somente uso interno (único chamador é get_partner_catalog_secure, SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.fn_b2b_resolve_base_unit_price(uuid, uuid, uuid, text, numeric, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_resolve_base_unit_price(uuid, uuid, uuid, text, numeric, date) TO service_role;