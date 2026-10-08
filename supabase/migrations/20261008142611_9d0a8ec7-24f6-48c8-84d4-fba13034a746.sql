CREATE OR REPLACE FUNCTION public.aplicacao_storage_path_permitido(_name text,_modo text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(platform_private.storage1_application_allowed(_name,_modo),false)
 AND CASE WHEN _modo='insert' THEN public.can_user_create_aplicacao_for_cliente(CASE WHEN public.storage1_path_strict(_name) AND split_part(_name,'/',1) ~ '^[0-9a-f-]{36}$' THEN split_part(_name,'/',1)::uuid ELSE NULL END) ELSE true END;
$$;
REVOKE ALL ON FUNCTION public.aplicacao_storage_path_permitido(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aplicacao_storage_path_permitido(text,text) TO authenticated,service_role;
ALTER POLICY aplicacao_evidencias_storage_delete ON storage.objects USING (bucket_id='aplicacao-evidencias' AND public.aplicacao_storage_path_permitido(name,'delete'));
DO $$ DECLARE v_sig text; v_def text; BEGIN
 FOREACH v_sig IN ARRAY ARRAY['public.financial_storage_object_permitted(text,text)','public.cliente_storage_object_permitted(text)'] LOOP
  SELECT pg_get_functiondef(v_sig::regprocedure) INTO v_def;
  IF position('public.storage1_path_strict(_name)' IN v_def)=0 THEN
   IF position('BEGIN' IN v_def)=0 THEN RAISE EXCEPTION 'STORAGE1_UNEXPECTED_HELPER_STRUCTURE'; END IF;
   v_def:=replace(v_def,'BEGIN',E'BEGIN\n  IF NOT public.storage1_path_strict(_name) THEN RETURN false; END IF;');
   EXECUTE v_def;
  END IF;
 END LOOP;
END $$;