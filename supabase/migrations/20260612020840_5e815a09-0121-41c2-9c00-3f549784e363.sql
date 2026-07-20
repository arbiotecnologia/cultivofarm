-- 1. Adição de campos de path para mídias
ALTER TABLE public.visitas_checkin ADD COLUMN IF NOT EXISTS foto_path text;
ALTER TABLE public.visitas_checkin ADD COLUMN IF NOT EXISTS audio_path text;

ALTER TABLE public.portal_solicitacoes ADD COLUMN IF NOT EXISTS audio_inicial_path text;
ALTER TABLE public.portal_solicitacoes ADD COLUMN IF NOT EXISTS fotos_paths text[];

-- 2. Atualização das Views com security_invoker = true
-- Precisamos dar DROP e CREATE para mudar as propriedades da view
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira;

CREATE VIEW public.vw_os_integridade_esteira WITH (security_invoker = true) AS
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
    EXISTS (SELECT 1 FROM programacao_producao p WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)) as tem_programacao,
    EXISTS (
        SELECT 1 FROM lotes l 
        JOIN programacao_producao p ON l.programacao_id = p.id 
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
    ) as tem_lote,
    COALESCE((
        SELECT cq.resultado::text 
        FROM controle_qualidade cq
        JOIN lotes l ON cq.lote_id = l.id
        JOIN programacao_producao p ON l.programacao_id = p.id
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
        ORDER BY cq.created_at DESC LIMIT 1
    ), 'pendente') as cq_resultado,
    EXISTS (
        SELECT 1 FROM envase ev
        JOIN lotes l ON ev.lote_id = l.id
        JOIN programacao_producao p ON l.programacao_id = p.id
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
    ) as tem_envase,
    EXISTS (
        SELECT 1 FROM estoque_produto ep
        WHERE ep.reservado_para_os_id = os.os_id AND ep.reservado_para_os_tipo = os.origem_os
    ) as tem_estoque,
    COALESCE(ue.status_entrega, 'pendente') as entrega_status,
    COALESCE(ue.status_entrega IN ('entregue', 'confirmada', 'concluida'), false) as entrega_confirmada,
    EXISTS (
        SELECT 1 FROM aplicacoes a 
        WHERE (os.origem_os = 'manual' AND a.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND a.ordem_servico_onfarm_id = os.os_id)
    ) as tem_aplicacao,
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

CREATE VIEW public.vw_esteira_laboratorio WITH (security_invoker = true) AS
WITH os_base AS (
    SELECT 'manual'::text as origem_os, id, cliente_id, fazenda_id, talhao_id, produto_id, status::text as status_os_text, created_at, numero_os
    FROM ordens_servico
    UNION ALL
    SELECT 'onfarm'::text as origem_os, id, cliente_id, fazenda_id, talhao_id, produto_id, status::text as status_os_text, created_at, numero_os
    FROM ordens_servico_onfarm
)
SELECT 
    ob.origem_os, ob.id as os_id, ob.numero_os, ob.cliente_id,
    c.nome as cliente_nome, f.nome as fazenda_nome, t.nome as talhao_nome, p.nome as produto_nome,
    ob.status_os_text as status_os,
    vi.tem_programacao, vi.tem_lote, vi.cq_resultado, vi.tem_envase, vi.tem_estoque, vi.entrega_status, vi.entrega_confirmada,
    vi.tem_aplicacao as aplicacao_informativa, vi.pode_finalizar, vi.bloqueios, vi.prioridade, vi.volume_solicitado_l,
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
    CASE WHEN ob.status_os_text NOT IN ('finalizada', 'cancelada') AND ob.created_at < now() - interval '7 days' THEN true ELSE false END as atrasado
FROM os_base ob
JOIN public.vw_os_integridade_esteira vi ON ob.id = vi.os_id AND ob.origem_os = vi.origem_os
LEFT JOIN clientes c ON ob.cliente_id = c.id
LEFT JOIN fazendas f ON ob.fazenda_id = f.id
LEFT JOIN talhoes t ON ob.talhao_id = t.id
LEFT JOIN produtos p ON ob.produto_id = p.id;

CREATE VIEW public.vw_fluxo_visita_tecnica WITH (security_invoker = true) AS
WITH base_fluxo AS (
    SELECT CASE WHEN (rc.id IS NOT NULL) THEN 'visita_com_solicitacao'::text ELSE 'solicitacao_sem_visita'::text END AS origem_fluxo,
           ps.id AS solicitacao_id, ps.numero_solicitacao, rc.id AS registro_consultor_id, rc.codigo_visita, ps.cliente_id, ps.fazenda_id, ps.talhao_id,
           ps.consultor_atribuido AS consultor_id, ps.status AS status_solicitacao, (rc.status)::text AS status_visita, ps.tipo_demanda, ps.data_prevista_atendimento,
           ps.created_at, ps.updated_at
    FROM (portal_solicitacoes ps LEFT JOIN registros_consultor rc ON ((ps.id = rc.solicitacao_id)))
    UNION ALL
    SELECT 'visita_avulsa'::text AS origem_fluxo, NULL::uuid AS solicitacao_id, NULL::text AS numero_solicitacao, rc.id AS registro_consultor_id, rc.codigo_visita,
           rc.cliente_id, rc.fazenda_id, rc.talhao_id, rc.consultor_responsavel AS consultor_id, NULL::text AS status_solicitacao, (rc.status)::text AS status_visita,
           NULL::text AS tipo_demanda, NULL::timestamp with time zone AS data_prevista_atendimento, rc.created_at, rc.updated_at
    FROM registros_consultor rc WHERE (rc.solicitacao_id IS NULL)
)
SELECT bf.*, c.nome as cliente_nome, f.nome as fazenda_nome, t.nome as talhao_nome, u.nome as consultor_nome,
       EXISTS (SELECT 1 FROM visitas_checkin vc WHERE vc.registro_consultor_id = bf.registro_consultor_id) as possui_checkin,
       (SELECT status_aprovacao FROM aprovacoes_tecnicas ap WHERE ap.registro_consultor_id = bf.registro_consultor_id ORDER BY created_at DESC LIMIT 1) as status_aprovacao
FROM base_fluxo bf
LEFT JOIN clientes c ON bf.cliente_id = c.id
LEFT JOIN fazendas f ON bf.fazenda_id = f.id
LEFT JOIN talhoes t ON bf.talhao_id = t.id
LEFT JOIN profiles u ON bf.consultor_id = u.user_id;

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;

-- 3. Reforço de RLS em registros_consultor_arquivos
-- Limpa políticas antigas se necessário (assumindo nomes dos logs anteriores)
DROP POLICY IF EXISTS "Admin/Gestor total access on files" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "Cliente read own released files" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "Consultor read own visit files" ON public.registros_consultor_arquivos;

CREATE POLICY "Admin/Gestor total access on files" ON public.registros_consultor_arquivos
FOR ALL USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor'));

CREATE POLICY "Consultor manage own files" ON public.registros_consultor_arquivos
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM registros_consultor r 
        WHERE r.id = registros_consultor_arquivos.registro_consultor_id 
        AND r.consultor_responsavel = auth.uid()
    )
);

CREATE POLICY "Cliente read released files" ON public.registros_consultor_arquivos
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM registros_consultor r 
        WHERE r.id = registros_consultor_arquivos.registro_consultor_id 
        AND can_user_access_cliente(r.cliente_id)
        AND r.status IN ('aprovado', 'convertido_os', 'finalizado')
    )
);
