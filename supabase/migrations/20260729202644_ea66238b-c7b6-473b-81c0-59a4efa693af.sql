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
  v_d numeric(5,2);
  v_f numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_user_partner := public.get_user_partner_id();
  IF NOT v_is_admin AND (NOT has_role(v_uid,'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id) THEN
    RAISE EXCEPTION 'forbidden_partner';
  END IF;
  SELECT pa.desconto_padrao INTO v_d
    FROM public.partner_accounts pa WHERE pa.id = p_partner_id AND pa.ativo = true;
  IF v_d IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;
  v_f := 1 - v_d/100.0;

  RETURN QUERY
  WITH prod_base AS (
    SELECT
      p.id, p.nome, p.codigo, p.ativo, p.dose_ml_ha,
      COALESCE(
        NULLIF(p.valor_dose_brl, 0),
        NULLIF(p.valor_litro_brl, 0) / 10.0,
        CASE WHEN p.valor_ha_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
             THEN p.valor_ha_brl / (p.dose_ml_ha / 100.0) END
      )::numeric AS vdose_base,
      p.valor_litro_brl AS vlitro_raw,
      p.valor_ha_brl AS vha_raw,
      ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado
    FROM public.produtos p
    LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
    WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true
  ),
  prod AS (
    SELECT
      pb.*,
      COALESCE(NULLIF(pb.vlitro_raw, 0), pb.vdose_base * 10.0) AS vlitro_base,
      COALESCE(
        NULLIF(pb.vha_raw, 0),
        CASE WHEN pb.dose_ml_ha IS NOT NULL AND pb.dose_ml_ha > 0 AND pb.vdose_base IS NOT NULL
             THEN (pb.dose_ml_ha / 100.0) * pb.vdose_base END
      )::numeric AS vha_base,
      ppp.preco_tabela AS pp_tabela,
      ppp.desconto_percentual AS pp_desc,
      COALESCE(ppp.preco_final, ROUND(ppp.preco_tabela * (1 - COALESCE(ppp.desconto_percentual,0)/100.0), 2)) AS pp_final
    FROM prod_base pb
    LEFT JOIN public.partner_product_prices ppp
      ON ppp.partner_id = p_partner_id AND ppp.product_id = pb.id AND ppp.ativo = true
  ),
  micro_base AS (
    SELECT
      m.id, m.nome, m.codigo, m.ativo, m.dose_ml_ha,
      COALESCE(
        NULLIF(m.valor_dose_brl, 0),
        NULLIF(m.valor_litro_brl, 0) / 10.0
      )::numeric AS vdose_base,
      m.valor_litro_brl AS vlitro_raw,
      mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b, mtp.beneficios_agronomicos
    FROM public.microrganismos m
    LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
    WHERE m.ativo = true AND m.b2b_enabled = true
  ),
  micro AS (
    SELECT
      mb.*,
      COALESCE(NULLIF(mb.vlitro_raw, 0), mb.vdose_base * 10.0) AS vlitro_base,
      CASE WHEN mb.dose_ml_ha IS NOT NULL AND mb.dose_ml_ha > 0 AND mb.vdose_base IS NOT NULL
           THEN (mb.dose_ml_ha / 100.0) * mb.vdose_base END AS vha_base,
      ppp.preco_tabela AS pp_tabela,
      ppp.desconto_percentual AS pp_desc,
      COALESCE(ppp.preco_final, ROUND(ppp.preco_tabela * (1 - COALESCE(ppp.desconto_percentual,0)/100.0), 2)) AS pp_final
    FROM micro_base mb
    LEFT JOIN public.partner_product_prices ppp
      ON ppp.partner_id = p_partner_id AND ppp.microrganismo_id = mb.id AND ppp.ativo = true
  )
  SELECT
    pr.id, 'produto'::text, pr.id, pr.nome, pr.codigo,
    CASE WHEN pr.status_validacao = 'aprovado' THEN LEFT(COALESCE(pr.resumo_curto, ''), 220) END,
    ROUND(COALESCE(pr.pp_tabela, pr.vha_base, 0), 2),
    COALESCE(pr.pp_desc, v_d),
    ROUND(COALESCE(pr.pp_final, pr.vha_base * v_f, 0), 2),
    pr.ativo,
    CASE WHEN pr.status_validacao = 'aprovado' THEN pr.resumo_curto END,
    CASE WHEN pr.status_validacao = 'aprovado' THEN pr.explicacao_b2b END,
    CASE WHEN pr.status_validacao = 'aprovado' THEN pr.beneficio_combinado END,
    COALESCE(pr.status_validacao, 'sem_ficha'),
    (pr.status_validacao = 'aprovado'),
    CASE
      WHEN pr.pp_final IS NOT NULL AND pr.dose_ml_ha IS NOT NULL AND pr.dose_ml_ha > 0
        THEN ROUND(pr.pp_final / (pr.dose_ml_ha / 100.0), 2)
      ELSE ROUND(COALESCE(pr.vdose_base, 0) * v_f, 2)
    END,
    CASE
      WHEN pr.pp_final IS NOT NULL AND pr.dose_ml_ha IS NOT NULL AND pr.dose_ml_ha > 0
        THEN ROUND((pr.pp_final / (pr.dose_ml_ha / 100.0)) * 10.0, 2)
      ELSE ROUND(COALESCE(pr.vlitro_base, 0) * v_f, 2)
    END,
    CASE
      WHEN pr.pp_final IS NOT NULL THEN ROUND(pr.pp_final, 2)
      WHEN pr.vha_base IS NOT NULL THEN ROUND(pr.vha_base * v_f, 2)
    END,
    -- unidade canônica: hectare > litro > dose_100ml > sob_consulta
    CASE
      WHEN COALESCE(pr.pp_final, pr.vha_base * v_f, 0) > 0 THEN 'hectare'
      WHEN COALESCE(pr.vlitro_base, 0) * v_f > 0 THEN 'litro'
      WHEN COALESCE(pr.vdose_base, 0) * v_f > 0 THEN 'dose_100ml'
      ELSE 'sob_consulta'
    END::text
  FROM prod pr
  UNION ALL
  SELECT
    mi.id, 'microrganismo'::text, NULL::uuid, mi.nome, mi.codigo,
    CASE WHEN mi.status_validacao = 'aprovado' THEN LEFT(COALESCE(mi.resumo_curto, ''), 220) END,
    ROUND(COALESCE(mi.pp_tabela, mi.vdose_base, 0), 2),
    COALESCE(mi.pp_desc, v_d),
    ROUND(COALESCE(mi.pp_final, mi.vdose_base * v_f, 0), 2),
    mi.ativo,
    CASE WHEN mi.status_validacao = 'aprovado' THEN mi.resumo_curto END,
    CASE WHEN mi.status_validacao = 'aprovado' THEN mi.explicacao_b2b END,
    CASE WHEN mi.status_validacao = 'aprovado' THEN mi.beneficios_agronomicos END,
    COALESCE(mi.status_validacao, 'sem_ficha'),
    (mi.status_validacao = 'aprovado'),
    ROUND(COALESCE(mi.pp_final, mi.vdose_base * v_f, 0), 2),
    ROUND(COALESCE(mi.pp_final * 10.0, mi.vlitro_base * v_f, 0), 2),
    CASE
      WHEN mi.pp_final IS NOT NULL AND mi.dose_ml_ha IS NOT NULL AND mi.dose_ml_ha > 0
        THEN ROUND((mi.dose_ml_ha / 100.0) * mi.pp_final, 2)
      WHEN mi.vha_base IS NOT NULL THEN ROUND(mi.vha_base * v_f, 2)
    END,
    -- unidade canônica: dose_100ml > litro > sob_consulta
    CASE
      WHEN COALESCE(mi.pp_final, mi.vdose_base * v_f, 0) > 0 THEN 'dose_100ml'
      WHEN COALESCE(mi.vlitro_base, 0) * v_f > 0 THEN 'litro'
      ELSE 'sob_consulta'
    END::text
  FROM micro mi;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated;