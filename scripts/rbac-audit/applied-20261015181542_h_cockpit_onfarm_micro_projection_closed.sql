DO $fix$
DECLARE d text; a aclitem[]; o oid; opts text[];
BEGIN
 SELECT pg_get_viewdef(c.oid,true),c.relacl,c.relowner,c.reloptions INTO d,a,o,opts FROM pg_class c WHERE c.oid='public.vw_os_integridade_esteira'::regclass;
 IF md5(d)<>'865cd98310a4893ce0d930454300e0ab' THEN RAISE EXCEPTION 'VIEW_DRIFT'; END IF;
 IF (length(d)-length(replace(d,'NULL::uuid AS microrganismo_id','')))/length('NULL::uuid AS microrganismo_id') <> 1 THEN RAISE EXCEPTION 'EXPECTED_SINGLE_ONFARM_PROJECTION'; END IF;
 EXECUTE 'CREATE OR REPLACE VIEW public.vw_os_integridade_esteira WITH (security_invoker=true) AS ' || replace(d,'NULL::uuid AS microrganismo_id','ofa.microrganismo_id');
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid='public.vw_os_integridade_esteira'::regclass AND (relacl IS DISTINCT FROM a OR relowner IS DISTINCT FROM o OR reloptions IS DISTINCT FROM opts)) THEN RAISE EXCEPTION 'VIEW_SECURITY_CHANGED'; END IF;
 IF position('ofa.microrganismo_id' in pg_get_viewdef('public.vw_os_integridade_esteira'::regclass,true))=0 THEN RAISE EXCEPTION 'PROJECTION_MISSING'; END IF;
END $fix$;
REFRESH MATERIALIZED VIEW public.mv_esteira_laboratorio;
DO $check$
BEGIN
 IF EXISTS (SELECT 1 FROM public.ordens_servico_onfarm o JOIN public.vw_os_integridade_esteira v ON v.origem_os='onfarm' AND v.os_id=o.id WHERE v.microrganismo_id IS DISTINCT FROM o.microrganismo_id) THEN RAISE EXCEPTION 'MICRO_PROJECTION_MISMATCH'; END IF;
 IF has_table_privilege('authenticated','public.mv_esteira_laboratorio','SELECT') OR has_table_privilege('authenticated','public.vw_esteira_laboratorio','SELECT') THEN RAISE EXCEPTION 'CONTAINMENT_CHANGED'; END IF;
END $check$;