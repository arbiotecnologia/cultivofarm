-- ENTREGA 2 — ROLLBACK MANUAL (NÃO executar automaticamente; sob avaliação).
-- Restaura os corpos baseline exatos dos 3 objetos, com guarda anti-drift:
-- só reverte se os corpos atuais forem EXATAMENTE os instalados pela candidata
-- (marcadores de pós-condição presentes). Caso contrário, falha sem tocar nada.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE d1 text; d2 text; d3 text;
BEGIN
  d1 := pg_get_functiondef('public.get_user_partner_id()'::regprocedure);
  d2 := pg_get_functiondef('public.get_partner_papel(uuid)'::regprocedure);
  d3 := pg_get_functiondef('platform_private.b2b_commercial_context()'::regprocedure);
  -- BEGIN HASH GUARD (gerado por scripts/tests/entrega2-helpers-local.py; rev 2.2)
  IF md5(d1) IS DISTINCT FROM 'b334c3a454ebc4233d3b9e0d0a700d78'
     OR md5(d2) IS DISTINCT FROM 'f84f898ead03dfd646ece50d16baf909'
     OR md5(d3) IS DISTINCT FROM 'a31d198c9a9fc9a5e7c397ab36fe0fa4' THEN
    RAISE EXCEPTION 'entrega2_rollback_antidrift: corpos divergem do instalado; abortando';
  END IF;
  -- END HASH GUARD
END
$guard$;

-- Baseline exato: get_user_partner_id()
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid() LIMIT 1;
$function$;

-- Baseline exato: get_partner_papel(uuid)
CREATE OR REPLACE FUNCTION public.get_partner_papel(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT papel FROM public.partner_users WHERE user_id = _user_id LIMIT 1;
$function$;

-- Baseline exato: platform_private.b2b_commercial_context()
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

-- Verificação pós-rollback (hashes baseline):
DO $verify$
BEGIN
  IF md5(pg_get_functiondef('public.get_user_partner_id()'::regprocedure))
     IS DISTINCT FROM '77822b0ef57e42bfe9cd7075265402aa'
     OR md5(pg_get_functiondef('public.get_partner_papel(uuid)'::regprocedure))
     IS DISTINCT FROM 'c892ee1df845b69950344953757ab472'
     OR md5(pg_get_functiondef('platform_private.b2b_commercial_context()'::regprocedure))
     IS DISTINCT FROM '02158d4204dea67308558f649113ba6d' THEN
    RAISE EXCEPTION 'entrega2_rollback_verify_failed';
  END IF;
END
$verify$;

COMMIT;
