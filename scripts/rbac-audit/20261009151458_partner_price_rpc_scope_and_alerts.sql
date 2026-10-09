-- Canonical forward fix: remove direct RPC owner bypass, preserve existing role/RLS checks.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') OR EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref<>'swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'canonical_project_required'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.partner_apply_default_discount(p_partner_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
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

CREATE OR REPLACE FUNCTION public.partner_reset_prices_to_default(p_partner_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_d numeric(5,2);
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT desconto_padrao INTO v_d FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true AND deleted_at IS NULL FOR UPDATE;
  IF v_d IS NULL THEN RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501'; END IF;

  UPDATE public.partner_product_prices
     SET desconto_percentual = v_d,
         preco_final = ROUND(preco_tabela * (1 - v_d/100.0), 2),
         updated_at = now()
   WHERE partner_id = p_partner_id
     AND ativo = true
     AND desconto_percentual IS DISTINCT FROM v_d;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_commercial_alerts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object(
 'pedidos_aguardando_aprovacao',(SELECT count(*) FROM public.partner_orders po WHERE po.status::text IN ('solicitado','em_analise_comercial') AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=po.partner_id)),
 'pedidos_aguardando_ajuste',(SELECT count(*) FROM public.partner_orders po WHERE po.status::text='aguardando_ajuste_comercial' AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=po.partner_id)),
 'campanhas_vencendo','[]'::jsonb,
 'campanhas_disponiveis',false,
 'campanhas_motivo','campaign_owner_unverified',
 'tabelas_vencendo',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (SELECT partner_id,product_id,price_table_name,valid_until FROM public.partner_product_prices WHERE is_current AND valid_until BETWEEN current_date AND current_date+15 ORDER BY valid_until,id LIMIT 50) t),
 'parceiros_sem_tabela',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (SELECT pa.id,pa.razao_social FROM public.partner_accounts pa WHERE pa.ativo AND NOT EXISTS(SELECT 1 FROM public.partner_product_prices ppp WHERE ppp.partner_id=pa.id AND ppp.is_current AND ppp.ativo) ORDER BY pa.id LIMIT 50) p),
 'parceiros_sem_compras_30d',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (SELECT pa.id,pa.razao_social,(SELECT max(created_at) FROM public.partner_orders WHERE partner_id=pa.id) ultima_compra FROM public.partner_accounts pa WHERE pa.ativo AND NOT EXISTS(SELECT 1 FROM public.partner_orders WHERE partner_id=pa.id AND created_at>now()-interval '30 days') ORDER BY pa.id LIMIT 50) p),
 'parceiros_sem_compras_60d',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (SELECT pa.id,pa.razao_social,(SELECT max(created_at) FROM public.partner_orders WHERE partner_id=pa.id) ultima_compra FROM public.partner_accounts pa WHERE pa.ativo AND NOT EXISTS(SELECT 1 FROM public.partner_orders WHERE partner_id=pa.id AND created_at>now()-interval '60 days') ORDER BY pa.id LIMIT 50) p),
 'mensagens_nao_respondidas',(SELECT count(*) FROM public.partner_order_messages m WHERE m.status IN ('nao_lida','lida') AND EXISTS(SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id WHERE po.id=m.order_id))
 );
END $function$;
REVOKE ALL ON FUNCTION public.partner_apply_default_discount(uuid),public.partner_reset_prices_to_default(uuid),public.rpc_commercial_alerts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_apply_default_discount(uuid),public.partner_reset_prices_to_default(uuid),public.rpc_commercial_alerts() TO authenticated,service_role;
