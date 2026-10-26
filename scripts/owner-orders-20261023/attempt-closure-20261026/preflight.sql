-- INATIVO / REVISAO INDEPENDENTE. Nao aplicar sem autorizacao. Gerado por assemble.py.
-- READ ONLY: falha (rollback) em qualquer divergencia do LIVE capturado.
BEGIN TRANSACTION READ ONLY;

DO $c2ac_pre$
DECLARE r record;
BEGIN
  -- alvo ausente
  IF to_regclass('platform_private.partner_order_idempotency_closures') IS NOT NULL
     OR to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)') IS NOT NULL OR to_regprocedure('public.close_partner_order_attempt_v1(uuid,text)') IS NOT NULL
     OR to_regprocedure('platform_private.c2_attempt_closure_immutable()') IS NOT NULL OR to_regprocedure('platform_private.c2_partner_order_attempt_authz(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('platform_private.c2_attempt_closure_guard()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_idempotency'::regclass AND tgname='c2_attempt_closure_guard') THEN
    RAISE EXCEPTION 'C2AC_TARGET_PRESENT';
  END IF;
  -- create canônico LIVE byte-exato (corpo/owner/secdef/search_path/ACL)
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r
    FROM pg_proc WHERE oid = to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)');
  IF r.m IS DISTINCT FROM '7a63423519d7d9a54ced52d6d9e9e057' OR r.o IS DISTINCT FROM 'postgres' OR r.s IS DISTINCT FROM true
     OR r.c IS DISTINCT FROM ARRAY['search_path=public']::text[] OR r.a IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'C2AC_DRIFT:create_partner_order_secure';
  END IF;
  -- dependências usadas pelo core
  IF (SELECT md5(pg_get_functiondef(oid))||' '||proacl::text FROM pg_proc WHERE oid = to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)'))
     IS DISTINCT FROM '54c4327d63f48e39f598129ff9dd8f09 {postgres=X/postgres}' THEN RAISE EXCEPTION 'C2AC_DRIFT:c2_order_actor_scope'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.has_role(uuid,public.app_role)'))
     IS DISTINCT FROM '3c656bbf54edd698555d09d2a3a9a6ce' THEN RAISE EXCEPTION 'C2AC_DRIFT:has_role'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.get_user_partner_id()'))
     IS DISTINCT FROM '0991069604167f7ee4497c2f36171756' THEN RAISE EXCEPTION 'C2AC_DRIFT:get_user_partner_id'; END IF;
  -- tabela de idempotência: colunas, RLS, policies e índice único exato
  IF (SELECT md5(string_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull,',' ORDER BY attnum))
        FROM pg_attribute WHERE attrelid='public.partner_order_idempotency'::regclass AND attnum>0 AND NOT attisdropped)
     IS DISTINCT FROM '97bd8e7bf8648bf6d291c8a4f429aff6' THEN RAISE EXCEPTION 'C2AC_DRIFT:poi_columns'; END IF;
  IF (SELECT md5(string_agg(policyname||'|'||permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),'#' ORDER BY policyname))
        FROM pg_policies WHERE schemaname='public' AND tablename='partner_order_idempotency')
     IS DISTINCT FROM 'fef85d223daaa0abf4cf53c35e608226' THEN RAISE EXCEPTION 'C2AC_DRIFT:poi_policies'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.partner_order_idempotency'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'C2AC_DRIFT:poi_rls'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
     WHERE i.indrelid='public.partner_order_idempotency'::regclass AND c.relname='ux_partner_order_idempotency_key'
       AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
       AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
              JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum) = ARRAY['partner_id','idempotency_key']::name[]) THEN
    RAISE EXCEPTION 'C2AC_DRIFT:poi_unique_key'; END IF;
  IF NOT has_schema_privilege('authenticated','platform_private','USAGE') THEN RAISE EXCEPTION 'C2AC_DRIFT:pp_usage'; END IF;
END $c2ac_pre$;
ROLLBACK;
