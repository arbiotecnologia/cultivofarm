-- F2-B1 2026-10-18 | SOMENTE REVISÃO. Nada executado hosted.
-- Ref obrigatório swzpzcwiasxmjutrmvkm; confirmar externamente, não por GUC/database.
-- Corpos capturados por SELECT; não executar como installer. ACL no relatório.
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); org uuid; role_name text; link record; owner uuid; legacy uuid; mode text;
BEGIN
 IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u) THEN RETURN NULL; END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL OR (SELECT count(*) FROM public.user_roles r WHERE r.user_id=u)<>1 THEN RETURN NULL; END IF;
 SELECT r.role::text INTO role_name FROM public.user_roles r WHERE r.user_id=u;
 IF role_name NOT IN ('parceiro_b2b','parceiro_b2b_tecnico') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM public.partner_users pu WHERE pu.user_id=u)<>1 THEN RETURN NULL; END IF;
 SELECT pu.partner_id,pu.papel INTO link FROM public.partner_users pu WHERE pu.user_id=u;
 IF link.papel IS DISTINCT FROM (CASE WHEN role_name='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END) THEN RETURN NULL; END IF;
 SELECT pa.commercial_owner_organization_id INTO owner FROM public.partner_accounts pa
 WHERE pa.id=link.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF owner IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos') THEN RETURN NULL; END IF;
 SELECT o.partner_account_id INTO legacy FROM public.organizations o WHERE o.id=org AND o.ativo IS TRUE AND o.status='ativa';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF owner=org THEN
   IF legacy IS NOT NULL AND legacy IS DISTINCT FROM link.partner_id THEN RETURN NULL; END IF;
   mode:='commercial_owner';
 ELSIF legacy=link.partner_id AND COALESCE(platform_private.b2b_phase1_partner_visible(link.partner_id,true),false) THEN
   mode:='legacy_partner_tenant';
 ELSE RETURN NULL;
 END IF;
 RETURN jsonb_build_object('partner_id',link.partner_id,'organization_id',org,
   'commercial_owner_organization_id',owner,'role',role_name,'papel',link.papel,'mode',mode);
END $function$;
-- Corpo de sincronização atual, coletado read-only; não autoriza ator.
CREATE OR REPLACE FUNCTION public.sync_puc_to_ptc_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assignment_type = 'tecnico'
     AND (NEW.user_role = 'parceiro_b2b_tecnico' OR public.has_role(NEW.user_id, 'parceiro_b2b_tecnico'::app_role))
  THEN
    INSERT INTO public.partner_technician_clients (partner_id, technician_user_id, cliente_id, assigned_by, active, notes)
    VALUES (NEW.partner_id, NEW.user_id, NEW.cliente_id, NEW.assigned_by, NEW.active, NEW.notes)
    ON CONFLICT (partner_id, technician_user_id, cliente_id)
    DO UPDATE SET active = EXCLUDED.active, updated_at = now(), notes = EXCLUDED.notes;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_actor_scope(_uid uuid)
 RETURNS TABLE(profile_ok boolean, org_partner uuid, user_partner uuid, user_partner_count integer, partner_valid boolean, has_catalog boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH pr AS (
    SELECT o.partner_account_id
      FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
     WHERE p.user_id = _uid AND p.ativo = true AND o.ativo = true AND o.status = 'ativa'
     LIMIT 1
  ), pu AS (
    SELECT count(*)::int c, min(partner_id::text)::uuid pid FROM public.partner_users WHERE user_id = _uid
  )
  SELECT EXISTS (SELECT 1 FROM pr),
         (SELECT partner_account_id FROM pr),
         (SELECT pid FROM pu), (SELECT c FROM pu),
         EXISTS (SELECT 1 FROM pr JOIN public.partner_accounts pa ON pa.id = pr.partner_account_id
                  WHERE pa.ativo = true AND pa.deleted_at IS NULL),
         EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos');
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s record; u uuid := auth.uid();
BEGIN
 IF u IS NULL OR p_partner IS NULL THEN RETURN false; END IF;
 IF public.is_platform_superadmin(u) THEN RETURN true; END IF;
 SELECT * INTO s FROM platform_private.b2b_actor_scope(u);
 IF NOT s.profile_ok OR NOT s.partner_valid OR s.org_partner IS DISTINCT FROM p_partner THEN RETURN false; END IF;
 IF public.has_role(u,'parceiro_b2b_tecnico') THEN
  RETURN p_technical AND s.user_partner_count=1 AND s.user_partner=p_partner;
 END IF;
 IF public.has_role(u,'parceiro_b2b') THEN
  RETURN s.user_partner_count=1 AND s.user_partner=p_partner;
 END IF;
 RETURN true; -- existing permissive policies/RPC role guards still select allowed roles
END $function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_assignment_identity_coherent(p_user uuid, p_partner uuid, p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_owner AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p_user)) AND (SELECT count(*) FROM public.user_roles r WHERE r.user_id=p_user)=1 AND (SELECT count(*) FROM public.partner_users pu WHERE pu.user_id=p_user)=1 AND EXISTS(SELECT 1 FROM public.partner_users pu JOIN public.user_roles r ON r.user_id=pu.user_id WHERE pu.user_id=p_user AND pu.partner_id=p_partner AND ((r.role='parceiro_b2b' AND pu.papel='gestor') OR (r.role='parceiro_b2b_tecnico' AND pu.papel='tecnico'))); $function$;
CREATE OR REPLACE FUNCTION public.validate_partner_user_client_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Preenche user_role automaticamente se vazio
  IF NEW.user_role IS NULL THEN
    NEW.user_role := public.get_b2b_user_role_for_partner(NEW.user_id, NEW.partner_id);
  END IF;

  -- Usuário deve pertencer ao parceiro
  IF NOT public.is_valid_b2b_partner_user(NEW.user_id, NEW.partner_id) THEN
    RAISE EXCEPTION 'Usuário % não é um usuário B2B válido do parceiro %', NEW.user_id, NEW.partner_id;
  END IF;

  -- Cliente deve estar vinculado ao parceiro (ativo) em partner_clients
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_clients pc
    WHERE pc.partner_id = NEW.partner_id
      AND pc.cliente_id = NEW.cliente_id
      AND pc.active = true
  ) THEN
    RAISE EXCEPTION 'Cliente % não está vinculado ao parceiro %', NEW.cliente_id, NEW.partner_id;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_partner_projection()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c jsonb; result jsonb;
BEGIN
 c:=platform_private.b2b_commercial_context();
 IF c IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('id',p.id,'codigo',p.codigo,'razao_social',p.razao_social,
   'nome_fantasia',p.nome_fantasia,'ativo',p.ativo,'papel',c->>'papel','mode',c->>'mode')
 INTO result FROM public.partner_accounts p
 WHERE p.id=(c->>'partner_id')::uuid AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND p.commercial_owner_organization_id=(c->>'commercial_owner_organization_id')::uuid;
 RETURN result;
END $function$;
