-- Índices para otimização da esteira do laboratório
CREATE INDEX IF NOT EXISTS idx_lotes_programacao_id ON public.lotes(programacao_id);
CREATE INDEX IF NOT EXISTS idx_controle_qualidade_lote_id ON public.controle_qualidade(lote_id);
CREATE INDEX IF NOT EXISTS idx_envase_lote_id ON public.envase(lote_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produto_lote_id ON public.estoque_produto(lote_id);
CREATE INDEX IF NOT EXISTS idx_entregas_ordem_servico_onfarm_id ON public.entregas(ordem_servico_onfarm_id);
CREATE INDEX IF NOT EXISTS idx_aplicacoes_ordem_servico_id ON public.aplicacoes(ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_aplicacoes_ordem_servico_onfarm_id ON public.aplicacoes(ordem_servico_onfarm_id);

-- View Operacional da Esteira do Laboratório
CREATE OR REPLACE VIEW public.vw_esteira_laboratorio AS
WITH base_data AS (
    SELECT 
        pp.id AS programacao_id,
        CASE WHEN pp.ordem_servico_onfarm_id IS NOT NULL THEN 'onfarm' ELSE 'manual' END AS origem_os,
        COALESCE(pp.ordem_servico_id, pp.ordem_servico_onfarm_id) AS os_id,
        pp.ordem_servico_id AS os_manual_id,
        pp.ordem_servico_onfarm_id AS os_onfarm_id,
        COALESCE(os.numero_os, oso.numero_os) AS numero_os,
        COALESCE(os.cliente_id, oso.cliente_id) AS cliente_id,
        COALESCE(os.fazenda_id, oso.fazenda_id) AS fazenda_id,
        COALESCE(os.talhao_id, oso.talhao_id) AS talhao_id,
        COALESCE(os.produto_id, oso.produto_id) AS produto_id,
        os.microrganismo_id,
        COALESCE(os.volume_total_ml, oso.volume_total_ml) AS volume_total_ml,
        pp.data_programada,
        COALESCE(os.prioridade, oso.prioridade) AS prioridade,
        COALESCE(os.status::text, oso.status::text) AS status_os,
        pp.status AS status_programacao,
        pp.created_at,
        pp.updated_at
    FROM public.programacao_producao pp
    LEFT JOIN public.ordens_servico os ON pp.ordem_servico_id = os.id
    LEFT JOIN public.ordens_servico_onfarm oso ON pp.ordem_servico_onfarm_id = oso.id
)
SELECT 
    bd.programacao_id,
    bd.origem_os,
    bd.os_id,
    bd.numero_os,
    bd.cliente_id,
    c.nome AS cliente_nome,
    f.nome AS fazenda_nome,
    t.nome AS talhao_nome,
    bd.produto_id,
    p.nome AS produto_nome,
    bd.microrganismo_id,
    m.nome AS microrganismo_nome,
    bd.volume_total_ml AS volume_solicitado_ml,
    (bd.volume_total_ml / 1000.0)::numeric(12,2) AS volume_solicitado_l,
    bd.data_programada,
    bd.prioridade,
    bd.status_os,
    bd.status_programacao,
    l.id AS lote_id,
    l.codigo_lote,
    l.status AS status_lote,
    cq.resultado AS cq_resultado,
    cq.created_at AS data_cq,
    ev.id AS envase_id,
    ev.quantidade AS quantidade_envasada,
    ep.id AS estoque_id,
    ep.status AS status_estoque,
    ep.quantidade_reservada,
    ent.status AS entrega_status,
    CASE WHEN ap.id IS NOT NULL THEN 'concluida' ELSE NULL END AS aplicacao_status,
    bd.created_at,
    bd.updated_at,
    -- atrasado logic: data_programada < current_date e OS não finalizada/entregue/cancelada
    (bd.data_programada < CURRENT_DATE AND bd.status_os NOT IN ('finalizada', 'entregue', 'cancelada')) AS atrasado,
    -- proxima_acao logic
    CASE 
        WHEN l.id IS NULL THEN 'Gerar lote'
        WHEN l.status = 'em_producao' THEN 'Enviar para CQ'
        WHEN l.status = 'aguardando_cq' THEN 'Registrar CQ'
        WHEN l.status = 'aprovado' AND ev.id IS NULL THEN 'Realizar envase'
        WHEN ev.id IS NOT NULL AND ep.id IS NULL THEN 'Gerar estoque'
        WHEN ep.status = 'disponivel' AND (ep.quantidade_reservada IS NULL OR ep.quantidade_reservada = 0) THEN 'Reservar estoque'
        WHEN ep.status = 'reservado' AND ent.id IS NULL THEN 'Criar entrega'
        WHEN ent.status = 'entregue' AND ap.id IS NULL THEN 'Registrar aplicação'
        WHEN ap.id IS NOT NULL OR bd.status_os = 'finalizada' THEN 'Finalizado'
        ELSE 'Acompanhar'
    END AS proxima_acao
FROM base_data bd
LEFT JOIN public.clientes c ON bd.cliente_id = c.id
LEFT JOIN public.fazendas f ON bd.fazenda_id = f.id
LEFT JOIN public.talhoes t ON bd.talhao_id = t.id
LEFT JOIN public.produtos p ON bd.produto_id = p.id
LEFT JOIN public.microrganismos m ON bd.microrganismo_id = m.id
LEFT JOIN public.lotes l ON bd.programacao_id = l.programacao_id
LEFT JOIN LATERAL (SELECT q.resultado, q.created_at FROM public.controle_qualidade q WHERE q.lote_id = l.id ORDER BY q.created_at DESC LIMIT 1) cq ON TRUE
LEFT JOIN LATERAL (SELECT e.id, e.quantidade FROM public.envase e WHERE e.lote_id = l.id ORDER BY e.created_at DESC LIMIT 1) ev ON TRUE
LEFT JOIN LATERAL (SELECT s.id, s.status, s.quantidade_reservada FROM public.estoque_produto s WHERE s.lote_id = l.id ORDER BY s.created_at DESC LIMIT 1) ep ON TRUE
LEFT JOIN LATERAL (SELECT n.id, n.status FROM public.entregas n WHERE (bd.os_manual_id IS NOT NULL AND n.ordem_servico_id = bd.os_manual_id) OR (bd.os_onfarm_id IS NOT NULL AND n.ordem_servico_onfarm_id = bd.os_onfarm_id) ORDER BY n.created_at DESC LIMIT 1) ent ON TRUE
LEFT JOIN LATERAL (SELECT a.id FROM public.aplicacoes a WHERE (bd.os_manual_id IS NOT NULL AND a.ordem_servico_id = bd.os_manual_id) OR (bd.os_onfarm_id IS NOT NULL AND a.ordem_servico_onfarm_id = bd.os_onfarm_id) ORDER BY a.created_at DESC LIMIT 1) ap ON TRUE;

-- Permissões
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;
