CREATE OR REPLACE FUNCTION public.get_partner_order_payment_terms_secure(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM partner_orders o JOIN partner_accounts pa ON pa.id = o.partner_id WHERE o.id = p_order_id AND (
      EXISTS (SELECT 1 FROM partner_users pu WHERE pu.partner_id = o.partner_id AND pu.user_id = auth.uid())
      OR (has_role(auth.uid(),'administrador') AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.organization_id = pa.commercial_owner_organization_id)))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN '{}'::jsonb;
END $function$
