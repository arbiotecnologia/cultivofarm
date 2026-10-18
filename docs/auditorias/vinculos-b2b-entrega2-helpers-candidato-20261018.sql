-- ENTREGA 2 (candidata REVISÁVEL, NÃO instalada) — helpers escalares e contexto portal.
-- Alvos (corpos/ACL/assinaturas preservados; apenas filtros de elegibilidade):
--   FASE A: public.get_user_partner_id()          md5 baseline 77822b0ef57e42bfe9cd7075265402aa
--   FASE B: public.get_partner_papel(uuid)        md5 baseline c892ee1df845b69950344953757ab472
--   FASE C: platform_private.b2b_commercial_context()  md5 baseline 02158d4204dea67308558f649113ba6d
-- Regra de elegibilidade (mesma da Entrega 1 rev 1.2): vínculo NÃO revogado,
-- parceiro ativo/não deletado, owner NOT NULL, tenant_id = owner.
-- Fail-closed: 0 ou 2+ vínculos elegíveis => NULL (nunca LIMIT 1 aleatório).
-- NÃO altera: 30 policies dependentes, overload can_user_access_cliente(uuid)
--   (que passa a herdar o endurecimento via get_user_partner_id), RPCs fechadas,
--   containment PUC.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE v_definition text;
BEGIN
  -- Guards de hash (anti-drift; falha a transação se o corpo hospedado divergir).
  IF md5(pg_get_functiondef('public.get_user_partner_id()'::regprocedure))
     IS DISTINCT FROM '77822b0ef57e42bfe9cd7075265402aa' THEN
    RAISE EXCEPTION 'entrega2_get_user_partner_id_drift';
  END IF;
  IF md5(pg_get_functiondef('public.get_partner_papel(uuid)'::regprocedure))
     IS DISTINCT FROM 'c892ee1df845b69950344953757ab472' THEN
    RAISE EXCEPTION 'entrega2_get_partner_papel_drift';
  END IF;
  IF md5(pg_get_functiondef('platform_private.b2b_commercial_context()'::regprocedure))
     IS DISTINCT FROM '02158d4204dea67308558f649113ba6d' THEN
    RAISE EXCEPTION 'entrega2_b2b_commercial_context_drift';
  END IF;
END
$migration$;

-- FASE A: get_user_partner_id() — fail-closed, elegibilidade completa.
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN min(pu.partner_id) END
  FROM public.partner_users pu
  JOIN public.partner_accounts pa ON pa.id = pu.partner_id
  WHERE pu.user_id = auth.uid()
    AND pu.revoked_at IS NULL
    AND pa.ativo = true AND pa.deleted_at IS NULL
    AND pa.commercial_owner_organization_id IS NOT NULL
    AND pu.tenant_id IS NOT NULL
    AND pu.tenant_id = pa.commercial_owner_organization_id;
$function$;

-- FASE B: get_partner_papel(uuid) — idem, para o alvo informado (callers internos).
CREATE OR REPLACE FUNCTION public.get_partner_papel(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN min(pu.papel) END
  FROM public.partner_users pu
  JOIN public.partner_accounts pa ON pa.id = pu.partner_id
  WHERE pu.user_id = _user_id
    AND pu.revoked_at IS NULL
    AND pa.ativo = true AND pa.deleted_at IS NULL
    AND pa.commercial_owner_organization_id IS NOT NULL
    AND pu.tenant_id IS NOT NULL
    AND pu.tenant_id = pa.commercial_owner_organization_id;
$function$;

-- FASE C: b2b_commercial_context() — adiciona revoked_at IS NULL à contagem e ao
-- vínculo selecionado (owner NOT NULL e parceiro ativo já eram exigidos).
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
 IF (SELECT count(*) FROM public.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL)<>1 THEN RETURN NULL; END IF;
 SELECT pu.partner_id,pu.papel INTO link FROM public.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL;
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

-- Pós-condição read-only:
DO $post$
DECLARE d1 text; d2 text; d3 text;
BEGIN
  d1 := pg_get_functiondef('public.get_user_partner_id()'::regprocedure);
  d2 := pg_get_functiondef('public.get_partner_papel(uuid)'::regprocedure);
  d3 := pg_get_functiondef('platform_private.b2b_commercial_context()'::regprocedure);
  IF position('pu.revoked_at IS NULL' IN d1) = 0
     OR position('CASE WHEN count(*) = 1 THEN min(pu.partner_id)' IN d1) = 0
     OR position('pu.tenant_id = pa.commercial_owner_organization_id' IN d1) = 0 THEN
    RAISE EXCEPTION 'entrega2_postcondition_get_user_partner_id_failed';
  END IF;
  IF position('pu.revoked_at IS NULL' IN d2) = 0
     OR position('CASE WHEN count(*) = 1 THEN min(pu.papel)' IN d2) = 0 THEN
    RAISE EXCEPTION 'entrega2_postcondition_get_partner_papel_failed';
  END IF;
  IF position('pu.revoked_at IS NULL' IN d3) = 0 THEN
    RAISE EXCEPTION 'entrega2_postcondition_b2b_commercial_context_failed';
  END IF;
END
$post$;

COMMIT;
-- Rollback: docs/auditorias/vinculos-b2b-entrega2-helpers-rollback-20261018.sql
-- (restaura os 3 corpos baseline exatos, com guarda de hash do corpo novo).
