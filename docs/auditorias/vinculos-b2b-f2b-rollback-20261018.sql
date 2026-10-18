-- F2-B | 2026-10-18 | CANDIDATA REVISÁVEL, NÃO EXECUTADA PELO AGENTE.
-- Destino único: swzpzcwiasxmjutrmvkm, comprovado externamente pelo executor.
-- O nome da database/GUC NÃO comprova o project ref.
-- NO-GO para instalação: decisão de contexto legado, validação de terceiros,
-- revisão independente e RLS A/B reais pendentes. Não usar como aprovação.
-- Não altera grants, owner, policies, tabelas, dados ou UNIQUE(user_id).
-- ROLLBACK SEMÂNTICO PERIGOSO: restaura leitura de revogados e LIMIT 1.
-- Somente após decisão explícita, contenção dos consumidores e backup.
-- Nunca executar automaticamente nem como remédio para falha de RLS.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE r record; p record; acl text[];
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'F2B_EXECUTOR_NOT_REVIEWED'; END IF;
 FOR r IN SELECT * FROM (VALUES
   ('public.get_user_partner_id()', $expected1$CREATE OR REPLACE FUNCTION public.get_user_partner_id()
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
$expected1$),
   ('public.get_partner_papel(uuid)', $expected2$CREATE OR REPLACE FUNCTION public.get_partner_papel(_user_id uuid)
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
$expected2$)) v(signature,body) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
 -- pg_get_functiondef canonicalizes CREATE formatting; compare prosrc to exact body.
 IF NOT FOUND OR p.prosrc IS DISTINCT FROM split_part(r.body,'$function$',2)
 OR p.proowner<>'postgres'::regrole OR NOT p.prosecdef OR p.provolatile<>'s'
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
 THEN RAISE EXCEPTION 'F2B_ROLLBACK_DRIFT: %',r.signature; END IF;
 SELECT array_agg(x::text ORDER BY x::text) INTO acl FROM unnest(p.proacl) x;
 IF acl IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]
 THEN RAISE EXCEPTION 'F2B_ROLLBACK_ACL_DRIFT'; END IF;
 END LOOP;
END $rollback$;
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid() LIMIT 1;
$function$
CREATE OR REPLACE FUNCTION public.get_partner_papel(_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT papel FROM public.partner_users WHERE user_id = _user_id LIMIT 1;
$function$
COMMIT;
