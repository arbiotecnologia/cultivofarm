CREATE OR REPLACE VIEW public.vw_os_integridade_esteira WITH (security_invoker=true) AS
 WITH base_os AS (
         SELECT ordens_servico.id AS os_id,
            'manual'::text AS origem_os,
            ordens_servico.numero_os,
            ordens_servico.cliente_id,
            ordens_servico.fazenda_id,
            ordens_servico.talhao_id,
            ordens_servico.status::text AS status_os,
            ordens_servico.created_at,
            ordens_servico.volume_total_ml,
            ordens_servico.produto_id,
            ordens_servico.microrganismo_id,
            ordens_servico.prioridade::text AS prioridade
           FROM ordens_servico
        UNION ALL
         SELECT ordens_servico_onfarm.id AS os_id,
            'onfarm'::text AS origem_os,
            ordens_servico_onfarm.numero_os,
            ordens_servico_onfarm.cliente_id,
            ordens_servico_onfarm.fazenda_id,
            ordens_servico_onfarm.talhao_id,
            ordens_servico_onfarm.status::text AS status_os,
            ordens_servico_onfarm.created_at,
            ordens_servico_onfarm.volume_total_ml,
            ordens_servico_onfarm.produto_id,
            NULL::uuid AS microrganismo_id,
            ordens_servico_onfarm.prioridade::text AS prioridade
           FROM ordens_servico_onfarm
        ), esteira_data AS (
         SELECT bos.os_id,
            bos.origem_os,
            bos.numero_os,
            bos.cliente_id,
            bos.fazenda_id,
            bos.talhao_id,
            bos.status_os,
            bos.created_at,
            bos.volume_total_ml,
            bos.produto_id,
            bos.microrganismo_id,
            bos.prioridade,
            bos.volume_total_ml::double precision / 1000.0::double precision AS volume_solicitado_l,
            c.nome AS cliente_nome,
            f.nome AS fazenda_nome,
            t.nome AS talhao_nome,
            p.nome AS produto_nome,
            m.nome AS microrganismo_nome,
            pp.id AS programacao_id,
            pp.status::text AS status_programacao,
            pp.data_programada,
            pp.created_at AS data_inicio_producao,
            l.id AS lote_id,
            l.codigo_lote,
            l.status::text AS status_lote,
            l.created_at AS data_lote,
            cq.id AS cq_id,
            cq.resultado::text AS cq_resultado,
            cq.created_at AS data_cq,
            ev.id AS envase_id,
            ev.created_at AS data_envase,
            ep.id AS estoque_id,
            ep.created_at AS data_estoque,
            ent.id AS entrega_id,
            ent.status::text AS entrega_status,
            ent.created_at AS data_entrega,
            app.id AS aplicacao_id,
            app.created_at AS data_aplicacao
           FROM base_os bos
             LEFT JOIN clientes c ON bos.cliente_id = c.id
             LEFT JOIN fazendas f ON bos.fazenda_id = f.id
             LEFT JOIN talhoes t ON bos.talhao_id = t.id
             LEFT JOIN produtos p ON bos.produto_id = p.id
             LEFT JOIN microrganismos m ON bos.microrganismo_id = m.id
             LEFT JOIN LATERAL ( SELECT programacao_producao.id, programacao_producao.status, programacao_producao.data_programada, programacao_producao.created_at
                   FROM programacao_producao
                  WHERE bos.origem_os = bos.origem_os AND (bos.origem_os = 'manual'::text AND programacao_producao.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND programacao_producao.ordem_servico_onfarm_id = bos.os_id)
                  ORDER BY programacao_producao.created_at DESC LIMIT 1) pp ON true
             LEFT JOIN LATERAL ( SELECT lotes.id, lotes.codigo_lote, lotes.status, lotes.created_at FROM lotes WHERE lotes.programacao_id = pp.id ORDER BY lotes.created_at DESC LIMIT 1) l ON true
             LEFT JOIN LATERAL ( SELECT controle_qualidade.id, controle_qualidade.resultado, controle_qualidade.created_at FROM controle_qualidade WHERE controle_qualidade.lote_id = l.id ORDER BY controle_qualidade.created_at DESC LIMIT 1) cq ON true
             LEFT JOIN LATERAL ( SELECT envase.id, envase.created_at FROM envase WHERE envase.lote_id = l.id ORDER BY envase.created_at DESC LIMIT 1) ev ON true
             LEFT JOIN LATERAL ( SELECT estoque_produto.id, estoque_produto.created_at FROM estoque_produto WHERE estoque_produto.lote_id = l.id ORDER BY estoque_produto.created_at DESC LIMIT 1) ep ON true
             LEFT JOIN LATERAL ( SELECT entregas.id, entregas.status, entregas.created_at FROM entregas
                  WHERE bos.origem_os = bos.origem_os AND (bos.origem_os = 'manual'::text AND entregas.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND entregas.ordem_servico_onfarm_id = bos.os_id)
                  ORDER BY entregas.created_at DESC LIMIT 1) ent ON true
             LEFT JOIN LATERAL ( SELECT aplicacoes.id, aplicacoes.created_at FROM aplicacoes
                  WHERE bos.origem_os = bos.origem_os AND (bos.origem_os = 'manual'::text AND aplicacoes.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND aplicacoes.ordem_servico_onfarm_id = bos.os_id)
                  ORDER BY aplicacoes.created_at DESC LIMIT 1) app ON true
        )
 SELECT os_id, origem_os, numero_os, cliente_id, fazenda_id, talhao_id, status_os, created_at, volume_total_ml, produto_id, microrganismo_id, prioridade, volume_solicitado_l,
    cliente_nome, fazenda_nome, talhao_nome, produto_nome, microrganismo_nome,
    programacao_id, status_programacao, data_programada, data_inicio_producao,
    lote_id, codigo_lote, status_lote, data_lote,
    cq_id, cq_resultado, data_cq,
    envase_id, data_envase,
    estoque_id, data_estoque,
    entrega_id, entrega_status, data_entrega,
    aplicacao_id, data_aplicacao,
    entrega_status = ANY (ARRAY['entregue'::text, 'confirmada'::text, 'concluida'::text, 'finalizado'::text]) AS entrega_confirmada,
    false AS aplicacao_bloqueante,
    ARRAY( SELECT unnest( CASE WHEN ed.aplicacao_id IS NULL THEN ARRAY['aplicacao_nao_registrada'::text] ELSE ARRAY[]::text[] END) AS unnest) AS pendencias_informativas,
    ARRAY( SELECT unnest((((((
                CASE WHEN ed.programacao_id IS NULL THEN ARRAY['sem_programacao'::text] ELSE ARRAY[]::text[] END ||
                CASE WHEN ed.lote_id IS NULL THEN ARRAY['sem_lote'::text] ELSE ARRAY[]::text[] END) ||
                CASE WHEN ed.cq_id IS NULL THEN ARRAY['cq_pendente'::text] ELSE ARRAY[]::text[] END) ||
                CASE WHEN ed.cq_resultado = 'reprovado'::text THEN ARRAY['cq_reprovado'::text] ELSE ARRAY[]::text[] END) ||
                CASE WHEN ed.envase_id IS NULL THEN ARRAY['sem_envase'::text] ELSE ARRAY[]::text[] END) ||
                CASE WHEN ed.estoque_id IS NULL THEN ARRAY['sem_estoque'::text] ELSE ARRAY[]::text[] END) ||
                CASE WHEN NOT (ed.entrega_status = ANY (ARRAY['entregue'::text, 'confirmada'::text, 'concluida'::text, 'finalizado'::text])) THEN ARRAY['sem_entrega_confirmada'::text] ELSE ARRAY[]::text[] END) AS unnest) AS bloqueios,
    programacao_id IS NOT NULL AND lote_id IS NOT NULL AND cq_resultado = 'aprovado'::text AND envase_id IS NOT NULL AND estoque_id IS NOT NULL AND (entrega_status = ANY (ARRAY['entregue'::text, 'confirmada'::text, 'concluida'::text, 'finalizado'::text])) AS pode_finalizar,
        CASE
            WHEN status_os = 'cancelada'::text THEN 'cancelada'::text
            WHEN status_os = 'finalizada'::text THEN 'finalizada'::text
            WHEN entrega_status = ANY (ARRAY['entregue'::text, 'confirmada'::text, 'concluida'::text, 'finalizado'::text]) THEN 'entregue'::text
            WHEN entrega_id IS NOT NULL THEN 'entrega_pendente'::text
            WHEN estoque_id IS NOT NULL THEN 'pronto_entrega'::text
            WHEN envase_id IS NOT NULL THEN 'envase'::text
            WHEN status_os = ANY (ARRAY['envase'::text, 'em_envase'::text]) THEN 'envase'::text
            WHEN status_os = ANY (ARRAY['pronto_entrega'::text, 'estoque_reservado'::text, 'estoque_gerado'::text]) THEN 'pronto_entrega'::text
            WHEN cq_resultado = 'aprovado'::text THEN 'cq_aprovado'::text
            WHEN cq_resultado = 'reprovado'::text THEN 'cq_reprovado'::text
            WHEN status_lote = 'aguardando_cq'::text THEN 'aguardando_cq'::text
            WHEN status_lote = 'em_producao'::text OR status_programacao = 'em_producao'::text THEN 'em_producao'::text
            WHEN programacao_id IS NOT NULL THEN 'programada'::text
            ELSE 'aberta'::text
        END AS status_esteira_oficial,
    data_inicio_producao - created_at AS tempo_os_ate_programacao,
    data_lote - data_inicio_producao AS tempo_programacao_ate_lote,
    data_cq - data_lote AS tempo_lote_ate_cq,
    data_envase - data_cq AS tempo_cq_ate_envase,
    data_entrega - data_envase AS tempo_envase_ate_entrega,
    data_entrega - created_at AS tempo_os_ate_entrega,
    data_programada < now() AND (status_os <> ALL (ARRAY['finalizada'::text, 'cancelada'::text])) AND NOT (entrega_status = ANY (ARRAY['entregue'::text, 'confirmada'::text, 'concluida'::text, 'finalizado'::text])) AS atrasado
   FROM esteira_data ed;