-- CANDIDATO 09 — NÃO APLICADO. Após 01–06/08; gate OFF; não altera o resolver de preços.
-- Matriz comercial ainda não certifica próprios: não deve enumerar nomes/IDs privados sem pai.
BEGIN;
DO $$ BEGIN
 IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership09_gate_must_remain_off'; END IF;
 IF md5(pg_get_functiondef('public.rpc_cc_validate_matrix(uuid,text,uuid,uuid)'::regprocedure)) <> 'e3b94ad47b93b02c9717a6a694163552' THEN
  RAISE EXCEPTION 'ownership09_matrix_definition_drift'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.rpc_cc_validate_matrix(p_plan_id uuid, p_buyer_scope text, p_partner_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_missing jsonb; v_drafts int; v_quote int;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'id',id,'nome',nome)),'[]'::jsonb) INTO v_missing
  FROM (
    SELECT 'produto' tipo, p.id, p.nome FROM public.produtos p
     WHERE p.owner_organization_id IS NULL AND COALESCE(p.ativo,true)
       AND NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices i
            WHERE i.plan_id=p_plan_id AND i.product_id=p.id AND i.buyer_scope=p_buyer_scope
              AND i.partner_id IS NOT DISTINCT FROM p_partner_id
              AND i.customer_id IS NOT DISTINCT FROM p_customer_id
              AND i.status IN ('draft','pending_approval','published'))
    UNION ALL
    SELECT 'microrganismo', m.id, m.nome FROM public.microrganismos m
     WHERE m.owner_organization_id IS NULL AND COALESCE(m.ativo,true)
       AND NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices i
            WHERE i.plan_id=p_plan_id AND i.microrganismo_id=m.id AND i.buyer_scope=p_buyer_scope
              AND i.partner_id IS NOT DISTINCT FROM p_partner_id
              AND i.customer_id IS NOT DISTINCT FROM p_customer_id
              AND i.status IN ('draft','pending_approval','published'))
  ) s;
  SELECT count(*) FILTER (WHERE status='draft'), count(*) FILTER (WHERE pricing_mode='quote_only')
    INTO v_drafts, v_quote
  FROM public.commercial_condition_item_prices
   WHERE plan_id=p_plan_id AND buyer_scope=p_buyer_scope
     AND partner_id IS NOT DISTINCT FROM p_partner_id
     AND customer_id IS NOT DISTINCT FROM p_customer_id;
  RETURN jsonb_build_object('ok', jsonb_array_length(v_missing)=0,
    'missing_items', v_missing, 'draft_count', COALESCE(v_drafts,0), 'quote_only_count', COALESCE(v_quote,0));
END $function$;
-- ACL preservada, não ampliar roles. Rollback operacional preserva este filtro.
COMMIT;
