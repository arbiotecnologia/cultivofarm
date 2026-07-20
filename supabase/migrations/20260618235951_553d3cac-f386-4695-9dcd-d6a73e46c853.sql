
DROP FUNCTION IF EXISTS public.get_partner_catalog_secure(uuid);

CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
RETURNS TABLE(
  item_id uuid,
  item_tipo text,
  product_id uuid,
  produto_nome text,
  produto_codigo text,
  descricao_curta text,
  preco_tabela numeric,
  desconto_percentual numeric,
  preco_parceiro numeric,
  produto_ativo boolean,
  resumo_curto text,
  explicacao_b2b text,
  beneficios_principais text,
  ficha_status text,
  ficha_aprovada boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  v_partner_desconto numeric(5,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_user_partner := public.get_user_partner_id();
  IF NOT v_is_admin AND (NOT has_role(v_uid,'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id) THEN
    RAISE EXCEPTION 'forbidden_partner';
  END IF;
  SELECT pa.desconto_padrao INTO v_partner_desconto
    FROM public.partner_accounts pa WHERE pa.id = p_partner_id AND pa.ativo = true;
  IF v_partner_desconto IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  RETURN QUERY
  SELECT
    p.id, 'produto'::text, p.id, p.nome, p.codigo,
    LEFT(COALESCE(ptp.resumo_curto, p.descricao, ''), 220),
    COALESCE(p.valor_ha_brl, 0)::numeric,
    v_partner_desconto,
    ROUND(COALESCE(p.valor_ha_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric,
    p.ativo,
    ptp.resumo_curto,
    ptp.explicacao_b2b,
    ptp.beneficio_combinado,
    COALESCE(ptp.status_validacao, 'sem_ficha'),
    (ptp.status_validacao = 'aprovado')
  FROM public.produtos p
  LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
  WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true
  UNION ALL
  SELECT
    m.id, 'microrganismo'::text, NULL::uuid, m.nome, m.codigo,
    LEFT(COALESCE(mtp.resumo_curto, m.funcao_agronomica, m.observacoes, ''), 220),
    COALESCE(m.valor_dose_brl, 0)::numeric,
    v_partner_desconto,
    ROUND(COALESCE(m.valor_dose_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric,
    m.ativo,
    mtp.resumo_curto,
    mtp.explicacao_b2b,
    mtp.beneficios_agronomicos,
    COALESCE(mtp.status_validacao, 'sem_ficha'),
    (mtp.status_validacao = 'aprovado')
  FROM public.microrganismos m
  LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
  WHERE m.ativo = true AND m.b2b_enabled = true;
END;
$function$;
