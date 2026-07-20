DROP VIEW IF EXISTS public.vw_esteira_laboratorio;

CREATE OR REPLACE VIEW public.vw_esteira_laboratorio AS
 WITH base_data AS (
         SELECT pp.id AS programacao_id,
                CASE
                    WHEN (pp.ordem_servico_onfarm_id IS NOT NULL) THEN 'onfarm'::text
                    ELSE 'manual'::text
                END AS origem_os,
            COALESCE(pp.ordem_servico_id, pp.ordem_servico_onfarm_id) AS os_id,
            pp.ordem_servico_id AS os_manual_id,
            pp.ordem_servico_onfarm_id AS os_onfarm_id,
            COALESCE(os.numero_os, os_onf.numero_os) AS numero_os,
            COALESCE(os.cliente_id, os_onf.cliente_id) AS cliente_id,
            COALESCE(os.fazenda_id, os_onf.fazenda_id) AS fazenda_id,
            COALESCE(os.talhao_id, os_onf.talhao_id) AS talhao_id,
            COALESCE(os.produto_id, os_onf.produto_id) AS produto_id,
            os.microrganismo_id,
            COALESCE(os.volume_total_ml, os_onf.volume_total_ml) AS volume_total_ml,
            pp.data_programada,
            pp.responsavel_id,
            COALESCE(os.prioridade, os_onf.prioridade) AS prioridade,
            COALESCE((os.status)::text, (os_onf.status)::text) AS status_os,
            pp.status AS status_programacao,
            pp.created_at,
            pp.updated_at
           FROM ((programacao_producao pp
             LEFT JOIN ordens_servico os ON ((pp.ordem_servico_id = os.id)))
             LEFT JOIN ordens_servico_onfarm os_onf ON ((pp.ordem_servico_onfarm_id = os_onf.id)))
        )
 SELECT bd.programacao_id,
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
    ((bd.volume_total_ml / 1000.0))::numeric(12,2) AS volume_solicitado_l,
    bd.data_programada,
    bd.responsavel_id,
    prof.nome AS responsavel_nome,
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
        CASE
            WHEN (ap.id IS NOT NULL) THEN 'concluida'::text
            ELSE NULL::text
        END AS aplicacao_status,
    bd.created_at,
    bd.updated_at,
    ((bd.data_programada < CURRENT_DATE) AND (bd.status_os <> ALL (ARRAY['finalizada'::text, 'entregue'::text, 'cancelada'::text]))) AS atrasado,
        CASE
            WHEN (l.id IS NULL) THEN 'Gerar lote'::text
            WHEN (l.status = 'em_producao'::status_lote) THEN 'Enviar para CQ'::text
            WHEN (l.status = 'aguardando_cq'::status_lote) THEN 'Registrar CQ'::text
            WHEN ((l.status = 'aprovado'::status_lote) AND (ev.id IS NULL)) THEN 'Realizar envase'::text
            WHEN ((ev.id IS NOT NULL) AND (ep.id IS NULL)) THEN 'Gerar estoque'::text
            WHEN ((ep.status = 'disponivel'::status_estoque) AND ((ep.quantidade_reservada IS NULL) OR (ep.quantidade_reservada = (0)::numeric))) THEN 'Reservar estoque'::text
            WHEN ((ep.status = 'reservado'::status_estoque) AND (ent.id IS NULL)) THEN 'Criar entrega'::text
            WHEN ((ent.status = 'entregue'::status_entrega) AND (ap.id IS NULL)) THEN 'Registrar aplicação'::text
            WHEN ((ap.id IS NOT NULL) OR (bd.status_os = 'finalizada'::text)) THEN 'Finalizado'::text
            ELSE 'Acompanhar'::text
        END AS proxima_acao
   FROM ((((((((((((base_data bd
     LEFT JOIN clientes c ON ((bd.cliente_id = c.id)))
     LEFT JOIN fazendas f ON ((bd.fazenda_id = f.id)))
     LEFT JOIN talhoes t ON ((bd.talhao_id = t.id)))
     LEFT JOIN produtos p ON ((bd.produto_id = p.id)))
     LEFT JOIN microrganismos m ON ((bd.microrganismo_id = m.id)))
     LEFT JOIN profiles prof ON ((bd.responsavel_id = prof.id)))
     LEFT JOIN lotes l ON ((bd.programacao_id = l.programacao_id)))
     LEFT JOIN LATERAL ( SELECT q.resultado,
            q.created_at
           FROM controle_qualidade q
          WHERE (q.lote_id = l.id)
          ORDER BY q.created_at DESC
         LIMIT 1) cq ON (true))
     LEFT JOIN LATERAL ( SELECT e.id,
            e.quantidade
           FROM envase e
          WHERE (e.lote_id = l.id)
          ORDER BY e.created_at DESC
         LIMIT 1) ev ON (true))
     LEFT JOIN LATERAL ( SELECT s.id,
            s.status,
            s.quantidade_reservada
           FROM estoque_produto s
          WHERE (s.lote_id = l.id)
          ORDER BY s.created_at DESC
         LIMIT 1) ep ON (true))
     LEFT JOIN LATERAL ( SELECT en.id,
            en.status
           FROM entregas en
          WHERE (en.lote_id = l.id)
          ORDER BY en.created_at DESC
         LIMIT 1) ent ON (true))
     LEFT JOIN LATERAL ( SELECT a.id
           FROM aplicacoes a
          WHERE (a.lote_usado_id = l.id)
          ORDER BY a.created_at DESC
         LIMIT 1) ap ON (true));

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;
