CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); org uuid; pid uuid; rs text[]; result jsonb; BEGIN
 org:=public.h15_actor_organization();
 SELECT partner_id INTO pid FROM public.partner_users WHERE user_id=u;
 IF NOT public.is_valid_b2b_partner_user(u,pid) THEN RETURN NULL; END IF;
 SELECT array_agg(role::text ORDER BY role::text) INTO rs FROM public.user_roles WHERE user_id=u;
 result:=jsonb_build_object('contract','C2_MULTIPROFILE_V1','actor_id',u,'tenant_id',org,
 'organization_id',org,'partner_id',pid,'commercial_owner_organization_id',org,'external_roles',rs,
 'role',CASE WHEN 'parceiro_b2b'=ANY(rs) THEN 'parceiro_b2b' ELSE 'parceiro_b2b_tecnico' END,
 'papel',CASE WHEN 'parceiro_b2b'=ANY(rs) THEN 'gestor' ELSE 'tecnico' END,'mode','commercial_owner',
 'manager', 'parceiro_b2b'=ANY(rs),'technician','parceiro_b2b_tecnico'=ANY(rs),
 'producer_links_valid',platform_private.c2_producer_links(u,org),
 'profile_stamp',(SELECT updated_at FROM public.profiles WHERE user_id=u),
 'link_version',(SELECT version FROM public.partner_users WHERE user_id=u));
 RETURN result;
END $function$
