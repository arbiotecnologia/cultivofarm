DO $chk$
BEGIN
  IF current_database() <> 'postgres' THEN RAISE EXCEPTION 'PREFLIGHT: banco inesperado'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_gerar_termo_v1(uuid,text)'::regprocedure)) <> '90d3bd16e7629970a8733ee77da71e2f' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em public.rpc_entrega_gerar_termo_v1(uuid,text)'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'::regprocedure)) <> '01c59220d0c975addcde29d5945a7ae0' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_cancelar_termo_v1(uuid,text)'::regprocedure)) <> 'ee9f7c2c46e07fcba5e8c516d3934700' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em public.rpc_entrega_cancelar_termo_v1(uuid,text)'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'::regprocedure)) <> 'bba1d160952c3ff34b5c36e720384698' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'; END IF;
  IF md5(pg_get_functiondef('public.fn_entrega_build_snapshot_v1(uuid)'::regprocedure)) <> '8894facf7a2ccb32ceebb79f3d4a29be' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em public.fn_entrega_build_snapshot_v1(uuid)'; END IF;
  IF md5(pg_get_functiondef('public.fn_entrega_cobertura_v1(uuid)'::regprocedure)) <> '7a9c3bb2c9bde5e4556af89818ef8534' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em public.fn_entrega_cobertura_v1(uuid)'; END IF;
  IF md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) <> '64e10608403238a41a9baf92857ca881' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em platform_private.h15_actor_organization()'; END IF;
  IF md5(pg_get_functiondef('public.is_delivery_staff(uuid)'::regprocedure)) <> 'aa500abecc84ca8c901753c519f36fa1' THEN
    RAISE EXCEPTION 'PREFLIGHT: drift em public.is_delivery_staff(uuid)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_gerar_termo_v1(uuid,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT: ACL inesperada em public.rpc_entrega_gerar_termo_v1(uuid,text)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT: ACL inesperada em public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_cancelar_termo_v1(uuid,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT: ACL inesperada em public.rpc_entrega_cancelar_termo_v1(uuid,text)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.fn_entrega_build_snapshot_v1(uuid)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT: ACL inesperada em public.fn_entrega_build_snapshot_v1(uuid)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.fn_entrega_cobertura_v1(uuid)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT: ACL inesperada em public.fn_entrega_cobertura_v1(uuid)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT: ACL inesperada em public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'; END IF;
  IF coalesce(array_to_string((SELECT relacl FROM pg_class WHERE oid = 'public.entrega_termos'::regclass), ','), '') <> 'postgres=arwdDxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT: ACL da tabela inesperada'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.entrega_termos'::regclass) THEN
    RAISE EXCEPTION 'PREFLIGHT: RLS desligada'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos' AND policyname='entrega_termos_select'
      AND cmd='SELECT' AND permissive='PERMISSIVE' AND qual = $q$(is_delivery_staff(( SELECT auth.uid() AS uid)) OR is_financial_staff(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM entregas e
  WHERE ((e.id = entrega_termos.entrega_id) AND (e.cliente_id = ANY (get_cliente_ids_for_user(( SELECT auth.uid() AS uid))))))))$q$) <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT: policy entrega_termos_select divergente'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos') <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT: conjunto de policies inesperado'; END IF;
  IF to_regprocedure('platform_private.entrega_termo_tenant_ok(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT: helper já existe'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_gerar_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'PREFLIGHT: rpc_entrega_gerar_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_assinar_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'PREFLIGHT: rpc_entrega_assinar_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_cancelar_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'PREFLIGHT: rpc_entrega_cancelar_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_registrar_pdf_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'PREFLIGHT: rpc_entrega_registrar_pdf_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_entrega_build_snapshot_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'PREFLIGHT: fn_entrega_build_snapshot_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_entrega_cobertura_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'PREFLIGHT: fn_entrega_cobertura_v1 sobrecarga/dono/definer'; END IF;
END $chk$;
