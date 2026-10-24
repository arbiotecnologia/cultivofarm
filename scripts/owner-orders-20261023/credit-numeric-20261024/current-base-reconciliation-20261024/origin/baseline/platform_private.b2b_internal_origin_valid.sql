CREATE OR REPLACE FUNCTION platform_private.b2b_internal_origin_valid(s jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(jsonb_typeof(s)='object' AND s->>'schema_version'='1'
 AND nullif(s->>'organization_id','') IS NOT NULL
 AND s->>'organization_id'=s->>'creditor_organization_id'
 AND s->>'organization_id'=s->>'issuer_organization_id'
 AND nullif(s->>'company_settings_id','') IS NOT NULL
 AND nullif(s->>'actor_user_id','') IS NOT NULL
 AND nullif(s->>'partner_id','') IS NOT NULL,false)
$function$
