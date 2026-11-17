CREATE OR REPLACE FUNCTION public.rpc_portal_partner_financial(p_partner_id uuid, p_own_finance_v1 boolean, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
 IF p_own_finance_v1 IS DISTINCT FROM true THEN RAISE EXCEPTION 'own_finance_contract_required' USING ERRCODE='42501'; END IF;
 RETURN platform_private.b2b_own_obligations(p_partner_id,p_before,p_before_id);
END $function$
