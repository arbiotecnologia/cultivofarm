-- 1. DROP Prévio para evitar erro de colunas
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira;

-- 2. Recriação da View de Integridade da Esteira com Prioridade
CREATE VIEW public.vw_os_integridade_esteira AS
WITH os_consolidada AS (
    SELECT 
        'manual'::text as origem_os,
        id as os_id,
        cliente_id,
        fazenda_id,
        talhao_id,
        status::text as status_os,
        prioridade::text as prioridade,
        volume_total_ml
    FROM ordens_servico
    UNION ALL
    SELECT 
        'onfarm'::text as origem_os,
        id as os_id,
        cliente_id,
        fazenda_id,
        talhao_id,
        status::text as status_os,
        prioridade::text as prioridade,
        volume_total_ml
    FROM ordens_servico_onfarm
),
ultimas_entregas AS (
    SELECT DISTINCT ON (e.ordem_servico_id, e.ordem_servico_onfarm_id)
        e.id,
        e.ordem_servico_id,
        e.ordem_servico_onfarm_id,
        e.status::text as status_entrega,
        e.created_at
    FROM entregas e
    ORDER BY e.ordem_servico_id, e.ordem_servico_onfarm_id, e.created_at DESC
)
SELECT 
    os.origem_os,
    os.os_id,
    os.prioridade,
    os.volume_total_ml,
    (os.volume_total_ml / 1000.0) as volume_solicitado_l,
    -- Programação
    EXISTS (SELECT 1 FROM programacao_producao p WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)) as tem_programacao,
    -- Lote
    EXISTS (
        SELECT 1 FROM lotes l 
        JOIN programacao_producao p ON l.programacao_id = p.id 
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
    ) as tem_lote,
    -- CQ
    COALESCE((
        SELECT cq.resultado::text 
        FROM controle_qualidade cq
        JOIN lotes l ON cq.lote_id = l.id
        JOIN programacao_producao p ON l.programacao_id = p.id
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
        ORDER BY cq.created_at DESC LIMIT 1
    ), 'pendente') as cq_resultado,
    -- Envase
    EXISTS (
        SELECT 1 FROM envase ev
        JOIN lotes l ON ev.lote_id = l.id
        JOIN programacao_producao p ON l.programacao_id = p.id
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
    ) as tem_envase,
    -- Estoque
    EXISTS (
        SELECT 1 FROM estoque_produto ep
        WHERE ep.reservado_para_os_id = os.os_id AND ep.reservado_para_os_tipo = os.origem_os
    ) as tem_estoque,
    -- Entrega
    COALESCE(ue.status_entrega, 'pendente') as entrega_status,
    COALESCE(ue.status_entrega IN ('entregue', 'confirmada', 'concluida'), false) as entrega_confirmada,
    -- Aplicação (Informativa)
    EXISTS (
        SELECT 1 FROM aplicacoes a 
        WHERE (os.origem_os = 'manual' AND a.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND a.ordem_servico_onfarm_id = os.os_id)
    ) as tem_aplicacao,
    -- Bloqueios (Lista de textos para UI)
    ARRAY(
        SELECT unnest(
            CASE WHEN NOT EXISTS (SELECT 1 FROM programacao_producao p WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)) THEN ARRAY['Sem programação'] ELSE ARRAY[]::text[] END ||
            CASE WHEN NOT EXISTS (SELECT 1 FROM lotes l JOIN programacao_producao p ON l.programacao_id = p.id WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)) THEN ARRAY['Sem lote'] ELSE ARRAY[]::text[] END ||
            CASE WHEN COALESCE((SELECT cq.resultado::text FROM controle_qualidade cq JOIN lotes l ON cq.lote_id = l.id JOIN programacao_producao p ON l.programacao_id = p.id WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id) ORDER BY cq.created_at DESC LIMIT 1), 'pendente') != 'aprovado' THEN ARRAY['CQ não aprovado'] ELSE ARRAY[]::text[] END ||
            CASE WHEN NOT EXISTS (SELECT 1 FROM envase ev JOIN lotes l ON ev.lote_id = l.id JOIN programacao_producao p ON l.programacao_id = p.id WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)) THEN ARRAY['Sem envase'] ELSE ARRAY[]::text[] END ||
            CASE WHEN NOT EXISTS (SELECT 1 FROM estoque_produto ep WHERE ep.reservado_para_os_id = os.os_id AND ep.reservado_para_os_tipo = os.origem_os) THEN ARRAY['Sem estoque/reserva'] ELSE ARRAY[]::text[] END ||
            CASE WHEN COALESCE(ue.status_entrega IN ('entregue', 'confirmada', 'concluida'), false) = false THEN ARRAY['Entrega não confirmada'] ELSE ARRAY[]::text[] END
        )
    ) as bloqueios,
    -- Regra de Finalização
    (
        EXISTS (SELECT 1 FROM programacao_producao p WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)) AND
        EXISTS (
            SELECT 1 FROM lotes l 
            JOIN programacao_producao p ON l.programacao_id = p.id 
            WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
        ) AND
        COALESCE((
            SELECT cq.resultado::text 
            FROM controle_qualidade cq
            JOIN lotes l ON cq.lote_id = l.id
            JOIN programacao_producao p ON l.programacao_id = p.id
            WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
            ORDER BY cq.created_at DESC LIMIT 1
        ), 'pendente') = 'aprovado' AND
        EXISTS (
            SELECT 1 FROM envase ev
            JOIN lotes l ON ev.lote_id = l.id
            JOIN programacao_producao p ON l.programacao_id = p.id
            WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
        ) AND
        EXISTS (
            SELECT 1 FROM estoque_produto ep
            WHERE ep.reservado_para_os_id = os.os_id AND ep.reservado_para_os_tipo = os.origem_os
        ) AND
        COALESCE(ue.status_entrega IN ('entregue', 'confirmada', 'concluida'), false)
    ) as pode_finalizar
FROM os_consolidada os
LEFT JOIN ultimas_entregas ue ON (os.origem_os = 'manual' AND ue.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND ue.ordem_servico_onfarm_id = os.os_id);

GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO service_role;

-- 3. Recriação da View vw_esteira_laboratorio com Atrasado e Volume
CREATE VIEW public.vw_esteira_laboratorio AS
WITH os_base AS (
    SELECT 
        'manual'::text as origem_os, id, cliente_id, fazenda_id, talhao_id, produto_id, status::text as status_os_text, created_at, numero_os
    FROM ordens_servico
    UNION ALL
    SELECT 
        'onfarm'::text as origem_os, id, cliente_id, fazenda_id, talhao_id, produto_id, status::text as status_os_text, created_at, numero_os
    FROM ordens_servico_onfarm
)
SELECT 
    ob.origem_os,
    ob.id as os_id,
    ob.numero_os,
    ob.cliente_id,
    c.nome as cliente_nome,
    f.nome as fazenda_nome,
    t.nome as talhao_nome,
    p.nome as produto_nome,
    ob.status_os_text as status_os,
    -- Integridade
    vi.tem_programacao,
    vi.tem_lote,
    vi.cq_resultado,
    vi.tem_envase,
    vi.tem_estoque,
    vi.entrega_status,
    vi.entrega_confirmada,
    vi.tem_aplicacao as aplicacao_informativa,
    vi.pode_finalizar,
    vi.bloqueios,
    vi.prioridade,
    vi.volume_solicitado_l,
    -- Status Oficial
    CASE 
        WHEN ob.status_os_text = 'finalizada' THEN 'finalizada'
        WHEN ob.status_os_text = 'cancelada' THEN 'cancelada'
        WHEN vi.entrega_confirmada THEN 'entregue'
        WHEN vi.entrega_status = 'em_transito' THEN 'entrega_pendente'
        WHEN vi.tem_estoque THEN 'pronto_entrega'
        WHEN vi.tem_envase THEN 'envase'
        WHEN vi.cq_resultado = 'aprovado' THEN 'cq_aprovado'
        WHEN vi.cq_resultado = 'reprovado' THEN 'cq_reprovado'
        WHEN vi.tem_lote THEN 'em_producao'
        WHEN vi.tem_programacao THEN 'programada'
        ELSE 'aberta'
    END as status_esteira_oficial,
    -- Atrasado (Lógica simplificada para BI real na Fase 11)
    CASE 
        WHEN ob.status_os_text NOT IN ('finalizada', 'cancelada') AND ob.created_at < now() - interval '7 days' THEN true
        ELSE false
    END as atrasado
FROM os_base ob
JOIN public.vw_os_integridade_esteira vi ON ob.id = vi.os_id AND ob.origem_os = vi.origem_os
LEFT JOIN clientes c ON ob.cliente_id = c.id
LEFT JOIN fazendas f ON ob.fazenda_id = f.id
LEFT JOIN talhoes t ON ob.talhao_id = t.id
LEFT JOIN produtos p ON ob.produto_id = p.id;

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;
