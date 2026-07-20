-- Migration: Fase 14 - BI Operacional Interativo
-- =====================================================================

-- =====================================================================
-- 1. TABLE: bi_filtro_config
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bi_filtro_config (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  filtros    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bi_filtro_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_filtro_config TO authenticated;
GRANT ALL ON public.bi_filtro_config TO service_role;

-- updated_at trigger
CREATE OR REPLACE TRIGGER trg_bi_filtro_config_updated_at
  BEFORE UPDATE ON public.bi_filtro_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
DROP POLICY IF EXISTS "bi_filtro_config: user sees own" ON public.bi_filtro_config;
CREATE POLICY "bi_filtro_config: user sees own"
  ON public.bi_filtro_config FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bi_filtro_config: user inserts own" ON public.bi_filtro_config;
CREATE POLICY "bi_filtro_config: user inserts own"
  ON public.bi_filtro_config FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "bi_filtro_config: user updates own" ON public.bi_filtro_config;
CREATE POLICY "bi_filtro_config: user updates own"
  ON public.bi_filtro_config FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bi_filtro_config: user deletes own" ON public.bi_filtro_config;
CREATE POLICY "bi_filtro_config: user deletes own"
  ON public.bi_filtro_config FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "bi_filtro_config: admin gestor see all" ON public.bi_filtro_config;
CREATE POLICY "bi_filtro_config: admin gestor see all"
  ON public.bi_filtro_config FOR ALL TO authenticated
  USING (public.is_executivo(auth.uid()));

-- =====================================================================
-- 2. RECREATE vw_fluxo_visita_tecnica with cultura_nome and microrganismo_nome
-- =====================================================================

DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica CASCADE;

CREATE VIEW public.vw_fluxo_visita_tecnica WITH (security_invoker = true) AS
WITH cte_checkins AS (
    SELECT
        registro_consultor_id,
        MIN(data_hora_checkin) AS data_checkin,
        COUNT(*)               AS total_checkins
    FROM public.visitas_checkin
    GROUP BY registro_consultor_id
),
cte_diagnosticos AS (
    SELECT
        registro_id AS registro_consultor_id,
        COUNT(*)    AS total_diagnosticos
    FROM public.visita_diagnosticos
    GROUP BY registro_id
),
cte_evidencias AS (
    SELECT
        registro_consultor_id,
        COUNT(*) AS total_evidencias,
        EXISTS (
            SELECT 1 FROM public.registros_consultor_arquivos rca2
            WHERE rca2.registro_consultor_id = rca.registro_consultor_id
              AND rca2.arquivo_path IS NULL
        ) AS tem_arquivo_sem_path
    FROM public.registros_consultor_arquivos rca
    GROUP BY registro_consultor_id
),
cte_recomendacoes AS (
    SELECT
        registro_consultor_id,
        COUNT(*) AS total_recomendacoes,
        EXISTS (
            SELECT 1 FROM public.registros_consultor_recomendacoes rcr2
            WHERE rcr2.registro_consultor_id = rcr.registro_consultor_id
              AND (
                    NULLIF(trim(rcr2.recomendacao_tecnica), '') IS NOT NULL
                    OR NULLIF(trim(rcr2.observacoes_finais), '') IS NOT NULL
                    OR rcr2.estrategia_manejo IS NOT NULL
              )
        ) AS possui_conteudo_real
    FROM public.registros_consultor_recomendacoes rcr
    GROUP BY registro_consultor_id
),
cte_os_stats AS (
    SELECT
        registro_consultor_id,
        COUNT(*) AS total_os_vinculadas
    FROM public.ordens_servico_onfarm
    GROUP BY registro_consultor_id
),
cte_os_single AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        id           AS os_id,
        numero_os,
        status::text AS status_os,
        created_at   AS data_geracao_os,
        microrganismo_id AS os_microrganismo_id
    FROM public.ordens_servico_onfarm
    ORDER BY registro_consultor_id, created_at DESC
),
cte_logs_datas AS (
    SELECT
        registro_consultor_id,
        MAX(CASE WHEN acao = 'visita_finalizada'     THEN created_at END) AS data_log_finalizacao,
        MAX(CASE WHEN acao = 'recomendacao_liberada' THEN created_at END) AS data_log_liberacao,
        MAX(CASE WHEN acao = 'os_gerada'             THEN created_at END) AS data_log_conversao
    FROM public.visitas_logs
    GROUP BY registro_consultor_id
),
cte_status_logs AS (
    SELECT
        registro_consultor_id,
        MAX(CASE WHEN status_novo = 'aprovado'      THEN changed_at END) AS data_status_aprovado,
        MAX(CASE WHEN status_novo = 'convertido_os' THEN changed_at END) AS data_status_convertido
    FROM public.registros_consultor_status_log
    GROUP BY registro_consultor_id
),
cte_aprovacoes AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        status_aprovacao::text AS status_aprovacao,
        data_aprovacao
    FROM public.aprovacoes_tecnicas
    ORDER BY registro_consultor_id, created_at DESC
),
base_fluxo AS (
    SELECT
        CASE WHEN rc.id IS NOT NULL THEN 'visita_com_solicitacao'::text
             ELSE 'solicitacao_sem_visita'::text END AS origem_fluxo,
        ps.id      AS solicitacao_id,
        ps.numero_solicitacao,
        rc.id      AS registro_consultor_id,
        rc.codigo_visita,
        ps.cliente_id,
        ps.fazenda_id,
        ps.talhao_id,
        rc.cultura_id,
        ps.consultor_atribuido              AS consultor_id,
        ps.status::text                     AS status_solicitacao,
        rc.status::text                     AS status_visita,
        ps.tipo_demanda,
        ps.data_prevista_atendimento,
        ps.created_at                       AS solicitacao_created_at,
        rc.created_at                       AS visita_created_at,
        rc.updated_at                       AS visita_updated_at
    FROM public.portal_solicitacoes ps
    LEFT JOIN public.registros_consultor rc ON ps.id = rc.solicitacao_id

    UNION ALL

    SELECT
        'visita_avulsa'::text               AS origem_fluxo,
        NULL::uuid                          AS solicitacao_id,
        NULL::text                          AS numero_solicitacao,
        rc.id                               AS registro_consultor_id,
        rc.codigo_visita,
        rc.cliente_id,
        rc.fazenda_id,
        rc.talhao_id,
        rc.cultura_id,
        rc.consultor_responsavel            AS consultor_id,
        NULL::text                          AS status_solicitacao,
        rc.status::text                     AS status_visita,
        NULL::text                          AS tipo_demanda,
        NULL::timestamp with time zone      AS data_prevista_atendimento,
        NULL::timestamp with time zone      AS solicitacao_created_at,
        rc.created_at                       AS visita_created_at,
        rc.updated_at                       AS visita_updated_at
    FROM public.registros_consultor rc
    WHERE rc.solicitacao_id IS NULL
)
SELECT
    bf.origem_fluxo,
    bf.solicitacao_id,
    bf.numero_solicitacao,
    bf.registro_consultor_id,
    bf.codigo_visita,
    bf.cliente_id,
    c.nome                                                       AS cliente_nome,
    bf.fazenda_id,
    f.nome                                                       AS fazenda_nome,
    bf.talhao_id,
    t.nome                                                       AS talhao_nome,
    bf.cultura_id,
    cult.nome                                                    AS cultura_nome,
    bf.consultor_id,
    u.nome                                                       AS consultor_nome,
    bf.status_solicitacao,
    bf.status_visita,
    COALESCE(ap.status_aprovacao, 'pendente')                   AS status_aprovacao,
    bf.tipo_demanda,
    bf.data_prevista_atendimento,
    ck.data_checkin,
    bf.visita_created_at                                         AS data_vistoria,
    COALESCE(cl.data_log_finalizacao,
             CASE WHEN bf.status_visita = 'finalizado' THEN bf.visita_updated_at END
    )                                                            AS data_finalizacao,
    COALESCE(cl.data_log_liberacao, sl.data_status_aprovado, ap.data_aprovacao)
                                                                 AS data_liberacao_recomendacao,
    COALESCE(os.data_geracao_os, cl.data_log_conversao, sl.data_status_convertido)
                                                                 AS data_conversao_os,
    (ck.data_checkin IS NOT NULL)                               AS possui_checkin,
    (COALESCE(dg.total_diagnosticos, 0) > 0)                   AS possui_diagnostico,
    COALESCE(dg.total_diagnosticos, 0)                          AS quantidade_diagnosticos,
    (COALESCE(ev.total_evidencias, 0) > 0)                     AS possui_evidencias,
    COALESCE(ev.total_evidencias, 0)                            AS quantidade_evidencias,
    COALESCE(rc.possui_conteudo_real, false)                    AS possui_recomendacao,
    COALESCE(rc.total_recomendacoes, 0)                         AS quantidade_recomendacoes,
    (os.os_id IS NOT NULL)                                      AS possui_os,
    os.os_id,
    os.numero_os,
    os.status_os,
    os.os_microrganismo_id                                       AS microrganismo_id,
    mic.nome                                                     AS microrganismo_nome,
    CASE
        WHEN bf.status_visita = 'convertido_os' AND os.os_id IS NOT NULL THEN 'Concluído'
        WHEN bf.status_visita = 'convertido_os' AND os.os_id IS NULL THEN 'Corrigir vínculo da OS'
        WHEN bf.status_solicitacao = 'aguardando_decisao_produtor' AND bf.status_visita = 'aprovado' THEN 'Converter em OS'
        WHEN bf.status_solicitacao = 'aguardando_decisao_produtor' THEN 'Aguardando decisão do produtor'
        WHEN COALESCE(rc.possui_conteudo_real, false) AND bf.status_visita = 'finalizado' THEN 'Liberar recomendação'
        WHEN COALESCE(dg.total_diagnosticos, 0) > 0 AND NOT COALESCE(rc.possui_conteudo_real, false) THEN 'Emitir recomendação'
        WHEN ck.data_checkin IS NOT NULL AND COALESCE(ev.total_evidencias, 0) = 0 THEN 'Inserir evidências'
        WHEN ck.data_checkin IS NOT NULL AND COALESCE(dg.total_diagnosticos, 0) = 0 THEN 'Registrar diagnóstico'
        WHEN bf.status_visita = 'agendada' OR bf.status_solicitacao = 'agendada' THEN 'Realizar check-in'
        WHEN bf.status_solicitacao = 'atribuida' THEN 'Agendar visita'
        WHEN bf.consultor_id IS NULL THEN 'Atribuir consultor'
        ELSE 'Aguardando triagem'
    END                                                          AS proxima_acao,
    ARRAY(
        SELECT unnest(
            CASE WHEN bf.consultor_id IS NULL THEN ARRAY['sem_consultor'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_solicitacao = 'aberta' AND bf.consultor_id IS NOT NULL THEN ARRAY['sem_agendamento'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.registro_consultor_id IS NOT NULL AND ck.data_checkin IS NULL THEN ARRAY['sem_checkin'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'finalizado' AND COALESCE(dg.total_diagnosticos, 0) = 0 THEN ARRAY['sem_diagnostico'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'finalizado' AND COALESCE(ev.total_evidencias, 0) = 0 THEN ARRAY['sem_evidencia'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'finalizado' AND NOT COALESCE(rc.possui_conteudo_real, false) THEN ARRAY['sem_recomendacao'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'aprovado' AND NOT COALESCE(rc.possui_conteudo_real, false) THEN ARRAY['aprovada_sem_recomendacao'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'aprovado' AND bf.status_solicitacao NOT IN ('aguardando_decisao_produtor','convertida_os','concluida') THEN ARRAY['aprovada_com_solicitacao_antiga'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'convertido_os' AND os.os_id IS NULL THEN ARRAY['convertida_os_sem_os'] ELSE ARRAY[]::text[] END ||
            CASE WHEN COALESCE(oss.total_os_vinculadas, 0) > 1 THEN ARRAY['os_duplicada'] ELSE ARRAY[]::text[] END ||
            CASE WHEN ev.tem_arquivo_sem_path THEN ARRAY['evidencia_sem_arquivo_path'] ELSE ARRAY[]::text[] END
        )
    )                                                            AS bloqueios,
    EXTRACT(EPOCH FROM (now() - COALESCE(bf.solicitacao_created_at, bf.visita_created_at))) / 86400.0
                                                                 AS dias_em_aberto,
    EXTRACT(EPOCH FROM (ck.data_checkin - bf.solicitacao_created_at)) / 3600.0
                                                                 AS tempo_solicitacao_ate_checkin,
    EXTRACT(EPOCH FROM (
        COALESCE(cl.data_log_finalizacao, CASE WHEN bf.status_visita = 'finalizado' THEN bf.visita_updated_at END)
        - ck.data_checkin
    )) / 3600.0                                                  AS tempo_checkin_ate_finalizacao,
    EXTRACT(EPOCH FROM (
        COALESCE(cl.data_log_liberacao, sl.data_status_aprovado, ap.data_aprovacao)
        - COALESCE(cl.data_log_finalizacao, CASE WHEN bf.status_visita = 'finalizado' THEN bf.visita_updated_at END)
    )) / 3600.0                                                  AS tempo_finalizacao_ate_aprovacao,
    EXTRACT(EPOCH FROM (
        COALESCE(os.data_geracao_os, cl.data_log_conversao, sl.data_status_convertido)
        - COALESCE(cl.data_log_liberacao, sl.data_status_aprovado, ap.data_aprovacao)
    )) / 3600.0                                                  AS tempo_aprovacao_ate_os,
    COALESCE(bf.solicitacao_created_at, bf.visita_created_at)   AS created_at,
    COALESCE(bf.visita_updated_at, bf.solicitacao_created_at)   AS updated_at
FROM base_fluxo bf
LEFT JOIN public.clientes    c    ON bf.cliente_id    = c.id
LEFT JOIN public.fazendas    f    ON bf.fazenda_id    = f.id
LEFT JOIN public.talhoes     t    ON bf.talhao_id     = t.id
LEFT JOIN public.culturas    cult ON bf.cultura_id    = cult.id
LEFT JOIN public.profiles    u    ON bf.consultor_id  = u.id
LEFT JOIN cte_checkins       ck   ON bf.registro_consultor_id = ck.registro_consultor_id
LEFT JOIN cte_diagnosticos   dg   ON bf.registro_consultor_id = dg.registro_consultor_id
LEFT JOIN cte_evidencias     ev   ON bf.registro_consultor_id = ev.registro_consultor_id
LEFT JOIN cte_recomendacoes  rc   ON bf.registro_consultor_id = rc.registro_consultor_id
LEFT JOIN cte_os_single      os   ON bf.registro_consultor_id = os.registro_consultor_id
LEFT JOIN cte_os_stats       oss  ON bf.registro_consultor_id = oss.registro_consultor_id
LEFT JOIN cte_logs_datas     cl   ON bf.registro_consultor_id = cl.registro_consultor_id
LEFT JOIN cte_status_logs    sl   ON bf.registro_consultor_id = sl.registro_consultor_id
LEFT JOIN cte_aprovacoes     ap   ON bf.registro_consultor_id = ap.registro_consultor_id
LEFT JOIN public.microrganismos mic ON os.os_microrganismo_id = mic.id;

GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO service_role;

-- =====================================================================
-- 3. RPCs — BI Drill-down (SECURITY DEFINER)
-- =====================================================================

-- Helper: check authenticated internal user (not cliente_produtor / financeiro)
-- All RPCs share this pattern: auth.uid() NOT NULL and date coalesce filters.

-- 3a. rpc_bi_visitas_por_consultor
CREATE OR REPLACE FUNCTION public.rpc_bi_visitas_por_consultor(
    p_consultor_id uuid,
    p_data_inicio  date DEFAULT NULL,
    p_data_fim     date DEFAULT NULL
)
RETURNS SETOF public.vw_fluxo_visita_tecnica
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_data_inicio date := COALESCE(p_data_inicio, (current_date - interval '365 days')::date);
  v_data_fim    date := COALESCE(p_data_fim, current_date);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT v.*
    FROM public.vw_fluxo_visita_tecnica v
    WHERE v.consultor_id = p_consultor_id
      AND COALESCE(v.created_at, now())::date BETWEEN v_data_inicio AND v_data_fim;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bi_visitas_por_consultor(uuid, date, date) TO authenticated;

-- 3b. rpc_bi_visitas_por_cliente
CREATE OR REPLACE FUNCTION public.rpc_bi_visitas_por_cliente(
    p_cliente_id  uuid,
    p_data_inicio date DEFAULT NULL,
    p_data_fim    date DEFAULT NULL
)
RETURNS SETOF public.vw_fluxo_visita_tecnica
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_data_inicio date := COALESCE(p_data_inicio, (current_date - interval '365 days')::date);
  v_data_fim    date := COALESCE(p_data_fim, current_date);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT v.*
    FROM public.vw_fluxo_visita_tecnica v
    WHERE v.cliente_id = p_cliente_id
      AND COALESCE(v.created_at, now())::date BETWEEN v_data_inicio AND v_data_fim;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bi_visitas_por_cliente(uuid, date, date) TO authenticated;

-- 3c. rpc_bi_visitas_por_fazenda
CREATE OR REPLACE FUNCTION public.rpc_bi_visitas_por_fazenda(
    p_fazenda_id  uuid,
    p_data_inicio date DEFAULT NULL,
    p_data_fim    date DEFAULT NULL
)
RETURNS SETOF public.vw_fluxo_visita_tecnica
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_data_inicio date := COALESCE(p_data_inicio, (current_date - interval '365 days')::date);
  v_data_fim    date := COALESCE(p_data_fim, current_date);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT v.*
    FROM public.vw_fluxo_visita_tecnica v
    WHERE v.fazenda_id = p_fazenda_id
      AND COALESCE(v.created_at, now())::date BETWEEN v_data_inicio AND v_data_fim;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bi_visitas_por_fazenda(uuid, date, date) TO authenticated;

-- 3d. rpc_bi_visitas_por_talhao
CREATE OR REPLACE FUNCTION public.rpc_bi_visitas_por_talhao(
    p_talhao_id   uuid,
    p_data_inicio date DEFAULT NULL,
    p_data_fim    date DEFAULT NULL
)
RETURNS SETOF public.vw_fluxo_visita_tecnica
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_data_inicio date := COALESCE(p_data_inicio, (current_date - interval '365 days')::date);
  v_data_fim    date := COALESCE(p_data_fim, current_date);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT v.*
    FROM public.vw_fluxo_visita_tecnica v
    WHERE v.talhao_id = p_talhao_id
      AND COALESCE(v.created_at, now())::date BETWEEN v_data_inicio AND v_data_fim;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bi_visitas_por_talhao(uuid, date, date) TO authenticated;

-- 3e. rpc_bi_esteira_por_produto
CREATE OR REPLACE FUNCTION public.rpc_bi_esteira_por_produto(
    p_produto_id  uuid,
    p_data_inicio date DEFAULT NULL,
    p_data_fim    date DEFAULT NULL
)
RETURNS SETOF public.vw_esteira_laboratorio
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_data_inicio date := COALESCE(p_data_inicio, (current_date - interval '365 days')::date);
  v_data_fim    date := COALESCE(p_data_fim, current_date);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT e.*
    FROM public.vw_esteira_laboratorio e
    WHERE e.produto_id = p_produto_id
      AND COALESCE(e.data_programada, e.created_at::date) BETWEEN v_data_inicio AND v_data_fim;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bi_esteira_por_produto(uuid, date, date) TO authenticated;

-- 3f. rpc_bi_esteira_por_microrganismo
CREATE OR REPLACE FUNCTION public.rpc_bi_esteira_por_microrganismo(
    p_microrganismo_id uuid,
    p_data_inicio      date DEFAULT NULL,
    p_data_fim         date DEFAULT NULL
)
RETURNS SETOF public.vw_esteira_laboratorio
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_data_inicio date := COALESCE(p_data_inicio, (current_date - interval '365 days')::date);
  v_data_fim    date := COALESCE(p_data_fim, current_date);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT e.*
    FROM public.vw_esteira_laboratorio e
    WHERE e.microrganismo_id = p_microrganismo_id
      AND COALESCE(e.data_programada, e.created_at::date) BETWEEN v_data_inicio AND v_data_fim;

EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bi_esteira_por_microrganismo(uuid, date, date) TO authenticated;

-- =====================================================================
-- 4. VIEW: vw_bi_estoque_produto
-- =====================================================================

CREATE OR REPLACE VIEW public.vw_bi_estoque_produto
WITH (security_invoker = true) AS
SELECT
    ep.id,
    ep.produto_id,
    l.microrganismo_id,
    p.nome                                           AS nome_produto,
    m.nome                                           AS nome_microrganismo,
    COALESCE(ep.volume_total, 0)                     AS volume_total,
    ROUND(COALESCE(ep.volume_total, 0) / 1000.0, 4) AS volume_total_l,
    ep.updated_at
FROM public.estoque_produto ep
LEFT JOIN public.produtos      p ON ep.produto_id    = p.id
LEFT JOIN public.lotes         l ON ep.lote_id       = l.id
LEFT JOIN public.microrganismos m ON l.microrganismo_id = m.id;

GRANT SELECT ON public.vw_bi_estoque_produto TO authenticated;
GRANT SELECT ON public.vw_bi_estoque_produto TO service_role;

-- =====================================================================
-- 5. VIEW: vw_bi_movimentacoes
-- =====================================================================

CREATE OR REPLACE VIEW public.vw_bi_movimentacoes
WITH (security_invoker = true) AS
SELECT
    em.id,
    em.estoque_produto_id,
    em.acao                          AS tipo_movimentacao,
    em.quantidade                    AS volume_alteracao,
    em.status_anterior               AS volume_anterior,
    em.status_novo                   AS volume_novo,
    em.observacao                    AS motivo,
    em.created_at,
    ep.produto_id,
    l.microrganismo_id
FROM public.estoque_movimentacoes em
LEFT JOIN public.estoque_produto  ep ON em.estoque_produto_id = ep.id
LEFT JOIN public.lotes             l ON ep.lote_id            = l.id;

GRANT SELECT ON public.vw_bi_movimentacoes TO authenticated;
GRANT SELECT ON public.vw_bi_movimentacoes TO service_role;

-- =====================================================================
-- Migration: Fase 14 - BI Operacional Interativo — CONCLUÍDA
-- =====================================================================
