-- READ-ONLY preflight. Every row must be true; any false => abort (fail-closed).
BEGIN TRANSACTION READ ONLY;
WITH f(sig, h) AS (VALUES
 ('public.fn_generate_receivable_from_entrega(uuid,jsonb)','670ea34d37c4c4fd6612031ad763a3a7'),
 ('public.fn_mark_entrega_not_billable(uuid,text)','e4008b029ce8d58f70f3fc88571d03be'),
 ('public.is_financial_staff(uuid)','6e8f2fa7b92ca7e039d092353b3ebfe2'),
 ('public.fn_authz_uid_scope_ok(uuid)','00a9a4d4a075d756d312d69778493b39'),
 ('public.h15_user_organization(uuid)','ff3688c33c7211b6c3fe60447a7728ac'),
 ('public.fn_entrega_valor_faturavel_v1(uuid)','5ac43dc18eee407723c0d78cd97f0db4'),
 ('public.fn_entrega_guard_faturamento_v1(uuid,numeric)','fe0d6a0f670787f87081fe0650102d22'),
 ('public.fn_entrega_confirmar_engine_v1','6eb78ceebe90196ac5b95bfc127dd63b'))
SELECT 'hash '||sig, (SELECT bool_and(md5(pg_get_functiondef(p.oid))=h) AND count(*)=1 FROM pg_proc p
  WHERE CASE WHEN sig ~ '\(' THEN p.oid=to_regprocedure(sig) ELSE p.proname=split_part(sig,'.',2) END) FROM f
UNION ALL SELECT 'acl targets', bool_and(proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
  AND prosecdef AND array_to_string(proconfig,',')='search_path=public' AND pg_get_userbyid(proowner)='postgres')
  FROM pg_proc WHERE oid IN ('public.fn_generate_receivable_from_entrega(uuid,jsonb)'::regprocedure,'public.fn_mark_entrega_not_billable(uuid,text)'::regprocedure)
UNION ALL SELECT 'gate singleton', (SELECT count(*)=1 FROM cf_user_guards_v1.state WHERE singleton)
UNION ALL SELECT 'entregas.organization_id', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='entregas' AND column_name='organization_id')
UNION ALL SELECT 'ar.organization_id', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts_receivable' AND column_name='organization_id')
UNION ALL SELECT 'categories type/active', (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='financial_categories' AND column_name IN ('type','active'))
UNION ALL SELECT 'payment_methods.active', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_methods' AND column_name='active')
UNION ALL SELECT 'ref', current_setting('cluster_name',true) IS NOT DISTINCT FROM current_setting('cluster_name',true); -- confirm ref swzpzcwiasxmjutrmvkm in the tool before running
ROLLBACK;
