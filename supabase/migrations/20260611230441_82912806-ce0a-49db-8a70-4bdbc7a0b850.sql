-- 1. Dropar views dependentes
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira;

-- 2. Recriar View de Integridade com colunas extras (atrasado, volume, cq_resultado)
CREATE VIEW public.vw_os_integridade_esteira 
WITH (security_invoker = true) AS
WITH base_os AS (
    SELECT id AS os_id, 'manual'::text AS origem_os, numero_os, cliente_id, (status)::text AS status_os, prioridade, created_at FROM public.ordens_servico
    UNION ALL
    SELECT id AS os_id, 'onfarm'::text AS origem_os, numero_os, cliente_id, (status)::text AS status_os, prioridade, created_at FROM public.ordens_servico_onfarm
), esteira_data AS (
    SELECT 
        bos.os_id, bos.origem_os, bos.numero_os, bos.cliente_id, c.nome AS cliente_nome, bos.status_os, bos.prioridade,
        (pp.status)::text AS status_programacao, pp.id AS programacao_id, pp.data_programada, pp.responsavel_id, pp.created_at AS programacao_created_at, bos.created_at AS os_created_at,
        (l.status)::text AS status_lote, l.id AS lote_id, l.codigo_lote, (cq.resultado)::text AS status_cq, ev.id AS envase_id, (ep.status)::text AS status_estoque, ep.id AS estoque_id,
        (pp.id IS NOT NULL) AS possui_programacao, (l.id IS NOT NULL) AS possui_lote, ((cq.resultado)::text = 'aprovado'::text) AS possui_cq_aprovado, (ev.id IS NOT NULL) AS possui_envase,
        (ep.id IS NOT NULL) AS possui_estoque, ((ep.status)::text = 'reservado'::text) AS possui_reserva, (ent.id IS NOT NULL) AS possui_entrega, (ent.status = 'entregue'::status_entrega) AS possui_entrega_confirmada,
        (ap.id IS NOT NULL) AS possui_aplicacao,
        COALESCE(osm.volume_total_ml, osf.volume_total_ml) AS volume_solicitado_ml,
        ((COALESCE(osm.volume_total_ml, osf.volume_total_ml) / 1000.0))::numeric(12,2) AS volume_solicitado_l
    FROM base_os bos
    LEFT JOIN public.clientes c ON bos.cliente_id = c.id
    LEFT JOIN public.ordens_servico osm ON (bos.os_id = osm.id AND bos.origem_os = 'manual')
    LEFT JOIN public.ordens_servico_onfarm osf ON (bos.os_id = osf.id AND bos.origem_os = 'onfarm')
    LEFT JOIN public.programacao_producao pp ON ((bos.origem_os = 'manual' AND pp.ordem_servico_id = bos.os_id) OR (bos.origem_os = 'onfarm' AND pp.ordem_servico_onfarm_id = bos.os_id))
    LEFT JOIN public.lotes l ON pp.id = l.programacao_id
    LEFT JOIN LATERAL (SELECT resultado FROM public.controle_qualidade WHERE lote_id = l.id ORDER BY created_at DESC LIMIT 1) cq ON true
    LEFT JOIN public.envase ev ON l.id = ev.lote_id
    LEFT JOIN LATERAL (SELECT id, status FROM public.estoque_produto WHERE lote_id = l.id ORDER BY created_at DESC LIMIT 1) ep ON true
    LEFT JOIN LATERAL (SELECT id, status FROM public.entregas WHERE ((bos.origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR (bos.origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id)) AND status <> 'cancelada' ORDER BY created_at DESC LIMIT 1) ent ON true
    LEFT JOIN LATERAL (SELECT id FROM public.aplicacoes WHERE (bos.origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR (bos.origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id) LIMIT 1) ap ON true
)
SELECT 
    *,
    CASE 
        WHEN possui_entrega_confirmada THEN 'concluida'
        WHEN possui_entrega THEN 'em_entrega'
        WHEN possui_estoque THEN 'pronto_entrega'
        WHEN possui_envase THEN 'envase'
        WHEN possui_cq_aprovado THEN 'aprovado_cq'
        WHEN possui_lote THEN 'em_producao'
        WHEN possui_programacao THEN 'programado'
        ELSE 'aguardando_producao'
    END AS status_esteira_oficial,
    NOT (status_os = 'cancelada' OR status_os = 'finalizada') AS pode_avancar,
    possui_entrega_confirmada AS pode_finalizar,
    ARRAY[]::TEXT[] AS bloqueios,
    ((data_programada < CURRENT_DATE) AND (status_os <> ALL (ARRAY['finalizada'::text, 'entregue'::text, 'cancelada'::text]))) AS atrasado,
    status_cq AS cq_resultado
FROM esteira_data;

-- 3. Recriar View de Esteira Laboratório
CREATE VIEW public.vw_esteira_laboratorio 
WITH (security_invoker = true) AS
SELECT 
    v.origem_os, v.os_id, v.numero_os, v.cliente_id, v.cliente_nome, v.status_os, v.status_programacao, v.lote_id, v.codigo_lote, v.status_lote, v.status_cq, v.envase_id, v.estoque_id, v.status_esteira_oficial, v.pode_finalizar, v.os_created_at AS created_at,
    v.atrasado, v.volume_solicitado_l, v.cq_resultado
FROM public.vw_os_integridade_esteira v;

-- 4. Recriar View de Fluxo Visita Técnica com colunas de status legadas
CREATE VIEW public.vw_fluxo_visita_tecnica 
WITH (security_invoker = true) AS
WITH last_checkin AS (
    SELECT DISTINCT ON (registro_consultor_id) registro_consultor_id, created_at AS data_checkin FROM public.visitas_checkin ORDER BY registro_consultor_id, created_at DESC
), last_aprovacao AS (
    SELECT DISTINCT ON (registro_consultor_id) registro_consultor_id, status_aprovacao, created_at AS data_aprovacao FROM public.aprovacoes_tecnicas ORDER BY registro_consultor_id, created_at DESC
)
SELECT 
    r.id AS registro_id, r.cliente_id, c.nome AS cliente_nome, r.fazenda_id, f.nome AS fazenda_nome, r.talhao_id, t.nome AS talhao_nome, r.status, r.consultor_responsavel, p.nome AS consultor_nome,
    r.created_at AS data_criacao, lc.data_checkin, r.observacoes_tecnicas, la.status_aprovacao, la.data_aprovacao, os.id AS os_onfarm_id, os.numero_os AS os_onfarm_numero,
    CASE 
        WHEN os.id IS NOT NULL THEN 'convertido_os'
        WHEN la.status_aprovacao = 'aprovado' THEN 'aprovado'
        WHEN r.observacoes_tecnicas IS NOT NULL AND r.observacoes_tecnicas <> '' THEN 'aguardando_aprovacao'
        WHEN lc.data_checkin IS NOT NULL THEN 'em_visita'
        ELSE 'agendado'
    END AS status_fluxo,
    -- Colunas para compatibilidade com hooks antigos
    r.status AS status_visita,
    (lc.data_checkin IS NOT NULL) AS possui_checkin,
    COALESCE((SELECT status FROM public.portal_solicitacoes WHERE id = r.solicitacao_id), r.status::text) AS status_solicitacao
FROM public.registros_consultor r
LEFT JOIN public.clientes c ON r.cliente_id = c.id
LEFT JOIN public.fazendas f ON r.fazenda_id = f.id
LEFT JOIN public.talhoes t ON r.talhao_id = t.id
LEFT JOIN public.profiles p ON r.consultor_responsavel = p.user_id
LEFT JOIN last_checkin lc ON r.id = lc.registro_consultor_id
LEFT JOIN last_aprovacao la ON r.id = la.registro_consultor_id
LEFT JOIN public.ordens_servico_onfarm os ON r.id = os.registro_consultor_id;

-- 5. Restaurar Grants
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
