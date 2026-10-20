DO $chk$
BEGIN
  IF current_database() <> 'postgres' THEN RAISE EXCEPTION 'POSTFLIGHT: banco inesperado'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_gerar_termo_v1(uuid,text)'::regprocedure)) <> '5cae3ef77dbb9a84bbc60b1bb78b465b' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em public.rpc_entrega_gerar_termo_v1(uuid,text)'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'::regprocedure)) <> '22aac68dad25313ef85fd0a86c8538be' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_cancelar_termo_v1(uuid,text)'::regprocedure)) <> 'ae8bbae2a6f509da287f48883104bbf7' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em public.rpc_entrega_cancelar_termo_v1(uuid,text)'; END IF;
  IF md5(pg_get_functiondef('public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'::regprocedure)) <> 'bba1d160952c3ff34b5c36e720384698' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'; END IF;
  IF md5(pg_get_functiondef('public.fn_entrega_build_snapshot_v1(uuid)'::regprocedure)) <> '8894facf7a2ccb32ceebb79f3d4a29be' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em public.fn_entrega_build_snapshot_v1(uuid)'; END IF;
  IF md5(pg_get_functiondef('public.fn_entrega_cobertura_v1(uuid)'::regprocedure)) <> '7a9c3bb2c9bde5e4556af89818ef8534' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em public.fn_entrega_cobertura_v1(uuid)'; END IF;
  IF md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) <> '64e10608403238a41a9baf92857ca881' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em platform_private.h15_actor_organization()'; END IF;
  IF md5(pg_get_functiondef('public.is_delivery_staff(uuid)'::regprocedure)) <> 'aa500abecc84ca8c901753c519f36fa1' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em public.is_delivery_staff(uuid)'; END IF;
  IF md5(pg_get_functiondef('platform_private.entrega_termo_tenant_ok(uuid)'::regprocedure)) <> '8ef541cf6a657757a1a615df54f12aa5' THEN
    RAISE EXCEPTION 'POSTFLIGHT: drift em platform_private.entrega_termo_tenant_ok(uuid)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_gerar_termo_v1(uuid,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL inesperada em public.rpc_entrega_gerar_termo_v1(uuid,text)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL inesperada em public.rpc_entrega_assinar_termo_v1(uuid,jsonb,text)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_cancelar_termo_v1(uuid,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL inesperada em public.rpc_entrega_cancelar_termo_v1(uuid,text)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL inesperada em public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.fn_entrega_build_snapshot_v1(uuid)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL inesperada em public.fn_entrega_build_snapshot_v1(uuid)'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'public.fn_entrega_cobertura_v1(uuid)'::regprocedure), ','), '') <> 'postgres=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL inesperada em public.fn_entrega_cobertura_v1(uuid)'; END IF;
  IF coalesce(array_to_string((SELECT relacl FROM pg_class WHERE oid = 'public.entrega_termos'::regclass), ','), '') <> 'postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL da tabela inesperada'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.entrega_termos'::regclass) THEN
    RAISE EXCEPTION 'POSTFLIGHT: RLS desligada'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos' AND policyname='entrega_termos_select'
      AND cmd='SELECT' AND permissive='PERMISSIVE' AND qual = $q$(is_delivery_staff(( SELECT auth.uid() AS uid)) OR is_financial_staff(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM entregas e
  WHERE ((e.id = entrega_termos.entrega_id) AND (e.cliente_id = ANY (get_cliente_ids_for_user(( SELECT auth.uid() AS uid))))))))$q$) <> 1 THEN
    RAISE EXCEPTION 'POSTFLIGHT: policy entrega_termos_select divergente'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos') <> 2 THEN
    RAISE EXCEPTION 'POSTFLIGHT: conjunto de policies inesperado'; END IF;
  IF NOT has_schema_privilege('authenticated','platform_private','USAGE') THEN
    RAISE EXCEPTION 'POSTFLIGHT: USAGE platform_private ausente'; END IF;
  IF (SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos' AND policyname='entrega_termos_tenant_isolation')
     IS DISTINCT FROM 'platform_private.entrega_termo_tenant_ok(entrega_id)' THEN
    RAISE EXCEPTION 'POSTFLIGHT: predicado da policy restritiva divergente'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_termos'
      AND policyname='entrega_termos_tenant_isolation' AND permissive='RESTRICTIVE' AND cmd='ALL'
      AND roles = '{authenticated}'::name[]) <> 1 THEN
    RAISE EXCEPTION 'POSTFLIGHT: policy restritiva ausente'; END IF;
  IF coalesce(array_to_string((SELECT proacl FROM pg_proc WHERE oid = 'platform_private.entrega_termo_tenant_ok(uuid)'::regprocedure), ','), '') <> 'postgres=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: ACL do helper inesperada'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'platform_private.entrega_termo_tenant_ok(uuid)'::regprocedure) IS NOT TRUE
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'platform_private.entrega_termo_tenant_ok(uuid)'::regprocedure) <> 'postgres' THEN
    RAISE EXCEPTION 'POSTFLIGHT: helper inesperado'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_gerar_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'POSTFLIGHT: rpc_entrega_gerar_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_assinar_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'POSTFLIGHT: rpc_entrega_assinar_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_cancelar_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'POSTFLIGHT: rpc_entrega_cancelar_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_entrega_registrar_pdf_termo_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'POSTFLIGHT: rpc_entrega_registrar_pdf_termo_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_entrega_build_snapshot_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'POSTFLIGHT: fn_entrega_build_snapshot_v1 sobrecarga/dono/definer'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_entrega_cobertura_v1'
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres') <> 1 THEN RAISE EXCEPTION 'POSTFLIGHT: fn_entrega_cobertura_v1 sobrecarga/dono/definer'; END IF;
END $chk$;
