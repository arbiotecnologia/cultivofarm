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
 partner:=platform_private.b2b_commercial_context() IS NOT NULL;
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
REVOKE ALL ON FUNCTION public.get_my_available_portal_contexts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO authenticated,service_role;
