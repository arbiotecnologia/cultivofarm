-- 1. Criação de Índices de Performance
CREATE INDEX IF NOT EXISTS idx_registros_consultor_solicitacao_id ON public.registros_consultor(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_visitas_checkin_registro_consultor_id ON public.visitas_checkin(registro_consultor_id);
CREATE INDEX IF NOT EXISTS idx_visitas_checkin_solicitacao_id ON public.visitas_checkin(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_arquivos_registro_id ON public.registros_consultor_arquivos(registro_consultor_id);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_recomendacoes_registro_id ON public.registros_consultor_recomendacoes(registro_consultor_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_onfarm_solicitacao_id ON public.ordens_servico_onfarm(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_programacao_producao_os_onfarm_id ON public.programacao_producao(ordem_servico_onfarm_id);
CREATE INDEX IF NOT EXISTS idx_entregas_os_onfarm_id ON public.entregas(ordem_servico_onfarm_id);

-- 2. Recriação da View de Integridade da OS
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira;

CREATE OR REPLACE VIEW public.vw_os_integridade_esteira 
WITH (security_invoker = true) AS
WITH base_os AS (
    SELECT 
        id AS os_id,
        'manual'::text AS origem_os,
        numero_os,
        cliente_id,
        status::text AS status_os,
        prioridade,
        created_at
    FROM public.ordens_servico
    UNION ALL
    SELECT 
        id AS os_id,
        'onfarm'::text AS origem_os,
        numero_os,
        cliente_id,
        status::text AS status_os,
        prioridade,
        created_at
    FROM public.ordens_servico_onfarm
),
esteira_data AS (
    SELECT 
        bos.os_id,
        bos.origem_os,
        bos.numero_os,
        bos.cliente_id,
        c.nome AS cliente_nome,
        bos.status_os,
        bos.prioridade,
        pp.status::text AS status_programacao,
        pp.id AS programacao_id,
        pp.data_programada,
        pp.responsavel_id,
        pp.created_at AS programacao_created_at,
        bos.created_at AS os_created_at,
        l.status::text AS status_lote,
        l.id AS lote_id,
        l.codigo_lote,
        cq.resultado::text AS status_cq,
        ev.id AS envase_id,
        ep.status::text AS status_estoque,
        ep.id AS estoque_id,
        ep.quantidade_reservada,
        ent.status::text AS status_entrega,
        ap.id AS aplicacao_id,
        (pp.id IS NOT NULL) AS possui_programacao,
        (l.id IS NOT NULL) AS possui_lote,
        (cq.resultado::text = 'aprovado') AS possui_cq_aprovado,
        (ev.id IS NOT NULL) AS possui_envase,
        (ep.id IS NOT NULL) AS possui_estoque,
        (ep.status::text = 'reservado') AS possui_reserva,
        (ent.id IS NOT NULL) AS possui_entrega,
        (ent.status = 'entregue'::status_entrega) AS possui_entrega_confirmada,
        (ap.id IS NOT NULL) AS possui_aplicacao
    FROM base_os bos
    LEFT JOIN public.clientes c ON bos.cliente_id = c.id
    LEFT JOIN public.programacao_producao pp ON (
        (bos.origem_os = 'manual' AND pp.ordem_servico_id = bos.os_id) OR 
        (bos.origem_os = 'onfarm' AND pp.ordem_servico_onfarm_id = bos.os_id)
    )
    LEFT JOIN public.lotes l ON pp.id = l.programacao_id
    LEFT JOIN LATERAL (
        SELECT q.resultado FROM public.controle_qualidade q WHERE q.lote_id = l.id ORDER BY q.created_at DESC LIMIT 1
    ) cq ON true
    LEFT JOIN public.envase ev ON l.id = ev.lote_id
    LEFT JOIN LATERAL (
        SELECT e.id, e.status, e.quantidade_reservada FROM public.estoque_produto e WHERE e.lote_id = l.id ORDER BY e.created_at DESC LIMIT 1
    ) ep ON true
    LEFT JOIN public.entregas ent ON (
        (bos.origem_os = 'manual' AND ent.ordem_servico_id = bos.os_id) OR
        (bos.origem_os = 'onfarm' AND ent.ordem_servico_onfarm_id = bos.os_id)
    )
    LEFT JOIN public.aplicacoes ap ON (
        (bos.origem_os = 'manual' AND ap.ordem_servico_id = bos.os_id) OR
        (bos.origem_os = 'onfarm' AND ap.ordem_servico_onfarm_id = bos.os_id)
    )
)
SELECT 
    os_id,
    origem_os,
    numero_os,
    cliente_id,
    cliente_nome,
    status_os,
    status_programacao,
    status_lote,
    status_cq,
    CASE WHEN envase_id IS NOT NULL THEN 'concluido' ELSE 'pendente' END AS status_envase,
    status_estoque,
    CASE WHEN possui_reserva THEN 'reservado' ELSE 'pendente' END AS status_reserva,
    status_entrega,
    CASE WHEN possui_aplicacao THEN 'concluida' ELSE 'pendente' END AS status_aplicacao,
    possui_programacao,
    possui_lote,
    possui_cq_aprovado,
    possui_envase,
    possui_estoque,
    possui_reserva,
    possui_entrega,
    possui_aplicacao,
    false AS aplicacao_bloqueante,
    (possui_programacao AND possui_lote AND possui_cq_aprovado AND possui_envase AND possui_estoque AND possui_entrega_confirmada) AS pode_finalizar,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN NOT possui_programacao THEN 'sem programação' END,
        CASE WHEN NOT possui_lote THEN 'sem lote' END,
        CASE WHEN NOT possui_cq_aprovado THEN 'CQ não aprovado' END,
        CASE WHEN NOT possui_envase THEN 'sem envase' END,
        CASE WHEN NOT possui_estoque THEN 'sem estoque' END,
        CASE WHEN NOT possui_entrega_confirmada THEN 'sem entrega confirmada' END
    ], NULL) AS bloqueios,
    CASE 
        WHEN NOT possui_programacao THEN 'Programar produção'
        WHEN NOT possui_lote THEN 'Gerar lote'
        WHEN NOT possui_cq_aprovado THEN 'Realizar CQ'
        WHEN NOT possui_envase THEN 'Registrar envase'
        WHEN NOT possui_estoque THEN 'Gerar estoque'
        WHEN NOT possui_entrega THEN 'Registrar entrega'
        WHEN NOT possui_entrega_confirmada THEN 'Confirmar entrega'
        ELSE 'Finalizar laboratório'
    END AS proxima_acao,
    status_os AS status_esteira_oficial,
    programacao_id,
    data_programada,
    responsavel_id,
    lote_id,
    codigo_lote,
    envase_id,
    estoque_id,
    quantidade_reservada,
    os_created_at,
    programacao_created_at
FROM esteira_data;

-- 3. Recriação da View da Esteira Laboratorial
CREATE OR REPLACE VIEW public.vw_esteira_laboratorio 
WITH (security_invoker = true) AS
SELECT 
    v.origem_os,
    v.os_id,
    v.numero_os,
    v.cliente_id,
    v.cliente_nome,
    COALESCE(osm.fazenda_id, osf.fazenda_id) AS fazenda_id,
    f.nome AS fazenda_nome,
    COALESCE(osm.talhao_id, osf.talhao_id) AS talhao_id,
    t.nome AS talhao_nome,
    COALESCE(osm.produto_id, osf.produto_id) AS produto_id,
    p.nome AS produto_nome,
    osm.microrganismo_id,
    m.nome AS microrganismo_nome,
    COALESCE(osm.volume_total_ml, osf.volume_total_ml) AS volume_solicitado_ml,
    (COALESCE(osm.volume_total_ml, osf.volume_total_ml) / 1000.0)::numeric(12,2) AS volume_solicitado_l,
    v.data_programada,
    v.os_created_at AS data_criacao_os,
    v.programacao_created_at AS data_inicio_producao,
    l.data_producao AS data_lote,
    cq.data_aprovacao AS data_cq,
    ev.created_at AS data_envase,
    ep.created_at AS data_estoque,
    ent.data_saida AS data_entrega,
    v.status_os,
    v.status_programacao,
    v.lote_id,
    v.codigo_lote,
    v.status_lote,
    v.status_cq AS cq_resultado,
    v.envase_id,
    v.estoque_id,
    ent.id AS entrega_id,
    v.status_entrega AS entrega_status,
    v.status_aplicacao AS aplicacao_status,
    v.possui_aplicacao AS aplicacao_informativa,
    v.proxima_acao,
    ((v.data_programada < CURRENT_DATE) AND (v.status_os NOT IN ('finalizada', 'entregue', 'cancelada'))) AS atrasado,
    (v.programacao_created_at - v.os_created_at) AS tempo_os_ate_programacao,
    (l.data_producao::timestamp with time zone - v.data_programada::timestamp with time zone) AS tempo_programacao_ate_lote,
    (cq.data_aprovacao - l.data_producao::timestamp with time zone) AS tempo_lote_ate_cq,
    (ev.created_at - cq.data_aprovacao) AS tempo_cq_ate_envase,
    (ent.data_saida::timestamp with time zone - ev.created_at) AS tempo_envase_ate_entrega,
    (ent.data_saida::timestamp with time zone - v.os_created_at) AS tempo_os_ate_entrega,
    v.os_created_at AS created_at,
    now() AS updated_at
FROM public.vw_os_integridade_esteira v
LEFT JOIN public.ordens_servico osm ON (v.os_id = osm.id AND v.origem_os = 'manual')
LEFT JOIN public.ordens_servico_onfarm osf ON (v.os_id = osf.id AND v.origem_os = 'onfarm')
LEFT JOIN public.fazendas f ON f.id = COALESCE(osm.fazenda_id, osf.fazenda_id)
LEFT JOIN public.talhoes t ON t.id = COALESCE(osm.talhao_id, osf.talhao_id)
LEFT JOIN public.produtos p ON p.id = COALESCE(osm.produto_id, osf.produto_id)
LEFT JOIN public.microrganismos m ON m.id = osm.microrganismo_id
LEFT JOIN public.lotes l ON l.id = v.lote_id
LEFT JOIN LATERAL (SELECT created_at AS data_aprovacao FROM public.controle_qualidade WHERE lote_id = v.lote_id AND resultado = 'aprovado' ORDER BY created_at DESC LIMIT 1) cq ON true
LEFT JOIN public.envase ev ON ev.id = v.envase_id
LEFT JOIN public.estoque_produto ep ON ep.id = v.estoque_id
LEFT JOIN public.entregas ent ON (
    (v.origem_os = 'manual' AND ent.ordem_servico_id = v.os_id) OR
    (v.origem_os = 'onfarm' AND ent.ordem_servico_onfarm_id = v.os_id)
);

-- 4. Recriação da View do Fluxo de Visita Técnica
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;

CREATE OR REPLACE VIEW public.vw_fluxo_visita_tecnica 
WITH (security_invoker = true) AS
WITH last_checkin AS (
    SELECT DISTINCT ON (registro_consultor_id, solicitacao_id)
        registro_consultor_id,
        solicitacao_id,
        created_at AS data_checkin
    FROM public.visitas_checkin
    ORDER BY registro_consultor_id, solicitacao_id, created_at DESC
),
last_aprovacao AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        status_aprovacao,
        created_at AS data_aprovacao
    FROM public.aprovacoes_tecnicas
    ORDER BY registro_consultor_id, created_at DESC
),
last_recomendacao AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        created_at AS data_recomendacao
    FROM public.registros_consultor_recomendacoes
    ORDER BY registro_consultor_id, created_at DESC
),
counts AS (
    SELECT 
        r.id AS registro_id,
        (SELECT count(*) FROM public.visita_diagnosticos d WHERE d.registro_id = r.id) AS quantidade_diagnosticos,
        (SELECT count(*) FROM public.registros_consultor_arquivos a WHERE a.registro_consultor_id = r.id) AS quantidade_evidencias,
        (SELECT count(*) FROM public.registros_consultor_recomendacoes rec WHERE rec.registro_consultor_id = r.id) AS quantidade_recomendacoes
    FROM public.registros_consultor r
),
os_link AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        id AS os_id,
        numero_os,
        status AS status_os,
        created_at AS data_conversao_os
    FROM public.ordens_servico_onfarm
    ORDER BY registro_consultor_id, created_at DESC
),
base_visita AS (
    SELECT 
        s.id AS solicitacao_id,
        s.numero_solicitacao,
        v.id AS registro_consultor_id,
        v.codigo_visita,
        COALESCE(s.cliente_id, v.cliente_id) AS cliente_id,
        COALESCE(s.fazenda_id, v.fazenda_id) AS fazenda_id,
        COALESCE(s.talhao_id, v.talhao_id) AS talhao_id,
        COALESCE(s.consultor_atribuido, v.consultor_responsavel) AS consultor_id,
        s.status AS status_solicitacao,
        v.status AS status_visita,
        v.tipo_visita,
        s.tipo_demanda,
        s.data_prevista_atendimento,
        v.data_vistoria,
        v.hora_fim AS data_finalizacao,
        s.created_at AS created_at_solicitacao,
        v.created_at AS created_at_visita,
        s.updated_at AS updated_at_solicitacao,
        v.updated_at AS updated_at_visita,
        CASE 
            WHEN s.id IS NOT NULL AND v.id IS NULL THEN 'solicitacao_sem_visita'::text
            WHEN s.id IS NOT NULL AND v.id IS NOT NULL THEN 'visita_com_solicitacao'::text
            WHEN s.id IS NULL AND v.id IS NOT NULL THEN 'visita_avulsa'::text
        END AS origem_fluxo
    FROM public.portal_solicitacoes s
    FULL JOIN public.registros_consultor v ON s.id = v.solicitacao_id
)
SELECT 
    bv.origem_fluxo,
    bv.solicitacao_id,
    bv.numero_solicitacao,
    bv.registro_consultor_id,
    bv.codigo_visita,
    bv.cliente_id,
    c.nome AS cliente_nome,
    bv.fazenda_id,
    f.nome AS fazenda_nome,
    bv.talhao_id,
    t.nome AS talhao_nome,
    bv.consultor_id,
    p.nome AS consultor_nome,
    bv.status_solicitacao,
    bv.status_visita::text,
    la.status_aprovacao::text AS status_aprovacao,
    COALESCE(bv.tipo_demanda, bv.tipo_visita::text) AS tipo_demanda,
    bv.data_prevista_atendimento,
    lc.data_checkin,
    bv.data_vistoria,
    bv.data_finalizacao,
    lr.data_recomendacao AS data_liberacao_recomendacao,
    osl.data_conversao_os,
    (lc.data_checkin IS NOT NULL) AS possui_checkin,
    (cts.quantidade_diagnosticos > 0) AS possui_diagnostico,
    COALESCE(cts.quantidade_diagnosticos, 0) AS quantidade_diagnosticos,
    (cts.quantidade_evidencias > 0) AS possui_evidencias,
    COALESCE(cts.quantidade_evidencias, 0) AS quantidade_evidencias,
    (cts.quantidade_recomendacoes > 0) AS possui_recomendacao,
    COALESCE(cts.quantidade_recomendacoes, 0) AS quantidade_recomendacoes,
    (osl.os_id IS NOT NULL) AS possui_os,
    osl.os_id,
    osl.numero_os,
    osl.status_os::text,
    CASE 
        WHEN bv.status_solicitacao IN ('pendente', 'aberta') THEN 'Aguardando triagem'
        WHEN bv.consultor_id IS NULL THEN 'Atribuir consultor'
        WHEN bv.data_prevista_atendimento IS NULL THEN 'Agendar visita'
        WHEN lc.data_checkin IS NULL AND bv.status_solicitacao = 'agendada' THEN 'Realizar check-in'
        WHEN lc.data_checkin IS NOT NULL AND bv.registro_consultor_id IS NULL THEN 'Registrar visita'
        WHEN bv.status_visita::text = 'rascunho' THEN 'Finalizar visita'
        WHEN bv.status_visita::text = 'finalizado' AND COALESCE(cts.quantidade_recomendacoes, 0) = 0 THEN 'Emitir recomendação'
        WHEN COALESCE(cts.quantidade_recomendacoes, 0) > 0 AND (la.status_aprovacao IS NULL OR la.status_aprovacao != 'aprovado') THEN 'Liberar recomendação'
        WHEN la.status_aprovacao = 'aprovado' AND bv.status_solicitacao = 'aguardando_decisao_produtor' THEN 'Aguardando decisão do produtor'
        WHEN la.status_aprovacao = 'aprovado' AND osl.os_id IS NULL THEN 'Converter em OS'
        WHEN osl.os_id IS NOT NULL THEN 'Abrir OS'
        WHEN bv.status_visita::text IN ('convertido_os', 'concluido') OR bv.status_solicitacao = 'concluida' THEN 'Concluído'
        ELSE 'Ver detalhes'
    END AS proxima_acao,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN lc.data_checkin IS NOT NULL AND bv.registro_consultor_id IS NULL THEN 'check-in sem registro_consultor_id' END,
        CASE WHEN la.status_aprovacao = 'aprovado' AND COALESCE(cts.quantidade_recomendacoes, 0) = 0 THEN 'visita aprovada sem recomendação' END,
        CASE WHEN osl.os_id IS NULL AND bv.status_visita::text = 'convertido_os' THEN 'visita convertido_os sem OS vinculada' END,
        CASE WHEN bv.registro_consultor_id IS NOT NULL AND (SELECT count(*) FROM public.ordens_servico_onfarm WHERE registro_consultor_id = bv.registro_consultor_id) > 1 THEN 'OS duplicada' END,
        CASE WHEN bv.registro_consultor_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.registros_consultor_arquivos a WHERE a.registro_consultor_id = bv.registro_consultor_id AND a.arquivo_path IS NULL) THEN 'evidência sem arquivo_path' END
    ], NULL) AS bloqueios,
    EXTRACT(DAY FROM (now() - bv.created_at_solicitacao))::integer AS dias_em_aberto,
    (lc.data_checkin - bv.created_at_solicitacao) AS tempo_solicitacao_ate_checkin,
    (bv.data_finalizacao - lc.data_checkin) AS tempo_checkin_ate_finalizacao,
    (lr.data_recomendacao - bv.data_finalizacao) AS tempo_finalizacao_ate_aprovacao,
    (osl.data_conversao_os - lr.data_recomendacao) AS tempo_aprovacao_ate_os,
    COALESCE(bv.created_at_visita, bv.created_at_solicitacao) AS created_at,
    COALESCE(bv.updated_at_visita, bv.updated_at_solicitacao) AS updated_at
FROM base_visita bv
LEFT JOIN public.clientes c ON bv.cliente_id = c.id
LEFT JOIN public.fazendas f ON bv.fazenda_id = f.id
LEFT JOIN public.talhoes t ON bv.talhao_id = t.id
LEFT JOIN public.profiles p ON bv.consultor_id = p.id
LEFT JOIN last_checkin lc ON (bv.registro_consultor_id = lc.registro_consultor_id OR (bv.registro_consultor_id IS NULL AND bv.solicitacao_id = lc.solicitacao_id))
LEFT JOIN last_aprovacao la ON bv.registro_consultor_id = la.registro_consultor_id
LEFT JOIN last_recomendacao lr ON bv.registro_consultor_id = lr.registro_consultor_id
LEFT JOIN counts cts ON bv.registro_consultor_id = cts.registro_id
LEFT JOIN os_link osl ON bv.registro_consultor_id = osl.registro_consultor_id;
