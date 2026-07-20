
DROP FUNCTION IF EXISTS public.get_partner_catalog_secure(uuid);

CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
RETURNS TABLE(
  item_id uuid,
  item_tipo text,
  product_id uuid,
  produto_nome text,
  produto_codigo text,
  descricao_curta text,
  preco_parceiro numeric,
  produto_ativo boolean
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
    p.id AS item_id,
    'produto'::text AS item_tipo,
    p.id AS product_id,
    p.nome AS produto_nome,
    p.codigo AS produto_codigo,
    LEFT(COALESCE(p.descricao, ''), 160) AS descricao_curta,
    COALESCE(
      pp.preco_final,
      ROUND(COALESCE(pp.preco_tabela, p.valor_ha_brl, 0) * (1 - COALESCE(pp.desconto_percentual, v_partner_desconto, 0)/100.0), 2)
    )::numeric AS preco_parceiro,
    p.ativo AS produto_ativo
  FROM public.produtos p
  LEFT JOIN public.partner_product_prices pp
    ON pp.product_id = p.id AND pp.partner_id = p_partner_id AND pp.ativo = true
  WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true

  UNION ALL

  SELECT
    m.id AS item_id,
    'microrganismo'::text AS item_tipo,
    NULL::uuid AS product_id,
    m.nome AS produto_nome,
    m.codigo AS produto_codigo,
    LEFT(COALESCE(m.descricao, COALESCE(m.nome_cientifico,'') || CASE WHEN m.funcao_agronomica IS NOT NULL THEN ' — ' || m.funcao_agronomica ELSE '' END), 160) AS descricao_curta,
    COALESCE(
      pp.preco_final,
      ROUND(COALESCE(pp.preco_tabela, m.preco_tabela, 0) * (1 - COALESCE(pp.desconto_percentual, v_partner_desconto, 0)/100.0), 2)
    )::numeric AS preco_parceiro,
    m.ativo AS produto_ativo
  FROM public.microrganismos m
  LEFT JOIN public.partner_product_prices pp
    ON pp.microrganismo_id = m.id AND pp.partner_id = p_partner_id AND pp.ativo = true
  WHERE m.ativo = true AND COALESCE(m.b2b_enabled, true) = true

  ORDER BY 2, 4;
END;
$function$;
