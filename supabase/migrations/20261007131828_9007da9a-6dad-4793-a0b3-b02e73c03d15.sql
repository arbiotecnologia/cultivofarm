-- Fase 1 B2B: correção focal após prova cross_partner_credit=FAIL.
-- Preflight externo: lovable supabase info => swzpzcwiasxmjutrmvkm (produção externa).
-- Rollback controlado: restaurar as definições/ACL capturadas no relatório de preflight;
-- não reabrir o cálculo interno sem corrigir sua autorização.
CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_credit(p_partner_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  PERFORM platform_private.assert_b2b_partner_scope(v_uid, p_partner_id);
  RETURN public.fn_b2b_credit_exposure(p_partner_id, 0, NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_b2b_partner_credit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_partner_credit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_b2b_credit_exposure(p_partner_id uuid, p_new_order_amount numeric DEFAULT 0, p_exclude_order_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  PERFORM platform_private.assert_b2b_partner_scope(v_uid, p_partner_id);
  IF p_new_order_amount IS NULL OR p_new_order_amount < 0 OR p_new_order_amount::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  IF p_exclude_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_orders po WHERE po.id=p_exclude_order_id AND po.partner_id=p_partner_id
  ) THEN
    RAISE EXCEPTION 'forbidden_order' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_b2b_credit_exposure(p_partner_id, p_new_order_amount, p_exclude_order_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_credit_exposure(uuid,numeric,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO service_role;