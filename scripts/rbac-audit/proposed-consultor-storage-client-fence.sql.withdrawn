-- CANDIDATE ONLY. NOT APPLIED. No grants, data removal, new objects or bucket changes.
BEGIN;
-- READ-ONLY BASELINE. Canonical destination swzpzcwiasxmjutrmvkm must be verified
-- externally (supabase/config.toml AND tool binding) before running this query.
-- Run inside the same transaction immediately before candidate DDL.
SELECT 1 / CASE WHEN
 md5(pg_get_functiondef('platform_private.storage1_consultor_core(text,text)'::regprocedure))='5c9e435c51d19d1dcbf5d61a9095daf3'
 AND (SELECT md5(string_agg(concat_ws('|',policyname,permissive,roles::text,cmd,qual,with_check),E'\n' ORDER BY policyname)) FROM pg_policies WHERE schemaname='storage' AND tablename='objects')='cfbc909356cc3e420d66efac99e69ba6'
 AND (SELECT proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='platform_private.storage1_consultor_core(text,text)'::regprocedure)
 AND EXISTS(SELECT 1 FROM storage.buckets WHERE id='consultor-arquivos' AND public IS FALSE)
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
 AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='registros_consultor_arquivos' AND column_name IN ('arquivo_path','registro_consultor_id') AND udt_name IN ('text','uuid'))=2
 THEN 1 ELSE 0 END AS baseline_assertion;
CREATE OR REPLACE FUNCTION platform_private.storage1_consultor_core(p_name text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_id uuid; v_client uuid; v_status text;
BEGIN
 IF auth.uid() IS NULL OR p_action IS NULL OR NOT public.storage1_path_strict(p_name) OR p_action NOT IN ('select','insert','update','delete') THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization(); IF v_org IS NULL THEN RETURN false; END IF;
 IF p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(foto|audio|documento)/[A-Za-z0-9_.-]+$' OR split_part(p_name,'/',1)<>v_org::text THEN RETURN false; END IF;
 BEGIN v_id:=split_part(p_name,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT r.cliente_id,r.status::text INTO v_client,v_status FROM public.registros_consultor r JOIN public.clientes c ON c.id=r.cliente_id AND c.organization_id=v_org WHERE r.id=v_id;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Producer reads require a unique persisted reference to this exact path and
 -- this exact visit. Object metadata/owner/user_metadata never establish scope.
 -- Internal upload->list->metadata order is unchanged; producers cannot mutate.
 IF public.has_role(auth.uid(),'cliente_produtor') THEN
  IF p_action <> 'select' OR v_status NOT IN ('aprovado','finalizado','convertido_os')
  OR NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id=v_client
       AND c.organization_id=v_org AND c.status_cliente::text='ativo')
  OR v_client=ANY(public.get_cliente_ids_for_user(auth.uid())) IS NOT TRUE
  OR (SELECT count(*) FROM public.registros_consultor_arquivos a
       WHERE a.arquivo_path=p_name) <> 1
  OR NOT EXISTS (SELECT 1 FROM public.registros_consultor_arquivos a
       WHERE a.arquivo_path=p_name AND a.registro_consultor_id=v_id)
  THEN RETURN false; END IF;
 END IF;
 IF p_action='select' THEN RETURN public.technical_child_read_scope(v_id) AND ((public.has_role(auth.uid(),'cliente_produtor') AND v_client=ANY(public.get_cliente_ids_for_user(auth.uid()))) OR ((public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'tecnico_agronomo') OR public.has_role(auth.uid(),'aplicador')) AND public.can_view_technical_visit(auth.uid(),v_id))); END IF;
 RETURN v_status IN ('rascunho','em_andamento') AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'tecnico_agronomo') OR public.has_role(auth.uid(),'aplicador')) AND public.can_manage_technical_visit(auth.uid(),v_id);
END; $function$;
-- Reviewer: compare owner/ACL unchanged; all 33 policies remain byte-identical.
COMMIT;
