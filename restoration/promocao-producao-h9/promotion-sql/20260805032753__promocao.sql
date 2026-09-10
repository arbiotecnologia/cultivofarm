-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260805032753_27aed0e3-3075-48cf-9139-3e8c94b82148.sql
-- SHA-256 orig: 9f1b2d8cf422ca3fedf4e05543547a80a2e818eee9efb03a47f9bf1f6ccfcad4
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- [guarda de homologação removida pelo gerador de promoção]


CREATE OR REPLACE FUNCTION public.rpc_listar_atendimentos_tecnicos_v1(
  p_aba text DEFAULT 'todos'::text,
  p_search text DEFAULT NULL::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_tech boolean;
  v_page integer := GREATEST(COALESCE(p_page,1),1);
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size,20),1),100);
  v_aba text := lower(COALESCE(NULLIF(btrim(p_aba),''),'todos'));
  v_q text := NULLIF(btrim(COALESCE(p_search,'')),'');
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
  c_abas constant text[] := ARRAY['todos','demandas','ocorrencias','andamento','aguardando','monitoramento','concluidos'];
BEGIN
  IF NOT (v_aba = ANY (c_abas)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_tab',
      'items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error','unauthenticated',
      'items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  v_is_admin := public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor');
  v_is_tech := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('tecnico_agronomo','consultor_tecnico')
  );

  IF NOT (v_is_admin OR v_is_tech) THEN
    RETURN jsonb_build_object('ok', false, 'error','forbidden',
      'items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  WITH base AS (
    SELECT
      'visita'::text AS kind,
      r.id,
      r.codigo_visita AS codigo,
      COALESCE(NULLIF(r.objetivo_visita,''), NULLIF(r.problema_principal,''), 'Atendimento técnico') AS titulo,
      r.status::text AS status,
      r.origem_atendimento AS origem,
      c.nome AS cliente_nome,
      f.nome AS fazenda_nome,
      t.nome AS talhao_nome,
      cu.nome AS cultura_nome,
      r.tipo_visita::text AS tipo,
      r.urgencia::text AS urgencia,
      pr.nome AS responsavel_nome,
      r.data_proxima_visita::timestamptz AS data_prevista,
      CASE
        WHEN r.status = 'rascunho' AND r.cultura_id IS NULL THEN 'Informar cultura'
        WHEN r.status IN ('rascunho','em_andamento') THEN 'Continuar preenchimento'
        WHEN r.status = 'enviado_aprovacao' THEN 'Aguardando aprovação'
        WHEN r.status = 'reprovado' THEN 'Revisar e reenviar'
        WHEN r.status IN ('aprovado','convertido_os') AND r.data_proxima_visita IS NOT NULL THEN 'Retorno programado'
        ELSE 'Sem ação pendente'
      END AS proxima_acao,
      COALESCE(r.data_vistoria::timestamptz, r.created_at) AS data_ref,
      (r.status IN ('rascunho','em_andamento','reprovado')
        AND public.can_manage_technical_visit(v_uid, r.id)) AS can_edit,
      '/app/visita/' || r.id::text AS next_route,
      CASE
        WHEN r.status IN ('rascunho','em_andamento') THEN 'andamento'
        WHEN r.status IN ('enviado_aprovacao','reprovado') THEN 'aguardando'
        WHEN r.status IN ('aprovado','convertido_os') AND r.data_proxima_visita IS NOT NULL THEN 'monitoramento'
        ELSE 'concluidos'
      END AS bucket
    FROM public.registros_consultor r
    LEFT JOIN public.clientes c  ON c.id = r.cliente_id
    LEFT JOIN public.fazendas f  ON f.id = r.fazenda_id
    LEFT JOIN public.talhoes  t  ON t.id = r.talhao_id
    LEFT JOIN public.culturas cu ON cu.id = r.cultura_id
    LEFT JOIN public.profiles pr ON pr.user_id = r.consultor_responsavel
    WHERE public.can_view_technical_visit(v_uid, r.id)
      AND (v_q IS NULL OR (
        COALESCE(r.codigo_visita,'') ILIKE '%'||v_q||'%'
        OR COALESCE(r.objetivo_visita,'') ILIKE '%'||v_q||'%'
        OR COALESCE(r.problema_principal,'') ILIKE '%'||v_q||'%'
        OR COALESCE(c.nome,'') ILIKE '%'||v_q||'%'
        OR COALESCE(f.nome,'') ILIKE '%'||v_q||'%'
      ))

    UNION ALL

    SELECT
      'demanda'::text,
      s.id,
      s.numero_solicitacao,
      COALESCE(NULLIF(s.descricao,''), s.tipo_demanda, 'Demanda do produtor'),
      s.status,
      'solicitacao_produtor',
      c.nome, f.nome, t.nome, NULL::text,
      s.tipo_demanda,
      s.urgencia,
      pr.nome,
      s.data_prevista_atendimento,
      'Abrir atendimento'::text,
      COALESCE(s.data_prevista_atendimento, s.created_at),
      true,
      '/app/atendimentos?demanda=' || s.id::text,
      'demandas'
    FROM public.portal_solicitacoes s
    LEFT JOIN public.clientes c  ON c.id = s.cliente_id
    LEFT JOIN public.fazendas f  ON f.id = s.fazenda_id
    LEFT JOIN public.talhoes  t  ON t.id = s.talhao_id
    LEFT JOIN public.profiles pr ON pr.user_id = s.consultor_atribuido
    WHERE s.status NOT IN ('concluida','cancelada')
      AND NOT EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.solicitacao_id = s.id)
      AND (v_is_admin OR s.consultor_atribuido = v_uid)
      AND (v_q IS NULL OR (
        COALESCE(s.numero_solicitacao,'') ILIKE '%'||v_q||'%'
        OR COALESCE(s.descricao,'') ILIKE '%'||v_q||'%'
        OR COALESCE(c.nome,'') ILIKE '%'||v_q||'%'
        OR COALESCE(f.nome,'') ILIKE '%'||v_q||'%'
      ))
  ),
  filtrado AS (
    SELECT * FROM base b
     WHERE v_aba = 'todos'
        OR (v_aba = 'ocorrencias' AND b.kind = 'visita' AND b.origem = 'ocorrencia_campo')
        OR (v_aba <> 'ocorrencias' AND v_aba = b.bucket)
  ),
  contagem AS (SELECT count(*) AS n FROM filtrado),
  pagina AS (
    SELECT * FROM filtrado ORDER BY data_ref DESC NULLS LAST LIMIT v_size OFFSET (v_page-1)*v_size
  )
  SELECT (SELECT n FROM contagem),
         COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.data_ref DESC NULLS LAST) FROM pagina p), '[]'::jsonb)
    INTO v_total, v_items;

  RETURN jsonb_build_object(
    'ok', true,
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'has_more', (v_page * v_size) < v_total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_resumo_atendimentos_tecnicos_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_tech boolean;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error','unauthenticated');
  END IF;

  v_is_admin := public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor');
  v_is_tech := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('tecnico_agronomo','consultor_tecnico')
  );
  IF NOT (v_is_admin OR v_is_tech) THEN
    RETURN jsonb_build_object('ok', false, 'error','forbidden');
  END IF;

  WITH visitas AS (
    SELECT r.id, r.status::text AS status, r.origem_atendimento AS origem,
           r.data_proxima_visita, r.fazenda_id
      FROM public.registros_consultor r
     WHERE public.can_view_technical_visit(v_uid, r.id)
  ),
  demandas AS (
    SELECT s.id
      FROM public.portal_solicitacoes s
     WHERE s.status NOT IN ('concluida','cancelada')
       AND NOT EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.solicitacao_id = s.id)
       AND (v_is_admin OR s.consultor_atribuido = v_uid)
  )
  SELECT jsonb_build_object(
    'ok', true,
    'demandas', (SELECT count(*) FROM demandas),
    'em_andamento', (SELECT count(*) FROM visitas WHERE status IN ('rascunho','em_andamento')),
    'aguardando', (SELECT count(*) FROM visitas WHERE status IN ('enviado_aprovacao','reprovado')),
    'monitoramento', (SELECT count(*) FROM visitas WHERE status IN ('aprovado','convertido_os') AND data_proxima_visita IS NOT NULL),
    'ocorrencias', (SELECT count(*) FROM visitas WHERE origem = 'ocorrencia_campo'),
    'concluidos', (SELECT count(*) FROM visitas
                    WHERE status NOT IN ('rascunho','em_andamento','enviado_aprovacao','reprovado')
                      AND NOT (status IN ('aprovado','convertido_os') AND data_proxima_visita IS NOT NULL)),
    'todos', (SELECT count(*) FROM visitas) + (SELECT count(*) FROM demandas),
    'os_ativas', (SELECT count(*) FROM public.ordens_servico_onfarm os
                   WHERE os.status NOT IN ('finalizada','entregue','cancelada')
                     AND os.registro_consultor_id IN (SELECT id FROM visitas)),
    'fazendas', (SELECT count(DISTINCT fazenda_id) FROM visitas WHERE fazenda_id IS NOT NULL)
  ) INTO v_res;

  RETURN v_res;
END;
$function$;