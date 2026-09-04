=== vw_os_integridade_esteira
 WITH base_os AS (
         SELECT o.id AS os_id,
            'manual'::text AS origem_os,
            o.numero_os,
            o.cliente_id,
            o.fazenda_id,
            o.talhao_id,
            o.status::text AS status_os,
            o.created_at,
            o.volume_total_ml,
            o.produto_id,
            o.microrganismo_id,
            o.prioridade::text AS prioridade,
            o.partner_order_id
           FROM ordens_servico o
        UNION ALL
         SELECT ofa.id AS os_id,
            'onfarm'::text AS origem_os,
            ofa.numero_os,
            ofa.cliente_id,
            ofa.fazenda_id,
            ofa.talhao_id,
            ofa.status::text AS status_os,
            ofa.created_at,
            ofa.volume_total_ml,
            ofa.produto_id,
            NULL::uuid AS microrganismo_id,
            ofa.prioridade::text AS prioridade,
            NULL::uuid AS partner_order_id
           FROM ordens_servico_onfarm ofa
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
            pa.id AS partner_id,
            po.numero AS partner_numero,
            COALESCE(pa.nome_fantasia, pa.razao_social) AS partner_nome,
                CASE
                    WHEN pa.id IS NOT NULL THEN 'parceiro'::text
                    WHEN c.id IS NOT NULL THEN 'cliente'::text
                    ELSE 'desconhecido'::text
                END AS titular_tipo,
                CASE
                    WHEN pa.id IS NOT NULL THEN 'B2B · '::text || COALESCE(pa.nome_fantasia, pa.razao_social)
                    WHEN c.id IS NOT NULL THEN c.nome
                    ELSE '—'::text
                END AS titular_nome,
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
            epr.id AS estoque_reservado_id,
            epr.reservado_em AS data_estoque_reservado,
            ent_1.id AS entrega_id,
            ent_1.status::text AS entrega_status,
            ent_1.created_at AS data_entrega,
            app.id AS aplicacao_id,
            app.created_at AS data_aplicacao
           FROM base_os bos
             LEFT JOIN clientes c ON bos.cliente_id = c.id
             LEFT JOIN fazendas f ON bos.fazenda_id = f.id
             LEFT JOIN talhoes t ON bos.talhao_id = t.id
             LEFT JOIN produtos p ON bos.produto_id = p.id
             LEFT JOIN microrganismos m ON bos.microrganismo_id = m.id
             LEFT JOIN partner_orders po ON po.id = bos.partner_order_id
             LEFT JOIN partner_accounts pa ON pa.id = po.partner_id
             LEFT JOIN LATERAL ( SELECT pp_1.id,
                    pp_1.status,
                    pp_1.data_programada,
                    pp_1.created_at
                   FROM programacao_producao pp_1
                  WHERE bos.origem_os = 'manual'::text AND pp_1.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND pp_1.ordem_servico_onfarm_id = bos.os_id
                  ORDER BY pp_1.created_at DESC
                 LIMIT 1) pp ON true
             LEFT JOIN LATERAL ( SELECT l_1.id,
                    l_1.codigo_lote,
                    l_1.status,
                    l_1.created_at
                   FROM lotes l_1
                  WHERE l_1.programacao_id = pp.id
                  ORDER BY l_1.created_at DESC
                 LIMIT 1) l ON true
             LEFT JOIN LATERAL ( SELECT cq_1.id,
                    cq_1.resultado,
                    cq_1.created_at
                   FROM controle_qualidade cq_1
                  WHERE cq_1.lote_id = l.id
                  ORDER BY cq_1.created_at DESC
                 LIMIT 1) cq ON true
             LEFT JOIN LATERAL ( SELECT ev_1.id,
                    ev_1.created_at
                   FROM envase ev_1
                  WHERE ev_1.lote_id = l.id
                  ORDER BY ev_1.created_at DESC
                 LIMIT 1) ev ON true
             LEFT JOIN LATERAL ( SELECT ep_1.id,
                    ep_1.created_at
                   FROM estoque_produto ep_1
                  WHERE ep_1.lote_id = l.id
                  ORDER BY ep_1.created_at DESC
                 LIMIT 1) ep ON true
             LEFT JOIN LATERAL ( SELECT epr_1.id,
                    epr_1.reservado_em
                   FROM estoque_produto epr_1
                  WHERE epr_1.lote_id = l.id AND epr_1.status::text = 'reservado'::text AND epr_1.reservado_para_os_id = bos.os_id
                  ORDER BY epr_1.reservado_em DESC NULLS LAST, epr_1.created_at DESC
                 LIMIT 1) epr ON true
             LEFT JOIN LATERAL ( SELECT ent_2.id,
                    ent_2.status,
                    ent_2.created_at
                   FROM entregas ent_2
                  WHERE bos.origem_os = 'manual'::text AND ent_2.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND ent_2.ordem_servico_onfarm_id = bos.os_id
                  ORDER BY ent_2.created_at DESC
                 LIMIT 1) ent_1 ON true
             LEFT JOIN LATERAL ( SELECT app_1.id,
                    app_1.created_at
                   FROM aplicacoes app_1
                  WHERE bos.origem_os = 'manual'::text AND app_1.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND app_1.ordem_servico_onfarm_id = bos.os_id
                  ORDER BY app_1.created_at DESC
                 LIMIT 1) app ON true
        )
 SELECT ed.os_id,
    ed.origem_os,
    ed.numero_os,
    ed.cliente_id,
    ed.fazenda_id,
    ed.talhao_id,
    ed.status_os,
    ed.created_at,
    ed.volume_total_ml,
    ed.produto_id,
    ed.microrganismo_id,
    ed.prioridade,
    ed.volume_solicitado_l,
    ed.cliente_nome,
    ed.fazenda_nome,
    ed.talhao_nome,
    ed.produto_nome,
    ed.microrganismo_nome,
    ed.partner_id,
    ed.partner_numero,
    ed.partner_nome,
    ed.titular_tipo,
    ed.titular_nome,
    ed.programacao_id,
    ed.status_programacao,
    ed.data_programada,
    ed.data_inicio_producao,
    ed.lote_id,
    ed.codigo_lote,
    ed.status_lote,
    ed.data_lote,
    ed.cq_id,
    ed.cq_resultado,
    ed.data_cq,
    ed.envase_id,
    ed.data_envase,
    ed.estoque_id,
    ed.data_estoque,
    ed.estoque_reservado_id,
    ed.data_estoque_reservado,
    ed.entrega_id,
    ed.entrega_status,
    ed.data_entrega,
    ed.aplicacao_id,
    ed.data_aplicacao,
    ent.id IS NOT NULL AND (ent.status::text = ANY (ARRAY['entregue'::text, 'confirmada'::text])) AS entrega_confirmada,
    false AS aplicacao_bloqueante,
    (ARRAY[]::text[] ||
        CASE
            WHEN ed.aplicacao_id IS NULL AND ent.id IS NOT NULL AND (ent.status::text = ANY (ARRAY['entregue'::text, 'confirmada'::text])) THEN ARRAY['aplicacao_nao_registrada'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.data_programada IS NOT NULL AND ed.data_programada < CURRENT_DATE AND (ed.status_os <> ALL (ARRAY['finalizada'::text, 'cancelada'::text])) THEN ARRAY['programacao_atrasada'::text]
            ELSE ARRAY[]::text[]
        END AS pendencias_informativas,
    (((((((ARRAY[]::text[] ||
        CASE
            WHEN ed.programacao_id IS NULL THEN ARRAY['sem_programacao'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.lote_id IS NULL THEN ARRAY['sem_lote'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.lote_id IS NOT NULL AND ed.cq_resultado IS DISTINCT FROM 'aprovado'::text THEN ARRAY['cq_nao_aprovado'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.envase_id IS NULL THEN ARRAY['sem_envase'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.estoque_id IS NULL THEN ARRAY['sem_entrada_estoque'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.estoque_reservado_id IS NULL THEN ARRAY['sem_reserva_para_os'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.entrega_id IS NULL THEN ARRAY['sem_entrega'::text]
            ELSE ARRAY[]::text[]
        END) ||
        CASE
            WHEN ed.entrega_id IS NOT NULL AND NOT (ent.id IS NOT NULL AND (ent.status::text = ANY (ARRAY['entregue'::text, 'confirmada'::text]))) THEN ARRAY['entrega_nao_confirmada'::text]
            ELSE ARRAY[]::text[]
        END AS bloqueios,
    ed.estoque_id IS NOT NULL AND ent.id IS NOT NULL AND (ent.status::text = ANY (ARRAY['entregue'::text, 'confirmada'::text])) AS pode_finalizar,
        CASE
            WHEN ed.status_os = 'finalizada'::text THEN 'finalizada'::text
            WHEN ed.entrega_id IS NOT NULL AND (ed.entrega_status = ANY (ARRAY['entregue'::text, 'confirmada'::text])) THEN 'entregue'::text
            WHEN ed.entrega_id IS NOT NULL THEN 'em_entrega'::text
            WHEN ed.estoque_reservado_id IS NOT NULL THEN 'estoque_reservado'::text
            WHEN ed.estoque_id IS NOT NULL THEN 'pronto_entrega'::text
            WHEN ed.envase_id IS NOT NULL THEN 'envase'::text
            WHEN ed.status_os = ANY (ARRAY['envase'::text, 'em_envase'::text]) THEN 'envase'::text
            WHEN ed.status_os = 'pronto_entrega'::text THEN 'pronto_entrega'::text
            WHEN ed.cq_resultado = 'aprovado'::text THEN 'cq_aprovado'::text
            WHEN (ed.status_os = ANY (ARRAY['em_cq'::text, 'aguardando_cq'::text])) OR ed.status_programacao = 'aguardando_cq'::text OR ed.status_lote = 'aguardando_cq'::text THEN 'aguardando_cq'::text
            WHEN ed.cq_id IS NOT NULL THEN 'em_cq'::text
            WHEN ed.lote_id IS NOT NULL THEN 'em_producao'::text
            WHEN ed.programacao_id IS NOT NULL THEN 'programada'::text
            ELSE 'aberta'::text
        END AS status_esteira_oficial,
    EXTRACT(epoch FROM ed.data_inicio_producao - ed.created_at) AS tempo_os_ate_programacao,
    EXTRACT(epoch FROM ed.data_lote - ed.data_inicio_producao) AS tempo_programacao_ate_lote,
    EXTRACT(epoch FROM ed.data_cq - ed.data_lote) AS tempo_lote_ate_cq,
    EXTRACT(epoch FROM ed.data_envase - ed.data_cq) AS tempo_cq_ate_envase,
    EXTRACT(epoch FROM ed.data_entrega - ed.data_envase) AS tempo_envase_ate_entrega,
    EXTRACT(epoch FROM ed.data_entrega - ed.created_at) AS tempo_os_ate_entrega,
    ed.data_programada IS NOT NULL AND ed.data_programada < CURRENT_DATE AND (ed.status_os <> ALL (ARRAY['finalizada'::text, 'cancelada'::text])) AS atrasado
   FROM esteira_data ed
     LEFT JOIN entregas ent ON ent.id = ed.entrega_id;
=== vw_esteira_laboratorio
 SELECT os_id,
    origem_os,
    numero_os,
    cliente_id,
    fazenda_id,
    talhao_id,
    status_os,
    created_at,
    volume_total_ml,
    produto_id,
    microrganismo_id,
    prioridade,
    volume_solicitado_l,
    cliente_nome,
    fazenda_nome,
    talhao_nome,
    produto_nome,
    microrganismo_nome,
    partner_id,
    partner_numero,
    partner_nome,
    titular_tipo,
    titular_nome,
    programacao_id,
    status_programacao,
    data_programada,
    data_inicio_producao,
    lote_id,
    codigo_lote,
    status_lote,
    data_lote,
    cq_id,
    cq_resultado,
    data_cq,
    envase_id,
    data_envase,
    estoque_id,
    data_estoque,
    estoque_reservado_id,
    data_estoque_reservado,
    entrega_id,
    entrega_status,
    data_entrega,
    aplicacao_id,
    data_aplicacao,
    entrega_confirmada,
    aplicacao_bloqueante,
    pendencias_informativas,
    bloqueios,
    pode_finalizar,
    status_esteira_oficial,
    tempo_os_ate_programacao,
    tempo_programacao_ate_lote,
    tempo_lote_ate_cq,
    tempo_cq_ate_envase,
    tempo_envase_ate_entrega,
    tempo_os_ate_entrega,
    atrasado,
    proxima_acao
   FROM mv_esteira_laboratorio m
  WHERE has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR (has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)) AND (cliente_id = ANY (get_cliente_ids_for_user(auth.uid())));
=== vw_fluxo_visita_tecnica
 SELECT origem_fluxo,
    solicitacao_id,
    numero_solicitacao,
    registro_consultor_id,
    codigo_visita,
    cliente_id,
    cliente_nome,
    fazenda_id,
    fazenda_nome,
    talhao_id,
    talhao_nome,
    cultura_id,
    cultura_nome,
    consultor_id,
    consultor_nome,
    status_solicitacao,
    status_visita,
    status_aprovacao,
    tipo_demanda,
    data_prevista_atendimento,
    data_checkin,
    data_vistoria,
    data_finalizacao,
    data_liberacao_recomendacao,
    data_conversao_os,
    possui_checkin,
    possui_diagnostico,
    quantidade_diagnosticos,
    possui_evidencias,
    quantidade_evidencias,
    possui_recomendacao,
    quantidade_recomendacoes,
    possui_os,
    os_id,
    numero_os,
    status_os,
    microrganismo_id,
    microrganismo_nome,
    proxima_acao,
    bloqueios,
    dias_em_aberto,
    tempo_solicitacao_ate_checkin,
    tempo_checkin_ate_finalizacao,
    tempo_finalizacao_ate_aprovacao,
    tempo_aprovacao_ate_os,
    created_at,
    updated_at
   FROM mv_fluxo_visita_tecnica m
  WHERE has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR (has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)) AND (consultor_id = auth.uid() OR (cliente_id = ANY (get_cliente_ids_for_user(auth.uid()))));
=== vw_catalogo_ficha_produtos
 SELECT id,
    nome,
    codigo,
    tipo,
    descricao,
    ativo,
    COALESCE(fn_catalogo_preco_canonico(id, NULL::uuid, 'dose'::text, NULL::numeric), valor_dose_brl) AS valor_dose_brl,
    COALESCE(fn_catalogo_preco_canonico(id, NULL::uuid, 'litro'::text, NULL::numeric), valor_litro_brl) AS valor_litro_brl,
    COALESCE(fn_catalogo_preco_canonico(id, NULL::uuid, 'hectare'::text, NULL::numeric), valor_ha_brl) AS valor_ha_brl,
    dose_ml_ha,
        CASE
            WHEN fn_catalogo_preco_canonico(id, NULL::uuid, 'litro'::text, NULL::numeric) IS NOT NULL THEN 'catalogo_volumes'::text
            ELSE 'legado_mestre'::text
        END AS preco_fonte
   FROM produtos p
  WHERE ativo = true AND (can_view_catalog_internal(auth.uid()) OR (NOT (EXISTS ( SELECT 1
           FROM product_technical_profiles tp
          WHERE tp.produto_id = p.id)) OR (EXISTS ( SELECT 1
           FROM product_technical_profiles tp
          WHERE tp.produto_id = p.id AND tp.status_validacao = 'aprovado'::text))) AND (NOT (has_role(auth.uid(), 'parceiro_b2b'::app_role) OR has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)) OR COALESCE(b2b_enabled, false) = true));
=== vw_catalogo_ficha_microrganismos
 SELECT id,
    nome,
    nome_cientifico,
    funcao_agronomica,
    ativo,
    COALESCE(fn_catalogo_preco_canonico(NULL::uuid, id, 'dose'::text, NULL::numeric), valor_dose_brl) AS valor_dose_brl,
    COALESCE(fn_catalogo_preco_canonico(NULL::uuid, id, 'litro'::text, NULL::numeric), valor_litro_brl) AS valor_litro_brl,
    dose_ml_ha,
        CASE
            WHEN fn_catalogo_preco_canonico(NULL::uuid, id, 'litro'::text, NULL::numeric) IS NOT NULL THEN 'catalogo_volumes'::text
            ELSE 'legado_mestre'::text
        END AS preco_fonte
   FROM microrganismos m
  WHERE ativo = true AND (can_view_catalog_internal(auth.uid()) OR (NOT (EXISTS ( SELECT 1
           FROM microorganism_technical_profiles tp
          WHERE tp.microrganismo_id = m.id)) OR (EXISTS ( SELECT 1
           FROM microorganism_technical_profiles tp
          WHERE tp.microrganismo_id = m.id AND tp.status_validacao = 'aprovado'::text))) AND (NOT (has_role(auth.uid(), 'parceiro_b2b'::app_role) OR has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)) OR COALESCE(b2b_enabled, false) = true));
