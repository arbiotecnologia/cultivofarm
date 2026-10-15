DO $patch$
DECLARE d text; old_acl aclitem[]; old_owner oid;
 old_text text := '''can_convert_os'', (v_is_admin OR v_is_manager)';
 new_text text := '''can_convert_os'', (v_can_manage IS TRUE AND v_reg.status::text = ''aprovado'')';
BEGIN
 SELECT pg_get_functiondef(oid),proacl,proowner INTO d,old_acl,old_owner FROM pg_proc WHERE oid='public.rpc_get_visita_workspace(uuid)'::regprocedure;
 IF md5(d) IS DISTINCT FROM 'a7aae6129f13b63907ef9bb8fe6454e6' THEN RAISE EXCEPTION 'WORKSPACE_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) IS DISTINCT FROM 'b112888e28d8a5727df713e0ae7bcd1b' THEN RAISE EXCEPTION 'CONVERTER_DRIFT'; END IF;
 IF (length(d)-length(replace(d,old_text,'')))/length(old_text) <> 1 THEN RAISE EXCEPTION 'EXPECTED_SINGLE_GATE'; END IF;
 EXECUTE replace(d,old_text,new_text);
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.rpc_get_visita_workspace(uuid)'::regprocedure AND (proacl IS DISTINCT FROM old_acl OR proowner IS DISTINCT FROM old_owner)) THEN RAISE EXCEPTION 'WORKSPACE_ACL_DRIFT'; END IF;
 IF position(new_text in pg_get_functiondef('public.rpc_get_visita_workspace(uuid)'::regprocedure))=0 THEN RAISE EXCEPTION 'GATE_PATCH_FAILED'; END IF;
END $patch$;