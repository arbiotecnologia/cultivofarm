-- C2_INTERNAL_ORDER_ENTRY_V1 catalogue: only the partner gate changes; visibility, prices, sheets, V2 wrapper untouched.
CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
 RETURNS TABLE(item_id uuid, item_tipo text, product_id uuid, produto_nome text, produto_codigo text, descricao_curta text, preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric, produto_ativo boolean, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, unidade_preco_principal text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_visibility_scope uuid[];
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
    IF (NOT s.profile_ok OR s.org_partner IS DISTINCT FROM p_partner_id OR NOT s.partner_valid)
       AND NOT (platform_private.b2b_internal_commercial_actor()
                AND platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NULL) THEN
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

  v_visibility_scope := platform_private.c1b_catalog_visibility_scope(p_partner_id);
  FOR r IN
    SELECT p.id, 'produto'::text AS tipo, p.nome, p.codigo, p.ativo,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado AS beneficios
      FROM public.produtos p LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND p.b2b_enabled = true AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id=ANY(v_visibility_scope) AND cv.entity_type='produto' AND cv.hidden IS TRUE AND cv.produto_id=p.id)
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.ativo,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b, mtp.beneficios_agronomicos
      FROM public.microrganismos m LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND m.b2b_enabled = true AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id=ANY(v_visibility_scope) AND cv.entity_type='microrganismo' AND cv.hidden IS TRUE AND cv.microrganismo_id=m.id)
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
$function$
;
ALTER FUNCTION public.get_partner_catalog_secure(uuid) OWNER TO postgres;
