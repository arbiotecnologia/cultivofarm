CREATE OR REPLACE FUNCTION platform_private.b2b_debtor_partner(p_org uuid, p_customer uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT array_agg(pa.id ORDER BY pa.id) FROM public.partner_accounts pa
   WHERE pa.client_id = p_customer AND pa.commercial_owner_organization_id = p_org
     AND pa.ativo IS TRUE AND pa.deleted_at IS NULL $function$
