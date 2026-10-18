-- F2-B | 2026-10-18 | CANDIDATA REVISÁVEL, NÃO EXECUTADA PELO AGENTE.
-- Destino único: swzpzcwiasxmjutrmvkm, comprovado externamente pelo executor.
-- O nome da database/GUC NÃO comprova o project ref.
-- NO-GO para instalação: decisão de contexto legado, validação de terceiros,
-- revisão independente e RLS A/B reais pendentes. Não usar como aprovação.
-- Não altera grants, owner, policies, tabelas, dados ou UNIQUE(user_id).
-- SUBFASE ESCALAR SOMENTE. Helpers por par ficam INALTERADOS por blocker operacional.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE r record; p record; acl text[]; digest text;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'F2B_EXECUTOR_NOT_REVIEWED'; END IF;
 IF (SELECT count(*) FROM pg_proc proc JOIN pg_namespace n ON n.oid=proc.pronamespace
     WHERE n.nspname='public' AND proc.proname IN
     ('get_user_partner_id','get_partner_papel','get_b2b_user_role_for_partner','is_valid_b2b_partner_user')) <> 4
 THEN RAISE EXCEPTION 'F2B_OVERLOAD_DRIFT'; END IF;
 FOR r IN SELECT * FROM (VALUES ('public.get_user_partner_id()','77822b0ef57e42bfe9cd7075265402aa'),
('public.get_partner_papel(uuid)','c892ee1df845b69950344953757ab472'),
('public.get_b2b_user_role_for_partner(uuid,uuid)','b2596473d00151ef41b4b2ce82e044cb'),
('public.is_valid_b2b_partner_user(uuid,uuid)','7b17274fb6dce728741a2a9c77710a76')) v(signature,body_md5) LOOP
   SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
   IF NOT FOUND OR md5(pg_get_functiondef(p.oid))<>r.body_md5 OR NOT p.prosecdef
      OR p.proowner <> 'postgres'::regrole OR p.provolatile<>'s'
      OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   THEN RAISE EXCEPTION 'F2B_BASELINE_DRIFT: %',r.signature; END IF;
   SELECT array_agg(x::text ORDER BY x::text) INTO acl FROM unnest(p.proacl) x;
   IF acl IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]
   THEN RAISE EXCEPTION 'F2B_ACL_DRIFT: %',r.signature; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_users'::regclass
   AND conname='partner_users_user_id_key' AND contype='u'
   AND pg_get_constraintdef(oid)='UNIQUE (user_id)') THEN RAISE EXCEPTION 'F2B_UNIQUE_DRIFT'; END IF;
 SELECT md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\n'
 ORDER BY schemaname,tablename,policyname)) INTO digest FROM pg_policies
 WHERE coalesce(qual,'')||' '||coalesce(with_check,'') ~ '(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)';
 IF digest IS DISTINCT FROM '44d347112e277cbfd89b3d7daad8b5d2' THEN RAISE EXCEPTION 'F2B_POLICY_MANIFEST_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_users pu LEFT JOIN public.partner_accounts pa ON pa.id=pu.partner_id
   LEFT JOIN public.profiles pr ON pr.user_id=pu.user_id WHERE pu.revoked_at IS NULL AND
   (pu.tenant_id IS NULL OR pa.commercial_owner_organization_id IS NULL
    OR pu.tenant_id IS DISTINCT FROM pa.commercial_owner_organization_id
    OR pr.organization_id IS DISTINCT FROM pu.tenant_id OR pr.ativo IS DISTINCT FROM true
    OR pa.ativo IS DISTINCT FROM true OR pa.deleted_at IS NOT NULL))
 THEN RAISE EXCEPTION 'F2B_EXISTING_ACCESS_OR_LEGACY_REVIEW_REQUIRED'; END IF;
END $preflight$;

-- BEGIN SCALAR CANDIDATES
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Count ALL unrevoked links before eligibility; never select one out of ambiguity.
  SELECT pu.partner_id FROM public.partner_users pu
  JOIN public.partner_accounts pa ON pa.id=pu.partner_id
  JOIN public.profiles pr ON pr.user_id=pu.user_id
  WHERE pu.user_id=auth.uid() AND auth.uid() IS NOT NULL
    AND (SELECT count(*) FROM public.partner_users x
         WHERE x.user_id=auth.uid() AND x.revoked_at IS NULL)=1
    AND pu.revoked_at IS NULL AND pu.valid_from <= now()
    AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
    AND pa.commercial_owner_organization_id IS NOT NULL
    AND pu.tenant_id = pa.commercial_owner_organization_id
    AND pr.ativo IS TRUE AND pr.organization_id = pu.tenant_id
    AND platform_private.platform_actor_access_ready(pr.user_id);
$function$;

CREATE OR REPLACE FUNCTION public.get_partner_papel(_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Public arbitrary-target introspection is closed; no admin/service impersonation.
  SELECT pu.papel FROM public.partner_users pu
  JOIN public.partner_accounts pa ON pa.id=pu.partner_id
  JOIN public.profiles pr ON pr.user_id=pu.user_id
  WHERE _user_id=auth.uid() AND auth.uid() IS NOT NULL AND pu.user_id=_user_id
    AND (SELECT count(*) FROM public.partner_users x
         WHERE x.user_id=_user_id AND x.revoked_at IS NULL)=1
    AND pu.revoked_at IS NULL AND pu.valid_from <= now()
    AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
    AND pa.commercial_owner_organization_id IS NOT NULL
    AND pu.tenant_id = pa.commercial_owner_organization_id
    AND pr.ativo IS TRUE AND pr.organization_id = pu.tenant_id
    AND platform_private.platform_actor_access_ready(pr.user_id);
$function$;
-- END SCALAR CANDIDATES

-- CREATE OR REPLACE preserva owner e ACL existentes; nenhuma concessão nova.
COMMIT;
