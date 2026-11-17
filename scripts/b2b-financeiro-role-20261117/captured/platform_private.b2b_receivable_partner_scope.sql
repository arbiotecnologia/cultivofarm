CREATE OR REPLACE FUNCTION platform_private.b2b_receivable_partner_scope(p_receivable uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.accounts_receivable; links uuid[];
BEGIN
 SELECT * INTO a FROM public.accounts_receivable WHERE id=p_receivable;
 IF NOT FOUND THEN RAISE EXCEPTION 'CREDIT_RECEIVABLE_NOT_FOUND' USING ERRCODE='23514'; END IF;
 links:=platform_private.b2b_debtor_partner(a.organization_id,a.customer_id);
 IF coalesce(cardinality(links),0)>1 THEN RAISE EXCEPTION 'CREDIT_PARTNER_LINK_AMBIGUOUS' USING ERRCODE='42501'; END IF;
 IF a.partner_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=a.partner_id
    AND pa.commercial_owner_organization_id=a.organization_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL)
  THEN RAISE EXCEPTION 'CREDIT_PARTNER_OWNER_MISMATCH' USING ERRCODE='23514'; END IF;
  IF coalesce(cardinality(links),0)=1 AND links[1] IS DISTINCT FROM a.partner_id
  THEN RAISE EXCEPTION 'CREDIT_PARTNER_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN a.partner_id;
 END IF;
 RETURN links[1];
END $function$
