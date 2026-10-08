DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.organizations) THEN RAISE EXCEPTION 'canonical_baseline_missing'; END IF;
 IF to_regprocedure('public.link_partner_user(uuid,uuid,text)') IS NULL THEN RAISE EXCEPTION 'cadastro1_endpoint_missing'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.link_partner_user(p_partner_id uuid, p_user_id uuid, p_papel text DEFAULT 'gestor'::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
 -- No partner tenant is inferred from actor, created_by, email or legacy role.
 -- The existing provisioning/edit contracts reject linked roles; there is no
 -- reviewed integrated partner ownership + first-access contract to delegate to.
 RAISE EXCEPTION 'CADASTRO1_PARTNER_CONTRACT_UNAVAILABLE' USING ERRCODE='42501';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.link_partner_user(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.link_partner_user(uuid,uuid,text) IS 'CADASTRO-1 containment: no effects until integrated tenant/partner ownership and provisioning contract is reviewed; existing data and service ACL preserved.';
DO $proof$
DECLARE before_links text; before_roles text; after_links text; after_roles text;
BEGIN
 SELECT md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY t.id),'')) INTO before_links FROM public.partner_users t;
 SELECT md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY t.id),'')) INTO before_roles FROM public.user_roles t;
 BEGIN
  PERFORM public.link_partner_user(NULL,NULL,'gestor');
  RAISE EXCEPTION 'cadastro1_containment_failed';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'CADASTRO1_PARTNER_CONTRACT_UNAVAILABLE' THEN RAISE; END IF;
 END;
 IF has_function_privilege('authenticated','public.link_partner_user(uuid,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.link_partner_user(uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.set_partner_user_papel(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'cadastro1_acl_failed'; END IF;
 SELECT md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY t.id),'')) INTO after_links FROM public.partner_users t;
 SELECT md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY t.id),'')) INTO after_roles FROM public.user_roles t;
 IF before_links IS DISTINCT FROM after_links OR before_roles IS DISTINCT FROM after_roles THEN RAISE EXCEPTION 'cadastro1_data_changed'; END IF;
END $proof$;