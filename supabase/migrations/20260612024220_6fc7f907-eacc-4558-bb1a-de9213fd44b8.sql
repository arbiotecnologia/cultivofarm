-- 1. Refinar vw_fluxo_visita_tecnica para evitar duplicidades e ajustar proxima_acao
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;

CREATE VIEW public.vw_fluxo_visita_tecnica WITH (security_invoker = true) AS
WITH cte_checkins AS (
    SELECT 
        registro_consultor_id,
        MIN(data_hora_checkin) as data_checkin,
        COUNT(*) as total_checkins
    FROM public.visitas_checkin
    GROUP BY registro_consultor_id
),
cte_diagnosticos AS (
    SELECT 
        registro_id as registro_consultor_id,
        COUNT(*) as total_diagnosticos
    FROM public.visita_diagnosticos
    GROUP BY registro_id
),
cte_evidencias AS (
    SELECT 
        registro_consultor_id,
        COUNT(*) as total_evidencias,
        EXISTS (SELECT 1 FROM public.registros_consultor_arquivos rca2 WHERE rca2.registro_consultor_id = rca.registro_consultor_id AND rca2.arquivo_path IS NULL) as tem_arquivo_sem_path
    FROM public.registros_consultor_arquivos rca
    GROUP BY registro_consultor_id
),
cte_recomendacoes AS (
    SELECT 
        registro_consultor_id,
        COUNT(*) as total_recomendacoes,
        EXISTS (
            SELECT 1 FROM public.registros_consultor_recomendacoes rcr2 
            WHERE rcr2.registro_consultor_id = rcr.registro_consultor_id 
            AND (NULLIF(trim(rcr2.recomendacao_tecnica), '') IS NOT NULL 
                 OR NULLIF(trim(rcr2.observacoes_finais), '') IS NOT NULL 
                 OR rcr2.estrategia_manejo IS NOT NULL)
        ) as possui_conteudo_real
    FROM public.registros_consultor_recomendacoes rcr
    GROUP BY registro_consultor_id
),
cte_os_stats AS (
    SELECT 
        registro_consultor_id,
        COUNT(*) as total_os_vinculadas
    FROM public.ordens_servico_onfarm
    GROUP BY registro_consultor_id
),
cte_os_single AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        id as os_id,
        numero_os,
        status::text as status_os,
        created_at as data_geracao_os
    FROM public.ordens_servico_onfarm
    ORDER BY registro_consultor_id, created_at DESC
),
cte_logs_datas AS (
    SELECT 
        registro_consultor_id,
        MAX(CASE WHEN acao = 'visita_finalizada' THEN created_at END) as data_log_finalizacao,
        MAX(CASE WHEN acao = 'recomendacao_liberada' THEN created_at END) as data_log_liberacao,
        MAX(CASE WHEN acao = 'os_gerada' THEN created_at END) as data_log_conversao
    FROM public.visitas_logs
    GROUP BY registro_consultor_id
),
cte_status_logs AS (
    SELECT 
        registro_consultor_id,
        MAX(CASE WHEN status_novo = 'aprovado' THEN changed_at END) as data_status_aprovado,
        MAX(CASE WHEN status_novo = 'convertido_os' THEN changed_at END) as data_status_convertido
    FROM public.registros_consultor_status_log
    GROUP BY registro_consultor_id
),
cte_aprovacoes AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        status_aprovacao::text as status_aprovacao,
        data_aprovacao
    FROM public.aprovacoes_tecnicas
    ORDER BY registro_consultor_id, created_at DESC
),
base_fluxo AS (
    SELECT 
        CASE WHEN rc.id IS NOT NULL THEN 'visita_com_solicitacao'::text ELSE 'solicitacao_sem_visita'::text END as origem_fluxo,
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
        ps.created_at as solicitacao_created_at,
        rc.created_at as visita_created_at,
        rc.updated_at as visita_updated_at
    FROM public.portal_solicitacoes ps
    LEFT JOIN public.registros_consultor rc ON ps.id = rc.solicitacao_id
    
    UNION ALL
    
    SELECT 
        'visita_avulsa'::text as origem_fluxo,
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
        NULL::timestamp with time zone as solicitacao_created_at,
        rc.created_at as visita_created_at,
        rc.updated_at as visita_updated_at
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
    c.nome as cliente_nome,
    bf.fazenda_id,
    f.nome as fazenda_nome,
    bf.talhao_id,
    t.nome as talhao_nome,
    bf.consultor_id,
    u.nome as consultor_nome,
    bf.status_solicitacao,
    bf.status_visita,
    COALESCE(ap.status_aprovacao, 'pendente') as status_aprovacao,
    bf.tipo_demanda,
    bf.data_prevista_atendimento,
    ck.data_checkin,
    bf.visita_created_at as data_vistoria,
    COALESCE(cl.data_log_finalizacao, CASE WHEN bf.status_visita = 'finalizado' THEN bf.visita_updated_at END) as data_finalizacao,
    COALESCE(cl.data_log_liberacao, sl.data_status_aprovado, ap.data_aprovacao) as data_liberacao_recomendacao,
    COALESCE(os.data_geracao_os, cl.data_log_conversao, sl.data_status_convertido) as data_conversao_os,
    (ck.data_checkin IS NOT NULL) as possui_checkin,
    (COALESCE(dg.total_diagnosticos, 0) > 0) as possui_diagnostico,
    COALESCE(dg.total_diagnosticos, 0) as quantidade_diagnosticos,
    (COALESCE(ev.total_evidencias, 0) > 0) as possui_evidencias,
    COALESCE(ev.total_evidencias, 0) as quantidade_evidencias,
    COALESCE(rc.possui_conteudo_real, false) as possui_recomendacao,
    COALESCE(rc.total_recomendacoes, 0) as quantidade_recomendacoes,
    (os.os_id IS NOT NULL) as possui_os,
    os.os_id,
    os.numero_os,
    os.status_os,
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
    END as proxima_acao,
    ARRAY(
        SELECT unnest(
            CASE WHEN bf.consultor_id IS NULL THEN ARRAY['sem_consultor'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_solicitacao = 'aberta' AND bf.consultor_id IS NOT NULL THEN ARRAY['sem_agendamento'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.registro_consultor_id IS NOT NULL AND ck.data_checkin IS NULL THEN ARRAY['sem_checkin'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'finalizado' AND COALESCE(dg.total_diagnosticos, 0) = 0 THEN ARRAY['sem_diagnostico'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'finalizado' AND COALESCE(ev.total_evidencias, 0) = 0 THEN ARRAY['sem_evidencia'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'finalizado' AND NOT COALESCE(rc.possui_conteudo_real, false) THEN ARRAY['sem_recomendacao'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'aprovado' AND NOT COALESCE(rc.possui_conteudo_real, false) THEN ARRAY['aprovada_sem_recomendacao'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'aprovado' AND bf.status_solicitacao NOT IN ('aguardando_decisao_produtor', 'convertida_os', 'concluida') THEN ARRAY['aprovada_com_solicitacao_antiga'] ELSE ARRAY[]::text[] END ||
            CASE WHEN bf.status_visita = 'convertido_os' AND os.os_id IS NULL THEN ARRAY['convertida_os_sem_os'] ELSE ARRAY[]::text[] END ||
            CASE WHEN COALESCE(oss.total_os_vinculadas, 0) > 1 THEN ARRAY['os_duplicada'] ELSE ARRAY[]::text[] END ||
            CASE WHEN ev.tem_arquivo_sem_path THEN ARRAY['evidencia_sem_arquivo_path'] ELSE ARRAY[]::text[] END
        )
    ) as bloqueios,
    EXTRACT(EPOCH FROM (now() - COALESCE(bf.solicitacao_created_at, bf.visita_created_at))) / 86400.0 as dias_em_aberto,
    EXTRACT(EPOCH FROM (ck.data_checkin - bf.solicitacao_created_at)) / 3600.0 as tempo_solicitacao_ate_checkin,
    EXTRACT(EPOCH FROM (COALESCE(cl.data_log_finalizacao, CASE WHEN bf.status_visita = 'finalizado' THEN bf.visita_updated_at END) - ck.data_checkin)) / 3600.0 as tempo_checkin_ate_finalizacao,
    EXTRACT(EPOCH FROM (COALESCE(cl.data_log_liberacao, sl.data_status_aprovado, ap.data_aprovacao) - COALESCE(cl.data_log_finalizacao, CASE WHEN bf.status_visita = 'finalizado' THEN bf.visita_updated_at END))) / 3600.0 as tempo_finalizacao_ate_aprovacao,
    EXTRACT(EPOCH FROM (COALESCE(os.data_geracao_os, cl.data_log_conversao, sl.data_status_convertido) - COALESCE(cl.data_log_liberacao, sl.data_status_aprovado, ap.data_aprovacao))) / 3600.0 as tempo_aprovacao_ate_os,
    COALESCE(bf.solicitacao_created_at, bf.visita_created_at) as created_at,
    COALESCE(bf.visita_updated_at, bf.solicitacao_created_at) as updated_at
FROM base_fluxo bf
LEFT JOIN cte_checkins ck ON bf.registro_consultor_id = ck.registro_consultor_id
LEFT JOIN cte_diagnosticos dg ON bf.registro_consultor_id = dg.registro_consultor_id
LEFT JOIN cte_evidencias ev ON bf.registro_consultor_id = ev.registro_consultor_id
LEFT JOIN cte_recomendacoes rc ON bf.registro_consultor_id = rc.registro_consultor_id
LEFT JOIN cte_os_stats oss ON bf.registro_consultor_id = oss.registro_consultor_id
LEFT JOIN cte_os_single os ON bf.registro_consultor_id = os.registro_consultor_id
LEFT JOIN cte_logs_datas cl ON bf.registro_consultor_id = cl.registro_consultor_id
LEFT JOIN cte_status_logs sl ON bf.registro_consultor_id = sl.registro_consultor_id
LEFT JOIN cte_aprovacoes ap ON bf.registro_consultor_id = ap.registro_consultor_id
LEFT JOIN public.clientes c ON bf.cliente_id = c.id
LEFT JOIN public.fazendas f ON bf.fazenda_id = f.id
LEFT JOIN public.talhoes t ON bf.talhao_id = t.id
LEFT JOIN public.profiles u ON bf.consultor_id = u.user_id;

GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO service_role;

-- 2. Refinar vw_os_integridade_esteira e vw_esteira_laboratorio
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
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
        bos.status as status_os,
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
    (data_entrega IS NOT NULL AND (entrega_status = 'entregue' OR entrega_status = 'finalizado')) as pode_finalizar,
    false as aplicacao_bloqueante,
    ARRAY(
        SELECT unnest(
            CASE WHEN aplicacao_id IS NULL THEN ARRAY['aplicacao_nao_registrada'] ELSE ARRAY[]::text[] END
        )
    ) as pendencias_informativas,
    (data_programada < now() AND (entrega_status IS NULL OR (entrega_status != 'entregue' AND entrega_status != 'finalizado'))) as atrasado,
    status_os as status_esteira_oficial,
    ARRAY(
        SELECT unnest(
            CASE WHEN programacao_id IS NULL THEN ARRAY['sem_programacao'] ELSE ARRAY[]::text[] END ||
            CASE WHEN lote_id IS NULL THEN ARRAY['sem_lote'] ELSE ARRAY[]::text[] END ||
            CASE WHEN cq_id IS NULL THEN ARRAY['cq_pendente'] ELSE ARRAY[]::text[] END ||
            CASE WHEN cq_resultado = 'reprovado' THEN ARRAY['cq_reprovado'] ELSE ARRAY[]::text[] END ||
            CASE WHEN envase_id IS NULL AND cq_resultado = 'aprovado' THEN ARRAY['sem_envase'] ELSE ARRAY[]::text[] END ||
            CASE WHEN estoque_id IS NULL AND envase_id IS NOT NULL THEN ARRAY['sem_estoque'] ELSE ARRAY[]::text[] END ||
            CASE WHEN (entrega_status IS NULL OR (entrega_status != 'entregue' AND entrega_status != 'finalizado')) AND estoque_id IS NOT NULL THEN ARRAY['sem_entrega_confirmada'] ELSE ARRAY[]::text[] END
        )
    ) as bloqueios,
    data_inicio_producao - created_at as tempo_os_ate_programacao,
    data_lote - data_inicio_producao as tempo_programacao_ate_lote,
    data_cq - data_lote as tempo_lote_ate_cq,
    data_envase - data_cq as tempo_cq_ate_envase,
    data_entrega - data_envase as tempo_envase_ate_entrega,
    data_entrega - created_at as tempo_os_ate_entrega
FROM esteira_full;

GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO service_role;

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
        WHEN estoque_id IS NOT NULL AND (entrega_status IS NULL OR (entrega_status != 'entregue' AND entrega_status != 'finalizado')) THEN 'Realizar Entrega'
        WHEN (entrega_status = 'entregue' OR entrega_status = 'finalizado') AND status_os != 'finalizado' THEN 'Finalizar OS'
        WHEN status_os = 'finalizado' THEN 'Concluído'
        ELSE 'Verificar status'
    END as proxima_acao
FROM vw_os_integridade_esteira v;

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;