-- READ-ONLY postflight. All true.
BEGIN TRANSACTION READ ONLY;
SELECT 'cfg+acl', bool_and(proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
  AND prosecdef AND array_to_string(proconfig,',')='search_path=public,lock_timeout=3s' AND pg_get_userbyid(proowner)='postgres')
  FROM pg_proc WHERE oid IN ('public.fn_generate_receivable_from_entrega(uuid,jsonb)'::regprocedure,'public.fn_mark_entrega_not_billable(uuid,text)'::regprocedure)
UNION ALL SELECT 'gen body markers', (SELECT prosrc ~ 'cf_user_guards_v1\.state WHERE singleton FOR UPDATE' AND prosrc ~ 'organization_id = v_org FOR UPDATE'
  AND prosrc ~ 'type = ''RECEITA''' AND prosrc ~ 'payment_methods WHERE id = v_payment_method AND active IS TRUE' AND prosrc ~ 'PT409'
  FROM pg_proc WHERE oid='public.fn_generate_receivable_from_entrega(uuid,jsonb)'::regprocedure)
UNION ALL SELECT 'mark body markers', (SELECT prosrc ~ 'cf_user_guards_v1\.state' AND prosrc ~ 'entrega_faturar:' AND prosrc ~ 'organization_id = v_org FOR UPDATE'
  FROM pg_proc WHERE oid='public.fn_mark_entrega_not_billable(uuid,text)'::regprocedure)
UNION ALL SELECT 'deps unchanged', (SELECT bool_and(md5(pg_get_functiondef(oid)) = ANY(ARRAY['6e8f2fa7b92ca7e039d092353b3ebfe2','00a9a4d4a075d756d312d69778493b39',
  'ff3688c33c7211b6c3fe60447a7728ac','5ac43dc18eee407723c0d78cd97f0db4','fe0d6a0f670787f87081fe0650102d22']))
  FROM pg_proc WHERE oid IN ('public.is_financial_staff(uuid)'::regprocedure,'public.fn_authz_uid_scope_ok(uuid)'::regprocedure,
  'public.h15_user_organization(uuid)'::regprocedure,'public.fn_entrega_valor_faturavel_v1(uuid)'::regprocedure,'public.fn_entrega_guard_faturamento_v1(uuid,numeric)'::regprocedure));
ROLLBACK;
