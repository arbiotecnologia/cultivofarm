CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s record; u uuid:=auth.uid(); BEGIN
 IF u IS NULL OR p_partner IS NULL THEN RETURN false; END IF;
 IF public.is_platform_superadmin(u) THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN
  RETURN public.is_valid_b2b_partner_user(u,p_partner)
   AND (public.has_role(u,'parceiro_b2b') OR (p_technical AND public.has_role(u,'parceiro_b2b_tecnico')));
 END IF;
 SELECT * INTO s FROM platform_private.b2b_actor_scope(u);
 RETURN s.profile_ok AND s.partner_valid AND s.org_partner=p_partner;
END $function$
