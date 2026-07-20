-- Auditoria Final da Esteira Laboratorial
-- Objetivo: Garantir integridade máxima antes do BI

-- 1. Recriar vw_os_integridade_esteira com regras reforçadas
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira CASCADE;

CREATE VIEW public.vw_os_integridade_esteira WITH (security_invoker = true) AS
WITH base_os AS (
    -- OS Manual
    SELECT 
        id as os_id, 
        'manual' as origem_os, 
        numero_os, 
        cliente_id, 
        fazenda_id, 
        talhao_id, 
        status::text as status_os, 
        created_at, 
        volume_total_ml, 
        produto_id, 
        microrganismo_id, 
        prioridade::text as prioridade
    FROM public.ordens_servico
    
    UNION ALL
    
    -- OS On-Farm
    SELECT 
        id as os_id, 
        'onfarm' as origem_os, 
        numero_os, 
        cliente_id, 
        fazenda_id, 
        talhao_id, 
        status::text as status_os, 
        created_at, 
        volume_total_ml, 
        produto_id, 
        NULL::uuid as microrganismo_id, 
        prioridade::text as prioridade
    FROM public.ordens_servico_onfarm
),
esteira_data AS (
    SELECT 
        bos.*,
        (bos.volume_total_ml::float / 1000.0) as volume_solicitado_l,
        c.nome as cliente_nome,
        f.nome as fazenda_nome,
        t.nome as talhao_nome,
        p.nome as produto_nome,
        m.nome as microrganismo_nome,
        
        -- Programação
        pp.id as programacao_id,
        pp.status::text as status_programacao,
        pp.data_programada,
        pp.created_at as data_inicio_producao,
        
        -- Lote
        l.id as lote_id,
        l.codigo_lote,
        l.status::text as status_lote,
        l.created_at as data_lote,
        
        -- CQ
        cq.id as cq_id,
        cq.resultado::text as cq_resultado,
        cq.created_at as data_cq,
        
        -- Envase
        ev.id as envase_id,
        ev.created_at as data_envase,
        
        -- Estoque
        ep.id as estoque_id,
        ep.created_at as data_estoque,
        
        -- Entrega
        ent.id as entrega_id,
        ent.status::text as entrega_status,
        ent.created_at as data_entrega,
        
        -- Aplicação
        app.id as aplicacao_id,
        app.created_at as data_aplicacao
        
    FROM base_os bos
    LEFT JOIN public.clientes c ON bos.cliente_id = c.id
    LEFT JOIN public.fazendas f ON bos.fazenda_id = f.id
    LEFT JOIN public.talhoes t ON bos.talhao_id = t.id
    LEFT JOIN public.produtos p ON bos.produto_id = p.id
    LEFT JOIN public.microrganismos m ON bos.microrganismo_id = m.id
    
    -- Lateral para pegar o registro mais recente de cada etapa
    LEFT JOIN LATERAL (
        SELECT id, status, data_programada, created_at FROM public.programacao_producao 
        WHERE (origem_os = bos.origem_os AND (
            (bos.origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR 
            (bos.origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id)
        ))
        ORDER BY created_at DESC LIMIT 1
    ) pp ON TRUE
    
    LEFT JOIN LATERAL (
        SELECT id, codigo_lote, status, created_at FROM public.lotes 
        WHERE programacao_id = pp.id 
        ORDER BY created_at DESC LIMIT 1
    ) l ON TRUE
    
    LEFT JOIN LATERAL (
        SELECT id, resultado, created_at FROM public.controle_qualidade 
        WHERE lote_id = l.id 
        ORDER BY created_at DESC LIMIT 1
    ) cq ON TRUE
    
    LEFT JOIN LATERAL (
        SELECT id, created_at FROM public.envase 
        WHERE lote_id = l.id 
        ORDER BY created_at DESC LIMIT 1
    ) ev ON TRUE
    
    LEFT JOIN LATERAL (
        SELECT id, created_at FROM public.estoque_produto 
        WHERE lote_id = l.id 
        ORDER BY created_at DESC LIMIT 1
    ) ep ON TRUE
    
    LEFT JOIN LATERAL (
        SELECT id, status, created_at FROM public.entregas 
        WHERE (origem_os = bos.origem_os AND (
            (bos.origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR 
            (bos.origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id)
        ))
        ORDER BY created_at DESC LIMIT 1
    ) ent ON TRUE
    
    LEFT JOIN LATERAL (
        SELECT id, created_at FROM public.aplicacoes 
        WHERE (origem_os = bos.origem_os AND (
            (bos.origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR 
            (bos.origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id)
        ))
        ORDER BY created_at DESC LIMIT 1
    ) app ON TRUE
)
SELECT 
    ed.*,
    
    -- Entrega Confirmada: Status que representam entrega concluída com sucesso
    (ed.entrega_status IN ('entregue', 'confirmada', 'concluida', 'finalizado')) as entrega_confirmada,
    
    -- Aplicação explicitamente não bloqueante
    false as aplicacao_bloqueante,
    
    -- Pendências Informativas (Não bloqueiam fluxo)
    ARRAY(
        SELECT unnest(
            CASE WHEN ed.aplicacao_id IS NULL THEN ARRAY['aplicacao_nao_registrada'] ELSE ARRAY[]::text[] END
        )
    ) as pendencias_informativas,
    
    -- Bloqueios Críticos (Impedem a finalização)
    ARRAY(
        SELECT unnest(
            CASE WHEN ed.programacao_id IS NULL THEN ARRAY['sem_programacao'] ELSE ARRAY[]::text[] END ||
            CASE WHEN ed.lote_id IS NULL THEN ARRAY['sem_lote'] ELSE ARRAY[]::text[] END ||
            CASE WHEN ed.cq_id IS NULL THEN ARRAY['cq_pendente'] ELSE ARRAY[]::text[] END ||
            CASE WHEN ed.cq_resultado = 'reprovado' THEN ARRAY['cq_reprovado'] ELSE ARRAY[]::text[] END ||
            CASE WHEN ed.envase_id IS NULL THEN ARRAY['sem_envase'] ELSE ARRAY[]::text[] END ||
            CASE WHEN ed.estoque_id IS NULL THEN ARRAY['sem_estoque'] ELSE ARRAY[]::text[] END ||
            CASE WHEN NOT (ed.entrega_status IN ('entregue', 'confirmada', 'concluida', 'finalizado')) THEN ARRAY['sem_entrega_confirmada'] ELSE ARRAY[]::text[] END
        )
    ) as bloqueios,
    
    -- Pode Finalizar: Somente se TODOS os bloqueios críticos forem atendidos
    (
        ed.programacao_id IS NOT NULL AND 
        ed.lote_id IS NOT NULL AND 
        ed.cq_resultado = 'aprovado' AND 
        ed.envase_id IS NOT NULL AND 
        ed.estoque_id IS NOT NULL AND 
        (ed.entrega_status IN ('entregue', 'confirmada', 'concluida', 'finalizado'))
    ) as pode_finalizar,
    
    -- Status Oficial da Esteira (Lógica de precedência para o BI)
    CASE 
        WHEN ed.status_os = 'cancelada' THEN 'cancelada'
        WHEN ed.status_os = 'finalizada' THEN 'finalizada'
        WHEN (ed.entrega_status IN ('entregue', 'confirmada', 'concluida', 'finalizado')) THEN 'entregue'
        WHEN ed.entrega_id IS NOT NULL THEN 'entrega_pendente'
        WHEN ed.estoque_id IS NOT NULL THEN 'pronto_entrega'
        WHEN ed.envase_id IS NOT NULL THEN 'envase'
        WHEN ed.cq_resultado = 'aprovado' THEN 'cq_aprovado'
        WHEN ed.cq_resultado = 'reprovado' THEN 'cq_reprovado'
        WHEN ed.status_lote = 'aguardando_cq' THEN 'aguardando_cq'
        WHEN ed.status_lote = 'em_producao' OR ed.status_programacao = 'em_producao' THEN 'em_producao'
        WHEN ed.programacao_id IS NOT NULL THEN 'programada'
        ELSE 'aberta'
    END as status_esteira_oficial,
    
    -- Tempos para indicadores
    ed.data_inicio_producao - ed.created_at as tempo_os_ate_programacao,
    ed.data_lote - ed.data_inicio_producao as tempo_programacao_ate_lote,
    ed.data_cq - ed.data_lote as tempo_lote_ate_cq,
    ed.data_envase - ed.data_cq as tempo_cq_ate_envase,
    ed.data_entrega - ed.data_envase as tempo_envase_ate_entrega,
    ed.data_entrega - ed.created_at as tempo_os_ate_entrega,
    
    -- Flag de atraso
    (ed.data_programada < now() AND ed.status_os NOT IN ('finalizada', 'cancelada') AND NOT (ed.entrega_status IN ('entregue', 'confirmada', 'concluida', 'finalizado'))) as atrasado
FROM esteira_data ed;

GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO service_role;

-- 2. Recriar vw_esteira_laboratorio consumindo a integridade
CREATE VIEW public.vw_esteira_laboratorio WITH (security_invoker = true) AS
SELECT 
    v.*,
    CASE 
        WHEN v.programacao_id IS NULL THEN 'Programar Produção'
        WHEN v.lote_id IS NULL THEN 'Gerar Lote'
        WHEN v.cq_id IS NULL OR v.cq_resultado IS NULL THEN 'Realizar CQ'
        WHEN v.cq_resultado = 'reprovado' THEN 'Tratar reprovação'
        WHEN v.envase_id IS NULL THEN 'Registrar Envase'
        WHEN v.estoque_id IS NULL THEN 'Gerar Estoque/Reserva'
        WHEN NOT v.entrega_confirmada THEN 'Confirmar Entrega'
        WHEN v.pode_finalizar AND v.status_os != 'finalizada' THEN 'Finalizar OS'
        WHEN v.status_os = 'finalizada' THEN 'Concluído'
        ELSE 'Verificar Status'
    END as proxima_acao
FROM public.vw_os_integridade_esteira v;

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;