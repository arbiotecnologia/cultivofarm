-- CANDIDATO P1 HELPER SOMENTE — NÃO APLICADO. RPC COCKPIT CONTINUA FECHADO.
-- Preserva ACL/owner/papéis; não modifica MV, dados, view ou operações.
-- A ACL atual observada está contida: NÃO restaurar authenticated/view SELECT.
BEGIN;
CREATE TEMP TABLE h7n_acl_baseline ON COMMIT DROP AS
 SELECT p.proacl, p.proowner FROM pg_proc p WHERE p.oid='private.h7n_esteira_laboratorio()'::regprocedure;
CREATE TEMP TABLE h7n_view_baseline ON COMMIT DROP AS
 SELECT relacl FROM pg_class WHERE oid='public.vw_esteira_laboratorio'::regclass;
DO $pre$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) IS DISTINCT FROM '6a3e2b6e2d594af67cf6727c5b03c2b1' THEN RAISE EXCEPTION 'H7N_DRIFT'; END IF;
 IF md5(pg_get_functiondef('platform_private.h15_actor_organization()'::regprocedure)) IS DISTINCT FROM '64e10608403238a41a9baf92857ca881' THEN RAISE EXCEPTION 'TENANT_HELPER_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.technical_actor_ready(uuid)'::regprocedure)) IS DISTINCT FROM 'b5d0994b6eb976b14122cd2a1ec798cf' THEN RAISE EXCEPTION 'READINESS_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.technical_client_link(uuid,uuid,text[])'::regprocedure)) IS DISTINCT FROM '1df7b9983b8dac1af06b9108eb32e7f0' THEN RAISE EXCEPTION 'ACTIVE_LINK_DRIFT'; END IF;
 IF md5(pg_get_viewdef('public.mv_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM '50e27806080f38e4adbd94f3bdf2db23' THEN RAISE EXCEPTION 'MV_DRIFT'; END IF;
 IF md5(pg_get_viewdef('public.vw_esteira_laboratorio'::regclass,true)) IS DISTINCT FROM 'd72d5df7bacffdf8f4fc4282b804ab90' THEN RAISE EXCEPTION 'VIEW_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure)) IS DISTINCT FROM '53c9fdb94780b9666ca9b602ad95a813' THEN RAISE EXCEPTION 'COCKPIT_RPC_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) IS DISTINCT FROM 'b112888e28d8a5727df713e0ae7bcd1b' THEN RAISE EXCEPTION 'CONVERTER_DRIFT'; END IF;
 IF has_function_privilege('authenticated','public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)','EXECUTE') OR has_function_privilege('anon','private.h7n_esteira_laboratorio()','EXECUTE') THEN RAISE EXCEPTION 'UNEXPECTED_READER_ACL'; END IF;
END $pre$;
CREATE OR REPLACE FUNCTION private.h7n_esteira_laboratorio()
 RETURNS SETOF public.mv_esteira_laboratorio
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.*
  from public.mv_esteira_laboratorio m
  join public.clientes c
    on c.id = m.cliente_id
   and c.organization_id is not null
   and c.organization_id = platform_private.h15_actor_organization()
  where public.technical_actor_ready(auth.uid()) IS TRUE
    and (
     public.has_role(auth.uid(), 'administrador'::public.app_role)
     or public.has_role(auth.uid(), 'gestor'::public.app_role)
     or public.has_role(auth.uid(), 'administrativo'::public.app_role)
     or public.has_role(auth.uid(), 'producao'::public.app_role)
     or public.has_role(auth.uid(), 'financeiro'::public.app_role)
     or (
       (public.has_role(auth.uid(), 'consultor_tecnico'::public.app_role)
        or public.has_role(auth.uid(), 'tecnico_agronomo'::public.app_role))
       and public.technical_client_link(auth.uid(), m.cliente_id, ARRAY['read','execute','manage']) IS TRUE
     ));
$function$;
DO $post$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN h7n_acl_baseline b WHERE p.oid='private.h7n_esteira_laboratorio()'::regprocedure AND (p.proacl IS DISTINCT FROM b.proacl OR p.proowner IS DISTINCT FROM b.proowner)) THEN RAISE EXCEPTION 'H7N_ACL_OWNER_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN h7n_view_baseline b WHERE c.oid='public.vw_esteira_laboratorio'::regclass AND c.relacl IS DISTINCT FROM b.relacl) THEN RAISE EXCEPTION 'VIEW_ACL_CHANGED'; END IF;
 IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) IS DISTINCT FROM 'b112888e28d8a5727df713e0ae7bcd1b' OR md5(pg_get_functiondef('public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure)) IS DISTINCT FROM '53c9fdb94780b9666ca9b602ad95a813' THEN RAISE EXCEPTION 'UNRELATED_RPC_CHANGED'; END IF;
END $post$;
COMMIT;
-- É proibido rollback que restaure o corpo vulnerável. Conter ACL em revisão separada, não reabrir leitores.
