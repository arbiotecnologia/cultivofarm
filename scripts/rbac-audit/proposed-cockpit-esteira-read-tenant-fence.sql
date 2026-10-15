-- CANDIDATO — NÃO APLICADO. Executar somente após revisão em swzpzcwiasxmjutrmvkm.
-- Objetivo: fechar fronteira de empresa da leitura da esteira ANTES de qualquer EXECUTE no RPC do Cockpit.
-- Não altera programar/lote/publish, conversor, dados, papéis, rotas nem MV.
BEGIN;
DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
  IF md5(pg_get_functiondef('private.h7n_esteira_laboratorio()'::regprocedure)) <> '6a3e2b6e2d594af67cf6727c5b03c2b1' THEN RAISE EXCEPTION 'H7N_DRIFT'; END IF;
  IF md5(pg_get_functiondef('public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)'::regprocedure)) <> '53c9fdb94780b9666ca9b602ad95a813' THEN RAISE EXCEPTION 'COCKPIT_RPC_DRIFT'; END IF;
  IF md5(pg_get_viewdef('public.vw_esteira_laboratorio'::regclass,true)) <> 'd72d5df7bacffdf8f4fc4282b804ab90' THEN RAISE EXCEPTION 'VIEW_DRIFT'; END IF;
  IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) <> 'b112888e28d8a5727df713e0ae7bcd1b' THEN RAISE EXCEPTION 'CONVERTER_DRIFT'; END IF;
  IF to_regprocedure('public.technical_actor_ready(uuid)') IS NULL OR to_regprocedure('public._saas_user_has_feature(uuid,text)') IS NULL THEN RAISE EXCEPTION 'DEPENDENCY_REQUIRED'; END IF;
END $pre$;

-- 1) Fonte DEFINER passa a exigir ator pronto (JWT iat, perfil/org ativos) e cliente da MESMA empresa.
--    Escopo de papéis atual preservado; nenhum papel ganha acesso.
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
  where public.technical_actor_ready(auth.uid())
    and (
     public.has_role(auth.uid(), 'administrador'::public.app_role)
     or public.has_role(auth.uid(), 'gestor'::public.app_role)
     or public.has_role(auth.uid(), 'administrativo'::public.app_role)
     or public.has_role(auth.uid(), 'producao'::public.app_role)
     or public.has_role(auth.uid(), 'financeiro'::public.app_role)
     or (
       (public.has_role(auth.uid(), 'consultor_tecnico'::public.app_role)
        or public.has_role(auth.uid(), 'tecnico_agronomo'::public.app_role))
       and m.cliente_id = any(public.get_cliente_ids_for_user(auth.uid()))
     ));
$function$;
REVOKE ALL ON FUNCTION private.h7n_esteira_laboratorio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.h7n_esteira_laboratorio() TO authenticated, service_role;
-- Higiene: anon nunca deve ler a esteira (já falhava por falta de EXECUTE na fonte).
REVOKE ALL ON public.vw_esteira_laboratorio FROM anon;

-- 2) RPC continua INVOKER; ganha gate explícito de papel da rota ∩ fonte e entitlement do plano.
--    operador_onfarm permanece sem linhas (fonte não o inclui) — não ampliado.
CREATE OR REPLACE FUNCTION public.rpc_cockpit_listar_esteira_v1(p_busca text DEFAULT NULL::text, p_stages text[] DEFAULT NULL::text[], p_origens text[] DEFAULT NULL::text[], p_prioridades text[] DEFAULT NULL::text[], p_atrasado boolean DEFAULT NULL::boolean, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_incluir_finalizadas boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_lim int := greatest(1, least(coalesce(p_limit, 50), 200)); v_off int := greatest(0, coalesce(p_offset, 0));
BEGIN
  IF v_uid IS NULL OR NOT public.technical_actor_ready(v_uid) THEN RAISE EXCEPTION 'COCKPIT_ACTOR_NOT_READY' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'COCKPIT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT public._saas_user_has_feature(v_uid,'ordens_producao') THEN RAISE EXCEPTION 'COCKPIT_NOT_ENTITLED' USING ERRCODE='42501'; END IF;
  RETURN (
  WITH base AS (
    SELECT v.os_id, v.origem_os, v.numero_os, v.cliente_id, v.cliente_nome,
           v.fazenda_id, v.fazenda_nome, v.talhao_id, v.talhao_nome,
           v.produto_id, v.produto_nome, v.microrganismo_id, v.microrganismo_nome,
           v.partner_id, v.partner_numero, v.partner_nome,
           v.titular_nome, v.titular_tipo,
           v.prioridade, v.volume_solicitado_l,
           v.status_os, v.status_esteira_oficial,
           public.fn_cockpit_stage(v.status_esteira_oficial) AS stage,
           v.programacao_id, v.data_programada, v.lote_id, v.codigo_lote, v.status_lote,
           v.cq_resultado, v.envase_id, v.estoque_id, v.estoque_reservado_id,
           v.entrega_id, v.entrega_status,
           v.atrasado, v.bloqueios, v.pode_finalizar,
           v.proxima_acao, v.created_at,
           pp.responsavel_id,
           coalesce(pr.nome, pp.responsavel) AS responsavel_nome
      FROM public.vw_esteira_laboratorio v
      LEFT JOIN public.programacao_producao pp ON pp.id = v.programacao_id
      LEFT JOIN public.profiles pr ON pr.user_id = pp.responsavel_id
     WHERE (p_incluir_finalizadas OR v.status_os <> 'finalizada')
       AND (p_origens IS NULL OR v.origem_os = ANY (p_origens))
       AND (p_prioridades IS NULL OR v.prioridade::text = ANY (p_prioridades))
       AND (p_atrasado IS NULL OR v.atrasado = p_atrasado)
       AND (p_de IS NULL OR v.created_at::date >= p_de)
       AND (p_ate IS NULL OR v.created_at::date <= p_ate)
       AND (p_stages IS NULL OR public.fn_cockpit_stage(v.status_esteira_oficial) = ANY (p_stages))
       AND (nullif(btrim(coalesce(p_busca, '')), '') IS NULL
         OR concat_ws(' ', v.numero_os, v.codigo_lote, v.cliente_nome, v.partner_nome,
                      v.titular_nome, v.fazenda_nome, v.talhao_nome, v.produto_nome,
                      v.microrganismo_nome, pp.responsavel, pr.nome)
            ILIKE '%' || btrim(p_busca) || '%')
  )
  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM base), 'limit', v_lim, 'offset', v_off,
    'items', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.atrasado DESC NULLS LAST, t.created_at DESC)
        FROM (SELECT * FROM base ORDER BY atrasado DESC NULLS LAST, created_at DESC LIMIT v_lim OFFSET v_off) t), '[]'::jsonb)));
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) TO authenticated, service_role;

-- 3) Pós-condição: operações continuam fechadas.
DO $post$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
     AND p.proname IN ('rpc_programar_os_v1','rpc_cockpit_gerar_lote_v1','publish_planning_to_lab')
     AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'OPERATIONAL_ACL_OPENED'; END IF;
  IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) <> 'b112888e28d8a5727df713e0ae7bcd1b' THEN RAISE EXCEPTION 'CONVERTER_CHANGED'; END IF;
END $post$;
COMMIT;
-- ROLLBACK seguro: restaurar apenas o RPC anterior SEM EXECUTE; NUNCA restaurar h7n sem fence de empresa.