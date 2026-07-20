-- Recriar vw_fluxo_visita_tecnica
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;

CREATE OR REPLACE VIEW public.vw_fluxo_visita_tecnica WITH (security_invoker = true) AS
WITH base_fluxo AS (
    -- 1. Solicitações (com ou sem visita)
    SELECT 
        CASE WHEN rc.id IS NOT NULL THEN 'visita_com_solicitacao' ELSE 'solicitacao_sem_visita' END as origem_fluxo,
        ps.id as solicitacao_id,
        ps.numero_solicitacao,
        rc.id as registro_consultor_id,
        rc.codigo_visita,
        ps.cliente_id,
        ps.fazenda_id,
        ps.talhao_id,
        ps.consultor_atribuido as consultor_id,
        ps.status::text as status_solicitacao,
        rc.status::text as status_visita,
        ps.tipo_demanda,
        ps.data_prevista_atendimento,
        ps.created_at,
        ps.updated_at
    FROM portal_solicitacoes ps
    LEFT JOIN registros_consultor rc ON ps.id = rc.solicitacao_id
    
    UNION ALL
    
    -- 2. Visitas Avulsas (sem solicitação)
    SELECT 
        'visita_avulsa' as origem_fluxo,
        NULL::uuid as solicitacao_id,
        NULL::text as numero_solicitacao,
        rc.id as registro_consultor_id,
        rc.codigo_visita,
        rc.cliente_id,
        rc.fazenda_id,
        rc.talhao_id,
        rc.consultor_responsavel as consultor_id,
        NULL::text as status_solicitacao,
        rc.status::text as status_visita,
        NULL::text as tipo_demanda,
        NULL::timestamp with time zone as data_prevista_atendimento,
        rc.created_at,
        rc.updated_at
    FROM registros_consultor rc
    WHERE rc.solicitacao_id IS NULL
),
details AS (
    SELECT 
        bf.*,
        c.nome as cliente_nome,
        f.nome as fazenda_nome,
        t.nome as talhao_nome,
        p.nome as consultor_nome
    FROM base_fluxo bf
    LEFT JOIN clientes c ON bf.cliente_id = c.id
    LEFT JOIN fazendas f ON bf.fazenda_id = f.id
    LEFT JOIN talhoes t ON bf.talhao_id = t.id
    LEFT JOIN profiles p ON bf.consultor_id = p.user_id
),
aggregations AS (
    SELECT 
        d.*,
        (SELECT MAX(created_at) FROM visitas_checkin WHERE registro_consultor_id = d.registro_consultor_id) as data_checkin,
        (SELECT MAX(created_at) FROM visitas_logs WHERE registro_consultor_id = d.registro_consultor_id AND acao = 'finalizar') as data_finalizacao,
        (SELECT MAX(created_at) FROM aprovacoes_tecnicas WHERE registro_consultor_id = d.registro_consultor_id AND status_aprovacao = 'aprovado') as data_liberacao_recomendacao,
        (SELECT status_aprovacao::text FROM aprovacoes_tecnicas WHERE registro_consultor_id = d.registro_consultor_id ORDER BY created_at DESC LIMIT 1) as status_aprovacao,
        (SELECT COUNT(*) FROM visita_diagnosticos WHERE registro_consultor_id = d.registro_consultor_id) as quantidade_diagnosticos,
        (SELECT COUNT(*) FROM registros_consultor_arquivos WHERE registro_consultor_id = d.registro_consultor_id) as quantidade_evidencias,
        (SELECT COUNT(*) FROM registros_consultor_recomendacoes WHERE registro_consultor_id = d.registro_consultor_id) as quantidade_recomendacoes,
        os.id as os_id,
        os.numero_os,
        os.status::text as status_os,
        os.created_at as data_conversao_os
    FROM details d
    LEFT JOIN LATERAL (
        SELECT id, numero_os, status, created_at 
        FROM ordens_servico_onfarm 
        WHERE registro_consultor_id = d.registro_consultor_id 
        LIMIT 1
    ) os ON TRUE
),
final_data AS (
    SELECT 
        *,
        (data_checkin IS NOT NULL) as possui_checkin,
        (quantidade_diagnosticos > 0) as possui_diagnostico,
        (quantidade_evidencias > 0) as possui_evidencias,
        (quantidade_recomendacoes > 0) as possui_recomendacao,
        (os_id IS NOT NULL) as possui_os,
        EXTRACT(EPOCH FROM (now() - created_at))/86400 as dias_em_aberto,
        -- Tempos médios
        data_checkin - created_at as tempo_solicitacao_ate_checkin,
        data_finalizacao - data_checkin as tempo_checkin_ate_finalizacao,
        data_liberacao_recomendacao - data_finalizacao as tempo_finalizacao_ate_aprovacao,
        data_conversao_os - data_liberacao_recomendacao as tempo_aprovacao_ate_os
    FROM aggregations
)
SELECT 
    *,
    CASE 
        WHEN status_solicitacao = 'pendente' THEN 'Aguardando triagem'
        WHEN status_solicitacao = 'aberta' AND consultor_id IS NULL THEN 'Atribuir consultor'
        WHEN status_solicitacao = 'atribuida' THEN 'Agendar visita'
        WHEN (status_solicitacao = 'agendada' OR registro_consultor_id IS NOT NULL) AND data_checkin IS NULL THEN 'Realizar check-in'
        WHEN data_checkin IS NOT NULL AND status_visita = 'rascunho' THEN 'Registrar visita'
        WHEN status_visita = 'rascunho' AND quantidade_diagnosticos > 0 AND quantidade_recomendacoes > 0 THEN 'Finalizar visita'
        WHEN status_visita = 'finalizado' AND status_aprovacao IS NULL THEN 'Liberar recomendação'
        WHEN status_aprovacao = 'pendente' THEN 'Aguardando aprovação gestor'
        WHEN status_aprovacao = 'aprovado' AND status_solicitacao = 'aguardando_decisao_produtor' THEN 'Aguardando decisão do produtor'
        WHEN status_solicitacao = 'aguardando_decisao_produtor' AND possui_os = false THEN 'Converter em OS'
        WHEN possui_os THEN 'Concluído'
        ELSE 'Verificar status'
    END as proxima_acao,
    NULL::text as bloqueios
FROM final_data;

GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO service_role;

-- Recriar vw_os_integridade_esteira
DROP VIEW IF EXISTS public.vw_os_integridade_esteira CASCADE;

CREATE OR REPLACE VIEW public.vw_os_integridade_esteira WITH (security_invoker = true) AS
WITH base_os AS (
    SELECT id as os_id, 'manual' as origem_os, numero_os, cliente_id, fazenda_id, talhao_id, status::text as status, created_at, volume_total_ml, produto_id, microrganismo_id FROM ordens_servico
    UNION ALL
    SELECT id as os_id, 'onfarm' as origem_os, numero_os, cliente_id, fazenda_id, talhao_id, status::text as status, created_at, volume_total_ml, produto_id, NULL::uuid as microrganismo_id FROM ordens_servico_onfarm
),
esteira_full AS (
    SELECT 
        bos.*,
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
