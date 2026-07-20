CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
 RETURNS TABLE(item_id uuid, item_tipo text, product_id uuid, produto_nome text, produto_codigo text, descricao_curta text, preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric, produto_ativo boolean)
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
    COALESCE(p.valor_ha_brl, 0)::numeric AS preco_tabela,
    v_partner_desconto AS desconto_percentual,
    ROUND(COALESCE(p.valor_ha_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric AS preco_parceiro,
    p.ativo AS produto_ativo
  FROM public.produtos p
  WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true

  UNION ALL

  SELECT
    m.id AS item_id,
    'microrganismo'::text AS item_tipo,
    NULL::uuid AS product_id,
    m.nome AS produto_nome,
    NULL::text AS produto_codigo,
    LEFT(COALESCE(m.funcao_agronomica, m.observacoes, ''), 160) AS descricao_curta,
    COALESCE(m.valor_dose_brl, 0)::numeric AS preco_tabela,
    v_partner_desconto AS desconto_percentual,
    ROUND(COALESCE(m.valor_dose_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric AS preco_parceiro,
    m.ativo AS produto_ativo
  FROM public.microrganismos m
  WHERE m.ativo = true AND COALESCE(m.b2b_enabled, false) = true;
END;
$function$;