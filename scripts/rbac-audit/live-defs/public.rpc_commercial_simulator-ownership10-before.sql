CREATE OR REPLACE FUNCTION public.rpc_commercial_simulator(p_partner_id uuid, p_product_id uuid, p_quantidade numeric, p_desconto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tabela numeric; v_final numeric; v_total numeric; v_custo numeric;
  v_source text := 'base'; v_source_label text := 'Preço base';
  v_campanha_nome text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1) Campanha ativa
  SELECT c.nome INTO v_campanha_nome
    FROM public.commercial_campaigns c
    JOIN public.commercial_campaign_partners cp ON cp.campaign_id = c.id AND cp.partner_id = p_partner_id
    JOIN public.commercial_campaign_products pp ON pp.campaign_id = c.id AND pp.product_id = p_product_id
   WHERE c.ativa = true AND CURRENT_DATE BETWEEN c.data_inicio AND c.data_fim
   ORDER BY c.data_inicio DESC LIMIT 1;

  IF v_campanha_nome IS NOT NULL THEN
    SELECT COALESCE(
      ppp.preco_tabela,
      p.valor_ha_brl,
      CASE WHEN p.valor_dose_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
           THEN ROUND(p.valor_dose_brl * (p.dose_ml_ha/100.0), 2) END,
      CASE WHEN p.valor_litro_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
           THEN ROUND((p.valor_litro_brl/10.0) * (p.dose_ml_ha/100.0), 2) END,
      0
    ) INTO v_tabela
      FROM public.produtos p
      LEFT JOIN public.partner_product_prices ppp
        ON ppp.product_id = p.id AND ppp.partner_id = p_partner_id AND ppp.is_current AND ppp.ativo
     WHERE p.id = p_product_id;
    v_source := 'campanha';
    v_source_label := 'Preço aplicado pela campanha: ' || v_campanha_nome;
  ELSE
    -- 2) Tabela do parceiro
    SELECT ppp.preco_tabela INTO v_tabela
      FROM public.partner_product_prices ppp
     WHERE ppp.product_id = p_product_id AND ppp.partner_id = p_partner_id
       AND ppp.is_current AND ppp.ativo
     LIMIT 1;
    IF v_tabela IS NOT NULL THEN
      v_source := 'tabela_parceiro';
      v_source_label := 'Preço aplicado pela tabela comercial do parceiro';
    ELSE
      -- 3) Base do cadastro do produto: valor_ha_brl, ou derivado de valor_dose_brl / valor_litro_brl
      SELECT COALESCE(
        p.valor_ha_brl,
        CASE WHEN p.valor_dose_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
             THEN ROUND(p.valor_dose_brl * (p.dose_ml_ha/100.0), 2) END,
        CASE WHEN p.valor_litro_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
             THEN ROUND((p.valor_litro_brl/10.0) * (p.dose_ml_ha/100.0), 2) END,
        0
      ) INTO v_tabela
        FROM public.produtos p WHERE p.id = p_product_id;
      v_source := 'base';
      v_source_label := 'Preço base do produto';
    END IF;
  END IF;

  v_tabela := COALESCE(v_tabela, 0);
  v_final := ROUND(v_tabela * (1 - COALESCE(p_desconto,0)/100), 2);
  v_total := ROUND(v_final * p_quantidade, 2);
  v_custo := ROUND(v_tabela * 0.55, 2);

  RETURN jsonb_build_object(
    'preco_tabela', v_tabela,
    'desconto_pct', COALESCE(p_desconto,0),
    'preco_final', v_final,
    'quantidade', p_quantidade,
    'valor_total', v_total,
    'custo_estimado_unitario', v_custo,
    'margem_unitaria', v_final - v_custo,
    'margem_pct', CASE WHEN v_final > 0 THEN ROUND(((v_final - v_custo)/v_final)*100, 2) ELSE 0 END,
    'rentabilidade_total', ROUND((v_final - v_custo) * p_quantidade, 2),
    'price_source', v_source,
    'price_source_label', v_source_label,
    'campanha_nome', v_campanha_nome
  );
END $function$;
