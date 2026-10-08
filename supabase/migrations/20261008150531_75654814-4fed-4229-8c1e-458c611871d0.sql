DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261008144506') THEN RAISE EXCEPTION 'canonical_baseline_unavailable'; END IF; END $$;
ALTER TABLE public.user_access_preferences DROP CONSTRAINT IF EXISTS user_access_preferences_last_context_chk;
ALTER TABLE public.user_access_preferences ADD CONSTRAINT user_access_preferences_last_context_chk CHECK (last_context IS NULL OR last_context IN ('b2b','technical','admin'));
ALTER TABLE public.user_access_preferences DROP CONSTRAINT IF EXISTS user_access_preferences_preferred_context_chk;
ALTER TABLE public.user_access_preferences ADD CONSTRAINT user_access_preferences_preferred_context_chk CHECK (preferred_context IS NULL OR preferred_context IN ('b2b','technical','admin'));
ALTER TABLE public.user_context_access_logs DROP CONSTRAINT IF EXISTS user_context_access_logs_context_chk;
ALTER TABLE public.user_context_access_logs ADD CONSTRAINT user_context_access_logs_context_chk CHECK (context_code IN ('b2b','technical','producer','none','admin'));
ALTER TABLE public.user_context_access_logs DROP CONSTRAINT IF EXISTS user_context_access_logs_previous_chk;
ALTER TABLE public.user_context_access_logs ADD CONSTRAINT user_context_access_logs_previous_chk CHECK (previous_context IS NULL OR previous_context IN ('b2b','technical','producer','none','admin'));
CREATE OR REPLACE FUNCTION public.get_my_available_portal_contexts() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE u uuid:=auth.uid(); org uuid; management boolean:=false; tech boolean:=false; partner boolean:=false; scopes record; contexts text[]:=ARRAY[]::text[]; pref text; last_ctx text; skip boolean:=false; def text;
BEGIN
 IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u) THEN
  RETURN jsonb_build_object('available_contexts',contexts,'default_context',NULL,'must_select_context',false,'has_b2b_access',false,'has_technical_access',false,'is_admin',false,'preferred_context',NULL,'skip_context_selector',false);
 END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL THEN RETURN jsonb_build_object('available_contexts',contexts,'default_context',NULL,'must_select_context',false,'has_b2b_access',false,'has_technical_access',false,'is_admin',false,'preferred_context',NULL,'skip_context_selector',false); END IF;
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u AND r.role IN ('administrador','gestor')),
 EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u AND r.role IN ('tecnico_agronomo','consultor_tecnico','aplicador')) INTO management,tech;
 SELECT * INTO scopes FROM platform_private.b2b_actor_scope(u);
 partner:=EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u AND r.role IN ('parceiro_b2b','parceiro_b2b_tecnico'))
 AND scopes.profile_ok AND scopes.partner_valid AND scopes.user_partner_count=1 AND scopes.user_partner IS NOT DISTINCT FROM scopes.org_partner
 AND COALESCE(public.b2b_phase1_partner_visible(scopes.org_partner,true),false);
 IF management THEN contexts:=array_append(contexts,'admin'); END IF;
 IF partner THEN contexts:=array_append(contexts,'b2b'); END IF;
 IF tech THEN contexts:=array_append(contexts,'technical'); END IF;
 SELECT preferred_context,last_context,skip_context_selector INTO pref,last_ctx,skip FROM public.user_access_preferences WHERE user_id=u;
 IF pref IS NOT NULL AND pref=ANY(contexts) THEN def:=pref;
 ELSIF last_ctx IS NOT NULL AND last_ctx=ANY(contexts) THEN def:=last_ctx;
 ELSIF cardinality(contexts)=1 THEN def:=contexts[1]; END IF;
 IF pref IS NULL OR NOT(pref=ANY(contexts)) THEN pref:=NULL; skip:=false; END IF;
 RETURN jsonb_build_object('available_contexts',contexts,'default_context',def,'must_select_context',cardinality(contexts)>1 AND NOT COALESCE(skip,false),
 'has_b2b_access',management OR partner,'has_technical_access',management OR tech,'is_admin',management,
 'preferred_context',pref,'skip_context_selector',COALESCE(skip,false));
END $f$;
-- Preserve the reviewed preference/log operations, changing only context vocabulary and readiness before all effects.
DO $d$ DECLARE fn text; src text; BEGIN
 FOREACH fn IN ARRAY ARRAY['public.set_my_context_preference(text,boolean)','public.register_my_login_redirect_secure(text)'] LOOP
  src:=pg_get_functiondef(fn::regprocedure);
  IF position('v_available := public.get_my_available_portal_contexts();' IN src)=0 OR position('IF p_context NOT IN (''b2b'',''technical'') THEN' IN src)=0 THEN RAISE EXCEPTION 'multiportal_contract_changed:%',fn; END IF;
  src:=replace(src,'SET search_path TO ''public''','SET search_path TO ''''');
  src:=replace(src,'IF p_context NOT IN (''b2b'',''technical'') THEN','IF p_context IS NULL OR p_context NOT IN (''b2b'',''technical'',''admin'') THEN');
  src:=replace(src,'IF v_uid IS NULL THEN','IF v_uid IS NULL OR NOT platform_private.platform_actor_access_ready(v_uid) OR public.h15_actor_organization() IS NULL THEN');
  EXECUTE src;
 END LOOP;
END $d$;
REVOKE ALL ON FUNCTION public.get_my_available_portal_contexts(), public.set_my_context_preference(text,boolean), public.register_my_login_redirect_secure(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts(), public.set_my_context_preference(text,boolean), public.register_my_login_redirect_secure(text) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_my_available_portal_contexts() IS 'MULTIPORTAL-1: selectable real-role contexts; legacy management flags are not authorization. Active canonical organization required.';