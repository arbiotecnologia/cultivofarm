CREATE OR REPLACE FUNCTION public.b2b_claim_provisioning(p_partner uuid, p_key uuid, p_email text, p_nome text, p_roles app_role[], p_clients uuid[], p_primary uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT platform_private.b2b_claim_provisioning(p_partner,p_key,p_email,p_nome,p_roles,p_clients,p_primary); $function$
