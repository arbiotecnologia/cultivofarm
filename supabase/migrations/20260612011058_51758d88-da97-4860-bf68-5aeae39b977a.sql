-- Recriar vw_os_integridade_esteira com colunas legadas e novas
DROP VIEW IF EXISTS public.vw_os_integridade_esteira CASCADE;

CREATE OR REPLACE VIEW public.vw_os_integridade_esteira WITH (security_invoker = true) AS
WITH base_os AS (
    SELECT id as os_id, 'manual' as origem_os, numero_os, cliente_id, fazenda_id, talhao_id, status::text as status, created_at, volume_total_ml, produto_id, microrganismo_id, prioridade::text FROM ordens_servico
    UNION ALL
    SELECT id as os_id, 'onfarm' as origem_os, numero_os, cliente_id, fazenda_id, talhao_id, status::text as status, created_at, volume_total_ml, produto_id, NULL::uuid as microrganismo_id, prioridade::text FROM ordens_servico_onfarm
),
esteira_full AS (
    SELECT 
        bos.*,
        bos.status as status_os, -- Legado
        (bos.volume_total_ml::float / 1000.0) as volume_solicitado_l,
        c.nome as cliente_nome,
        f.nome as fazenda_nome,
        t.nome as talhao_nome,
        p.nome as produto_nome,
        m.nome as microrganismo_nome,
        pp.id as programacao_id,
        pp.status::text as status_programacao,
        pp.data_programada,
        pp.created_at as data_inicio_producao,
        l.id as lote_id,
        l.codigo_lote,
        l.status::text as status_lote,
        l.created_at as data_lote,
        cq.id as cq_id,
        cq.resultado::text as cq_resultado,
        cq.created_at as data_cq,
        ev.id as envase_id,
        ev.created_at as data_envase,
        ep.id as estoque_id,
        ep.created_at as data_estoque,
        ent.id as entrega_id,
        ent.status::text as entrega_status,
        ent.created_at as data_entrega,
        app.id as aplicacao_id,
        app.created_at as data_aplicacao
    FROM base_os bos
    LEFT JOIN clientes c ON bos.cliente_id = c.id
    LEFT JOIN fazendas f ON bos.fazenda_id = f.id
    LEFT JOIN talhoes t ON bos.talhao_id = t.id
    LEFT JOIN produtos p ON bos.produto_id = p.id
    LEFT JOIN microrganismos m ON bos.microrganismo_id = m.id
    LEFT JOIN LATERAL (SELECT * FROM programacao_producao WHERE 
        (origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR 
        (origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id) 
        ORDER BY created_at DESC LIMIT 1) pp ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM lotes WHERE programacao_id = pp.id ORDER BY created_at DESC LIMIT 1) l ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM controle_qualidade WHERE lote_id = l.id ORDER BY created_at DESC LIMIT 1) cq ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM envase WHERE lote_id = l.id ORDER BY created_at DESC LIMIT 1) ev ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM estoque_produto WHERE lote_id = l.id ORDER BY created_at DESC LIMIT 1) ep ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM entregas WHERE 
        (origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR 
        (origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id) 
        ORDER BY created_at DESC LIMIT 1) ent ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM aplicacoes WHERE 
        (origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR 
        (origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id) 
        ORDER BY created_at DESC LIMIT 1) app ON TRUE
)
SELECT 
    *,
    (data_entrega IS NOT NULL AND entrega_status = 'entregue') as pode_finalizar,
    false as aplicacao_bloqueante,
    (data_programada < now() AND (entrega_status IS NULL OR entrega_status != 'entregue')) as atrasado,
    status_os as status_esteira_oficial, -- Mapeamento para legado
    NULL::text as bloqueios,
    -- Tempos
    data_inicio_producao - created_at as tempo_os_ate_programacao,
    data_lote - data_inicio_producao as tempo_programacao_ate_lote,
    data_cq - data_lote as tempo_lote_ate_cq,
    data_envase - data_cq as tempo_cq_ate_envase,
    data_entrega - data_envase as tempo_envase_ate_entrega,
    data_entrega - created_at as tempo_os_ate_entrega
FROM esteira_full;

GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO service_role;

-- Recriar vw_esteira_laboratorio
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;

CREATE OR REPLACE VIEW public.vw_esteira_laboratorio WITH (security_invoker = true) AS
SELECT 
    v.*,
    CASE 
        WHEN status_programacao IS NULL THEN 'Abrir OS'
        WHEN status_programacao = 'pendente' THEN 'Programar Produção'
        WHEN status_lote IS NULL OR status_lote = 'em_producao' THEN 'Finalizar Lote'
        WHEN status_lote = 'aguardando_cq' THEN 'Realizar CQ'
        WHEN cq_resultado = 'aprovado' AND envase_id IS NULL THEN 'Registrar Envase'
        WHEN envase_id IS NOT NULL AND estoque_id IS NULL THEN 'Entrada Estoque'
        WHEN estoque_id IS NOT NULL AND entrega_id IS NULL THEN 'Realizar Entrega'
        WHEN entrega_status = 'entregue' THEN 'Concluído'
        ELSE 'Verificar status'
    END as proxima_acao
FROM vw_os_integridade_esteira v;

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;
