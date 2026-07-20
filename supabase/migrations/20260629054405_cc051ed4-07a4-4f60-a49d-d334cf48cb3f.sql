
DROP VIEW IF EXISTS public.vw_esteira_laboratorio CASCADE;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira CASCADE;

CREATE VIEW public.vw_os_integridade_esteira AS
WITH base_os AS (
  SELECT
    o.id AS os_id,
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
  SELECT
    of.id AS os_id,
    'onfarm'::text AS origem_os,
    of.numero_os,
    of.cliente_id,
    of.fazenda_id,
    of.talhao_id,
    of.status::text AS status_os,
    of.created_at,
    of.volume_total_ml,
    of.produto_id,
    NULL::uuid AS microrganismo_id,
    of.prioridade::text AS prioridade,
    NULL::uuid AS partner_order_id
  FROM ordens_servico_onfarm of
),
esteira_data AS (
  SELECT
    bos.os_id,
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
      WHEN pa.id IS NOT NULL THEN 'parceiro'
      WHEN c.id IS NOT NULL THEN 'cliente'
      ELSE 'desconhecido'
    END AS titular_tipo,
    CASE
      WHEN pa.id IS NOT NULL THEN 'B2B · ' || COALESCE(pa.nome_fantasia, pa.razao_social)
      WHEN c.id IS NOT NULL THEN c.nome
      ELSE '—'
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
    LEFT JOIN partner_orders po ON po.id = bos.partner_order_id
    LEFT JOIN partner_accounts pa ON pa.id = po.partner_id
    LEFT JOIN LATERAL (
      SELECT pp.id, pp.status, pp.data_programada, pp.created_at
      FROM programacao_producao pp
      WHERE (bos.origem_os = 'manual' AND pp.ordem_servico_id = bos.os_id)
         OR (bos.origem_os = 'onfarm' AND pp.ordem_servico_onfarm_id = bos.os_id)
      ORDER BY pp.created_at DESC
      LIMIT 1
    ) pp ON true
    LEFT JOIN LATERAL (
      SELECT l.id, l.codigo_lote, l.status, l.created_at
      FROM lotes l WHERE l.programacao_id = pp.id
      ORDER BY l.created_at DESC LIMIT 1
    ) l ON true
    LEFT JOIN LATERAL (
      SELECT cq.id, cq.resultado, cq.created_at
      FROM controle_qualidade cq WHERE cq.lote_id = l.id
      ORDER BY cq.created_at DESC LIMIT 1
    ) cq ON true
    LEFT JOIN LATERAL (
      SELECT ev.id, ev.created_at
      FROM envase ev WHERE ev.lote_id = l.id
      ORDER BY ev.created_at DESC LIMIT 1
    ) ev ON true
    LEFT JOIN LATERAL (
      SELECT ep.id, ep.created_at
      FROM estoque_produto ep WHERE ep.lote_id = l.id
      ORDER BY ep.created_at DESC LIMIT 1
    ) ep ON true
    LEFT JOIN LATERAL (
      SELECT ent.id, ent.status, ent.created_at
      FROM entregas ent
      WHERE (bos.origem_os = 'manual' AND ent.ordem_servico_id = bos.os_id)
         OR (bos.origem_os = 'onfarm' AND ent.ordem_servico_onfarm_id = bos.os_id)
      ORDER BY ent.created_at DESC LIMIT 1
    ) ent ON true
    LEFT JOIN LATERAL (
      SELECT app.id, app.created_at
      FROM aplicacoes app
      WHERE (bos.origem_os = 'manual' AND app.ordem_servico_id = bos.os_id)
         OR (bos.origem_os = 'onfarm' AND app.ordem_servico_onfarm_id = bos.os_id)
      ORDER BY app.created_at DESC LIMIT 1
    ) app ON true
)
SELECT
  ed.*,
  (ent.id IS NOT NULL AND ent.status::text IN ('entregue','confirmada')) AS entrega_confirmada,
  false AS aplicacao_bloqueante,
  '{}'::text[] AS pendencias_informativas,
  '{}'::text[] AS bloqueios,
  (ed.estoque_id IS NOT NULL AND ed.entrega_id IS NOT NULL) AS pode_finalizar,
  CASE
    WHEN ed.status_os = 'finalizada' THEN 'finalizada'
    WHEN ed.entrega_id IS NOT NULL AND ed.entrega_status IN ('entregue','confirmada') THEN 'entregue'
    WHEN ed.entrega_id IS NOT NULL THEN 'em_entrega'
    WHEN ed.estoque_id IS NOT NULL THEN 'pronto_entrega'
    WHEN ed.envase_id IS NOT NULL THEN 'envase'
    WHEN ed.cq_resultado = 'aprovado' THEN 'cq_aprovado'
    WHEN ed.cq_id IS NOT NULL THEN 'em_cq'
    WHEN ed.lote_id IS NOT NULL THEN 'em_producao'
    WHEN ed.programacao_id IS NOT NULL THEN 'programada'
    ELSE 'aberta'
  END AS status_esteira_oficial,
  EXTRACT(epoch FROM (ed.data_inicio_producao - ed.created_at)) AS tempo_os_ate_programacao,
  EXTRACT(epoch FROM (ed.data_lote - ed.data_inicio_producao)) AS tempo_programacao_ate_lote,
  EXTRACT(epoch FROM (ed.data_cq - ed.data_lote)) AS tempo_lote_ate_cq,
  EXTRACT(epoch FROM (ed.data_envase - ed.data_cq)) AS tempo_cq_ate_envase,
  EXTRACT(epoch FROM (ed.data_entrega - ed.data_envase)) AS tempo_envase_ate_entrega,
  EXTRACT(epoch FROM (ed.data_entrega - ed.created_at)) AS tempo_os_ate_entrega,
  (ed.data_programada IS NOT NULL AND ed.data_programada < CURRENT_DATE AND ed.status_os NOT IN ('finalizada','cancelada')) AS atrasado
FROM esteira_data ed
LEFT JOIN entregas ent ON ent.id = ed.entrega_id;

CREATE VIEW public.vw_esteira_laboratorio AS
SELECT
  v.*,
  CASE
    WHEN programacao_id IS NULL THEN 'Programar Produção'
    WHEN lote_id IS NULL THEN 'Gerar Lote'
    WHEN cq_id IS NULL OR cq_resultado IS NULL THEN 'Realizar CQ'
    WHEN cq_resultado = 'reprovado' THEN 'Tratar reprovação'
    WHEN envase_id IS NULL THEN 'Registrar Envase'
    WHEN estoque_id IS NULL THEN 'Gerar Estoque/Reserva'
    WHEN NOT entrega_confirmada THEN 'Confirmar Entrega'
    WHEN pode_finalizar AND status_os <> 'finalizada' THEN 'Finalizar OS'
    WHEN status_os = 'finalizada' THEN 'Concluído'
    ELSE 'Verificar Status'
  END AS proxima_acao
FROM vw_os_integridade_esteira v;

GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated, service_role;
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated, service_role;
