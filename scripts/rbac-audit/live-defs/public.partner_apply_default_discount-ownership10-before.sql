CREATE OR REPLACE FUNCTION public.partner_apply_default_discount(p_partner_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_desc numeric(5,2);
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT desconto_padrao INTO v_desc FROM public.partner_accounts WHERE id = p_partner_id AND ativo IS TRUE AND deleted_at IS NULL FOR UPDATE;
  IF v_desc IS NULL THEN RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501'; END IF;

  INSERT INTO public.partner_product_prices(partner_id, product_id, preco_tabela, desconto_percentual, preco_final, ativo)
  SELECT p_partner_id, p.id,
         COALESCE(p.valor_ha_brl, 0),
         v_desc,
         ROUND(COALESCE(p.valor_ha_brl, 0) * (1 - v_desc/100.0), 2),
         true
  FROM public.produtos p
  WHERE p.ativo = true
  ON CONFLICT (partner_id, product_id) WHERE product_id IS NOT NULL DO UPDATE
    SET preco_tabela = EXCLUDED.preco_tabela,
        desconto_percentual = EXCLUDED.desconto_percentual,
        preco_final = EXCLUDED.preco_final,
        ativo = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
