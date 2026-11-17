CREATE OR REPLACE FUNCTION public.partner_users_derive_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT pa.commercial_owner_organization_id
    INTO v_tenant
    FROM public.partner_accounts pa
   WHERE pa.id = NEW.partner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_users_partner_not_found' USING ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'partner_users_tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  NEW.tenant_id := v_tenant;
  RETURN NEW;
END;
$function$
;
