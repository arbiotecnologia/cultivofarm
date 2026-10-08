CREATE OR REPLACE FUNCTION public.rpc_executivo_timeline_operacional(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
 v_uid uuid := auth.uid();
 v_org uuid;
 v_filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
 v_periodo text;
 v_inicio timestamptz;
 v_fim timestamptz := pg_catalog.now();
 v_lim integer := LEAST(GREATEST(COALESCE(p_limit,20),1),100);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EXECUTIVO_AUTH_REQUIRED'; END IF;
 v_org := platform_private.h15_actor_organization();
 IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_uid AND ur.role IN ('administrador'::public.app_role,'gestor'::public.app_role)) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EXECUTIVO_ACTIVE_ACTOR_TENANT_ROLE_REQUIRED';
 END IF;
 IF pg_catalog.jsonb_typeof(v_filtros) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='EXECUTIVO_INVALID_FILTERS'; END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(v_filtros) f WHERE f.key IN ('organization_id','tenant_id','cliente_id','fazenda_id') AND f.value NOT IN ('null'::jsonb,'""'::jsonb)) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EXECUTIVO_UNPROVEN_SCOPE_FILTER';
 END IF;
 v_periodo := COALESCE(v_filtros->>'periodo','30_dias');
 IF v_periodo='personalizado' THEN
  IF NULLIF(v_filtros->>'data_inicio','') IS NULL OR NULLIF(v_filtros->>'data_fim','') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='EXECUTIVO_INVALID_PERIOD'; END IF;
  BEGIN v_inicio := (v_filtros->>'data_inicio')::timestamptz; v_fim := (v_filtros->>'data_fim')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='EXECUTIVO_INVALID_PERIOD'; END;
  IF NOT pg_catalog.isfinite(v_inicio) OR NOT pg_catalog.isfinite(v_fim) OR v_inicio>v_fim THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='EXECUTIVO_INVALID_PERIOD'; END IF;
 ELSIF v_periodo='hoje' THEN v_inicio := pg_catalog.date_trunc('day',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
 ELSIF v_periodo='7_dias' THEN v_inicio := pg_catalog.now()-interval '7 days';
 ELSIF v_periodo='15_dias' THEN v_inicio := pg_catalog.now()-interval '15 days';
 ELSIF v_periodo='safra_atual' THEN v_inicio := pg_catalog.date_trunc('year',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
 ELSE v_periodo := '30_dias'; v_inicio := pg_catalog.now()-interval '30 days'; END IF;
 -- No source is read until its ownership chain is proven; NULL legacy ownership is never inferred.
 RETURN pg_catalog.jsonb_build_object('eventos','[]'::jsonb,'periodo',pg_catalog.jsonb_build_object('data_inicio',v_inicio,'data_fim',v_fim,'periodo',v_periodo),'dados_indisponiveis',pg_catalog.jsonb_build_array('timeline_geral','solicitacoes','os','envase','entregas','alertas_operacionais'),'gerado_em',pg_catalog.now(),'organization_scoped',true,'limite',v_lim,'motivo_indisponibilidade','Fontes sem vínculo organizacional comprovado');
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_executivo_timeline_operacional(jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_timeline_operacional(jsonb,integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.rpc_executivo_timeline_operacional(jsonb,integer) IS 'EXECUTIVO-P1: active authenticated executive tenant derived server-side; unproven operational sources unavailable; never restore legacy unscoped reads.';

CREATE OR REPLACE FUNCTION public.rpc_executivo_gargalos(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
 v_uid uuid := auth.uid();
 v_org uuid;
 v_filtros jsonb := COALESCE(p_filtros,'{}'::jsonb);
 v_lim integer := LEAST(GREATEST(COALESCE(p_limit,10),1),50);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EXECUTIVO_AUTH_REQUIRED'; END IF;
 v_org := platform_private.h15_actor_organization();
 IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_uid AND ur.role IN ('administrador'::public.app_role,'gestor'::public.app_role)) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EXECUTIVO_ACTIVE_ACTOR_TENANT_ROLE_REQUIRED';
 END IF;
 IF pg_catalog.jsonb_typeof(v_filtros) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='EXECUTIVO_INVALID_FILTERS'; END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(v_filtros) f WHERE f.key IN ('organization_id','tenant_id','cliente_id','fazenda_id') AND f.value NOT IN ('null'::jsonb,'""'::jsonb)) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EXECUTIVO_UNPROVEN_SCOPE_FILTER';
 END IF;
 -- Containment mirrors the executive summary; no legacy operational or commercial records are queried.
 RETURN pg_catalog.jsonb_build_object('gargalos','[]'::jsonb,'dados_indisponiveis',pg_catalog.jsonb_build_array('os_atrasadas','entregas_sem_comprovante','entregas_nao_faturadas','embalagens_sem_etiqueta','alertas_operacionais'),'gerado_em',pg_catalog.now(),'organization_scoped',true,'limite',v_lim,'motivo_indisponibilidade','Fontes sem vínculo organizacional comprovado');
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_executivo_gargalos(jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_gargalos(jsonb,integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.rpc_executivo_gargalos(jsonb,integer) IS 'EXECUTIVO-P1: active authenticated executive tenant derived server-side; unproven operational sources unavailable; never restore legacy unscoped reads.';