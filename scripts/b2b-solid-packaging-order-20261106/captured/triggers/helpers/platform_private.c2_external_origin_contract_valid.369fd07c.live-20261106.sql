CREATE OR REPLACE FUNCTION platform_private.c2_external_origin_contract_valid(s jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(
  (s->>'contract'='C2_EXTERNAL_ORDER_ORIGIN_V1' AND platform_private.b2b_internal_origin_valid(s))
  OR (jsonb_typeof(s)='object' AND s->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' AND s->>'schema_version'='1'
      AND nullif(s->>'organization_id','') IS NOT NULL AND s->>'organization_id'=s->>'creditor_organization_id'
      AND nullif(s->>'actor_user_id','') IS NOT NULL AND nullif(s->>'partner_id','') IS NOT NULL
      AND s->'accounting_validated'='false'::jsonb
      AND NOT (s ? 'issuer_organization_id') AND NOT (s ? 'issuer_legal_name') AND NOT (s ? 'issuer_cnpj')
      AND s->>'issuer_state' IS NOT NULL),false)
$function$
