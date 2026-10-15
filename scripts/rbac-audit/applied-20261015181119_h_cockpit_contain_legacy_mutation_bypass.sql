DO $pre$
BEGIN
 IF md5(pg_get_functiondef('public.fn_avancar_etapa_esteira(text,uuid,uuid,text,uuid)'::regprocedure)) <> '7ed490f667efcd6e50eb7a2a061899b6' OR md5(pg_get_functiondef('public.lab_request_replanning(uuid,text)'::regprocedure)) <> '55486998e1ad435f3e508b4d3eef7611' OR md5(pg_get_functiondef('public.refresh_esteira_laboratorio()'::regprocedure)) <> 'bbb2e580bfc6ffddfa833f950c38e0f3' THEN RAISE EXCEPTION 'FUNCTION_DRIFT'; END IF;
END $pre$;
REVOKE EXECUTE ON FUNCTION public.fn_avancar_etapa_esteira(text,uuid,uuid,text,uuid), public.lab_request_replanning(uuid,text), public.refresh_esteira_laboratorio() FROM PUBLIC,anon,authenticated;
DO $post$
DECLARE f text;r text;
BEGIN
 FOREACH f IN ARRAY ARRAY['public.fn_avancar_etapa_esteira(text,uuid,uuid,text,uuid)','public.lab_request_replanning(uuid,text)','public.refresh_esteira_laboratorio()'] LOOP
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'EXECUTE_REMAINS'; END IF;
 END LOOP;
 IF NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'SERVICE_ACCESS_LOST'; END IF;
 END LOOP;
END $post$;