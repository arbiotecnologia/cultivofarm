-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260730024842_73168e1d-e4f1-4236-a69d-1d231afb8550.sql
-- SHA-256 da origem: ae45cb4ebd492b0e1895ef67612e3fb95373ae8b6f166d40b7ad7e47084436df
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: to_regclass(marcador) -> true
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
DO $guard$
DECLARE v_ref text;
BEGIN
  IF true THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price(
  p_partner_id uuid,
  p_product_id uuid,
  p_microrganismo_id uuid,
  p_unit_type text,
  p_volume_ml numeric DEFAULT NULL,
  p_ref_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ref  date := COALESCE(p_ref_date, current_date);
  v_base numeric(18,6);
  v_src  text;
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID');
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'UNIT_INVALID');
  END IF;
  IF p_unit_type = 'unidade' AND COALESCE(p_volume_ml, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'VOLUME_REQUIRED');
  END IF;

  IF p_partner_id IS NOT NULL THEN
    SELECT ppp.preco_tabela INTO v_base
    FROM public.partner_product_prices ppp
    WHERE ppp.partner_id = p_partner_id
      AND ppp.ativo
      AND ppp.product_id IS NOT DISTINCT FROM p_product_id
      AND ppp.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
      AND (ppp.valid_from IS NULL OR ppp.valid_from <= v_ref)
      AND (ppp.valid_until IS NULL OR ppp.valid_until >= v_ref)
    ORDER BY ppp.is_current DESC, ppp.valid_from DESC NULLS LAST
    LIMIT 1;
    IF COALESCE(v_base, 0) > 0 THEN v_src := 'partner_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  IF v_base IS NULL THEN
    IF p_product_id IS NOT NULL THEN
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN COALESCE(NULLIF(pr.valor_ha_brl,0), (pr.dose_ml_ha/100.0) * pr.valor_dose_brl)
               WHEN 'litro'   THEN COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(pr.valor_dose_brl,0), pr.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.produtos pr WHERE pr.id = p_product_id;
    ELSE
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN (mo.dose_ml_ha/100.0) * mo.valor_dose_brl
               WHEN 'litro'   THEN COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(mo.valor_dose_brl,0), mo.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
    END IF;
    IF COALESCE(v_base, 0) > 0 THEN v_src := 'catalog_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  IF v_base IS NULL OR v_base <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_WITHOUT_PRICE');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'reason_code', 'OK',
    'price_source', v_src,
    'base_price', round(v_base, 2),
    'currency', 'BRL',
    'resolved_at', now()
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date) FROM anon;
REVOKE ALL ON FUNCTION public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
 RETURNS TABLE(item_id uuid, item_tipo text, product_id uuid, produto_nome text, produto_codigo text, descricao_curta text, preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric, produto_ativo boolean, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, unidade_preco_principal text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  r record;
  v_pid uuid; v_mid uuid;
  j_ha jsonb; j_li jsonb; j_do jsonb;
  n_ha numeric; n_li numeric; n_do numeric;
  v_base numeric; v_unid text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  v_is_admin := has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role);
  v_user_partner := public.get_user_partner_id();

  -- Tecnico do parceiro nunca acessa o catalogo financeiro.
  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden_financial_terms';
  END IF;

  IF NOT v_is_admin AND (NOT has_role(v_uid,'parceiro_b2b'::app_role)
      OR v_user_partner IS NULL OR v_user_partner <> p_partner_id) THEN
    RAISE EXCEPTION 'forbidden_partner';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partner_accounts pa
                 WHERE pa.id = p_partner_id AND pa.ativo = true) THEN
    RAISE EXCEPTION 'partner_not_found';
  END IF;

  FOR r IN
    SELECT p.id, 'produto'::text AS tipo, p.nome, p.codigo, p.ativo,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b,
           ptp.beneficio_combinado AS beneficios
      FROM public.produtos p
      LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND COALESCE(p.b2b_enabled,true) = true
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.ativo,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b,
           mtp.beneficios_agronomicos
      FROM public.microrganismos m
      LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND COALESCE(m.b2b_enabled,false) = true
  LOOP
    v_pid := CASE WHEN r.tipo='produto' THEN r.id END;
    v_mid := CASE WHEN r.tipo='microrganismo' THEN r.id END;

    -- Preco de vitrine = preco-base canonico configurado (sem plano).
    -- O desconto do plano comercial e aplicado na simulacao/pedido, nao aqui.
    j_ha := public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, 'hectare', NULL, current_date);
    j_li := public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, 'litro',   NULL, current_date);
    j_do := public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, 'dose',    NULL, current_date);

    n_ha := CASE WHEN COALESCE((j_ha->>'ok')::boolean,false) THEN NULLIF((j_ha->>'base_price')::numeric,0) END;
    n_li := CASE WHEN COALESCE((j_li->>'ok')::boolean,false) THEN NULLIF((j_li->>'base_price')::numeric,0) END;
    n_do := CASE WHEN COALESCE((j_do->>'ok')::boolean,false) THEN NULLIF((j_do->>'base_price')::numeric,0) END;

    v_unid := CASE WHEN n_ha IS NOT NULL THEN 'hectare'
                   WHEN n_li IS NOT NULL THEN 'litro'
                   WHEN n_do IS NOT NULL THEN 'dose_100ml'
                   ELSE 'sob_consulta' END;
    v_base := COALESCE(n_ha, n_li, n_do);

    item_id := r.id;
    item_tipo := r.tipo;
    product_id := v_pid;
    produto_nome := r.nome;
    produto_codigo := r.codigo;
    descricao_curta := CASE WHEN r.status_validacao='aprovado' THEN LEFT(COALESCE(r.resumo_curto,''),220) END;
    preco_tabela := ROUND(v_base, 2);
    desconto_percentual := CASE WHEN v_base IS NOT NULL THEN 0::numeric END;
    preco_parceiro := ROUND(v_base, 2);
    produto_ativo := r.ativo;
    resumo_curto := CASE WHEN r.status_validacao='aprovado' THEN r.resumo_curto END;
    explicacao_b2b := CASE WHEN r.status_validacao='aprovado' THEN r.explicacao_b2b END;
    beneficios_principais := CASE WHEN r.status_validacao='aprovado' THEN r.beneficios END;
    ficha_status := COALESCE(r.status_validacao,'sem_ficha');
    ficha_aprovada := (r.status_validacao = 'aprovado');
    valor_dose_brl := ROUND(n_do, 2);
    valor_litro_brl := ROUND(n_li, 2);
    valor_ha_brl := ROUND(n_ha, 2);
    unidade_preco_principal := v_unid;
    RETURN NEXT;
  END LOOP;
END;
$function$;