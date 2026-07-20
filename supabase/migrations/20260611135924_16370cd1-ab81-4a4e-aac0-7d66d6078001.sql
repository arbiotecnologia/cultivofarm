-- 1. View de Integridade da Esteira
CREATE OR REPLACE VIEW public.vw_os_integridade_esteira AS
WITH base_os AS (
    SELECT 
        id as os_id, 
        'manual' as origem_os, 
        numero_os, 
        cliente_id, 
        status::TEXT as status_os,
        created_at
    FROM public.ordens_servico
    UNION ALL
    SELECT 
        id as os_id, 
        'onfarm' as origem_os, 
        numero_os, 
        cliente_id, 
        status::TEXT as status_os,
        created_at
    FROM public.ordens_servico_onfarm
),
esteira_data AS (
    SELECT 
        bos.os_id,
        bos.origem_os,
        bos.numero_os,
        bos.cliente_id,
        c.nome as cliente_nome,
        bos.status_os,
        pp.status::TEXT as status_programacao,
        pp.id as programacao_id,
        pp.data_programada,
        pp.responsavel_id,
        pp.created_at,
        l.status::TEXT as status_lote,
        l.id as lote_id,
        l.codigo_lote,
        cq.resultado::TEXT as status_cq,
        ev.id as envase_id,
        ep.status::TEXT as status_estoque,
        ep.id as estoque_id,
        ep.quantidade_reservada,
        ent.status::TEXT as status_entrega,
        ap.id as aplicacao_id,
        
        -- Flags de Existência
        (pp.id IS NOT NULL) as possui_programacao,
        (l.id IS NOT NULL) as possui_lote,
        (cq.resultado::TEXT = 'aprovado') as possui_cq_aprovado,
        (ev.id IS NOT NULL) as possui_envase,
        (ep.id IS NOT NULL) as possui_estoque,
        (ep.status::TEXT = 'reservado') as possui_reserva,
        (ent.id IS NOT NULL) as possui_entrega,
        (ap.id IS NOT NULL) as possui_aplicacao
    FROM base_os bos
    LEFT JOIN public.clientes c ON bos.cliente_id = c.id
    LEFT JOIN public.programacao_producao pp ON 
        (bos.origem_os = 'manual' AND pp.ordem_servico_id = bos.os_id) OR 
        (bos.origem_os = 'onfarm' AND pp.ordem_servico_onfarm_id = bos.os_id)
    LEFT JOIN public.lotes l ON pp.id = l.programacao_id
    LEFT JOIN LATERAL (
        SELECT q.resultado FROM public.controle_qualidade q 
        WHERE q.lote_id = l.id ORDER BY q.created_at DESC LIMIT 1
    ) cq ON true
    LEFT JOIN public.envase ev ON l.id = ev.lote_id
    LEFT JOIN LATERAL (
        SELECT e.id, e.status, e.quantidade_reservada FROM public.estoque_produto e 
        WHERE e.lote_id = l.id ORDER BY e.created_at DESC LIMIT 1
    ) ep ON true
    LEFT JOIN public.entregas ent ON bos.os_id = ent.ordem_servico_id
    LEFT JOIN public.aplicacoes ap ON bos.os_id = ap.ordem_servico_id OR bos.os_id = ap.ordem_servico_onfarm_id
)
SELECT 
    ed.*,
    CASE
        WHEN status_os = 'cancelada' THEN 'cancelado'
        WHEN status_os = 'finalizada' THEN 'finalizado'
        WHEN possui_aplicacao THEN 'aplicado'
        WHEN status_entrega = 'entregue' THEN 'entregue'
        WHEN status_entrega = 'em_transito' THEN 'em_entrega'
        WHEN possui_reserva THEN 'estoque_reservado'
        WHEN possui_estoque THEN 'estoque_gerado'
        WHEN possui_envase THEN 'em_envase'
        WHEN status_cq = 'aprovado' THEN 'cq_aprovado'
        WHEN status_cq = 'reprovado' THEN 'cq_reprovado'
        WHEN status_lote = 'aguardando_cq' THEN 'aguardando_cq'
        WHEN status_lote = 'em_producao' THEN 'em_producao'
        WHEN status_programacao IS NOT NULL THEN 'em_producao'
        ELSE 'demanda_recebida'
    END as status_esteira_oficial,
    (
        possui_programacao AND 
        possui_lote AND 
        possui_cq_aprovado AND 
        possui_envase AND 
        possui_estoque AND
        (status_entrega = 'entregue' OR status_os = 'entregue')
    ) as pode_finalizar,
    ARRAY(
        SELECT val FROM unnest(ARRAY[
            CASE WHEN NOT possui_programacao THEN 'OS sem programação de produção' END,
            CASE WHEN NOT possui_lote AND possui_programacao THEN 'Lote não gerado' END,
            CASE WHEN status_cq IS NULL AND possui_lote THEN 'Aguardando Controle de Qualidade' END,
            CASE WHEN status_cq = 'reprovado' THEN 'Lote reprovado no Controle de Qualidade' END,
            CASE WHEN NOT possui_envase AND status_cq = 'aprovado' THEN 'Envase não realizado' END,
            CASE WHEN NOT possui_estoque AND possui_envase THEN 'Entrada no estoque não realizada' END,
            CASE WHEN status_entrega IS NULL OR status_entrega <> 'entregue' THEN 'Entrega não confirmada' END
        ]) as val WHERE val IS NOT NULL
    ) as bloqueios
FROM esteira_data ed;

GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO service_role;

-- 2. RPC de Validação
CREATE OR REPLACE FUNCTION public.rpc_validar_integridade_esteira(
    p_os_id UUID,
    p_origem_os TEXT,
    p_acao_solicitada TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_integridade RECORD;
    v_permitido BOOLEAN := TRUE;
    v_bloqueios TEXT[] := ARRAY[]::TEXT[];
    v_status_esteira TEXT;
    v_pode_finalizar BOOLEAN;
BEGIN
    SELECT * INTO v_integridade 
    FROM public.vw_os_integridade_esteira 
    WHERE os_id = p_os_id AND origem_os = p_origem_os;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'permitido', FALSE,
            'bloqueios', ARRAY['Ordem de Serviço não encontrada'],
            'status_esteira_atual', 'nao_encontrado'
        );
    END IF;

    v_status_esteira := v_integridade.status_esteira_oficial;
    v_pode_finalizar := v_integridade.pode_finalizar;

    -- Lógica de bloqueio por ação
    CASE p_acao_solicitada
        WHEN 'enviar_cq' THEN
            IF NOT v_integridade.possui_lote THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível enviar para CQ sem lote gerado.');
            END IF;
        
        WHEN 'enviar_envase' THEN
            IF NOT v_integridade.possui_cq_aprovado THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível envasar sem CQ aprovado.');
            END IF;

        WHEN 'gerar_estoque' THEN
            IF NOT v_integridade.possui_envase THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível gerar estoque sem envase concluído.');
            END IF;

        WHEN 'criar_entrega' THEN
            IF NOT v_integridade.possui_estoque THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível criar entrega sem estoque disponível.');
            END IF;

        WHEN 'finalizar_os' THEN
            IF NOT v_integridade.pode_finalizar THEN
                v_permitido := FALSE;
                v_bloqueios := v_integridade.bloqueios;
            END IF;
        
        ELSE
            -- Ações genéricas ou não mapeadas
    END CASE;

    RETURN jsonb_build_object(
        'permitido', v_permitido,
        'bloqueios', v_bloqueios,
        'status_esteira_atual', v_status_esteira,
        'pode_finalizar', v_pode_finalizar
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_validar_integridade_esteira(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_validar_integridade_esteira(UUID, TEXT, TEXT) TO service_role;

-- 3. Atualizar vw_esteira_laboratorio
-- Primeiro dropamos para evitar erro de colunas
DROP VIEW IF EXISTS public.vw_esteira_laboratorio CASCADE;

CREATE OR REPLACE VIEW public.vw_esteira_laboratorio AS
SELECT 
    v.programacao_id,
    v.origem_os,
    v.os_id,
    v.numero_os,
    v.cliente_id,
    v.cliente_nome,
    -- Campos extras necessários para o Cockpit
    os.fazenda_nome,
    os.talhao_nome,
    os.produto_id,
    os.produto_nome,
    os.microrganismo_id,
    os.microrganismo_nome,
    os.volume_solicitado_ml,
    os.volume_solicitado_l,
    os.prioridade,
    v.data_programada,
    v.responsavel_id,
    prof.nome as responsavel_nome,
    v.status_os,
    v.status_programacao,
    v.lote_id,
    v.codigo_lote,
    v.status_lote,
    v.status_cq as cq_resultado,
    v.envase_id,
    v.estoque_id,
    v.status_estoque,
    v.quantidade_reservada,
    v.status_entrega as entrega_status,
    CASE WHEN v.possui_aplicacao THEN 'concluida' ELSE NULL END as aplicacao_status,
    v.created_at,
    (v.data_programada < CURRENT_DATE AND v.status_os NOT IN ('finalizada', 'entregue', 'cancelada')) as atrasado,
    CASE 
        WHEN v.status_esteira_oficial = 'finalizado' THEN 'Finalizado'
        WHEN v.status_esteira_oficial = 'aplicado' THEN 'Finalizar OS'
        WHEN v.status_esteira_oficial = 'entregue' THEN 'Registrar aplicação'
        WHEN v.status_esteira_oficial = 'em_entrega' THEN 'Acompanhar entrega'
        WHEN v.status_esteira_oficial = 'estoque_reservado' THEN 'Criar entrega'
        WHEN v.status_esteira_oficial = 'estoque_gerado' THEN 'Reservar estoque'
        WHEN v.status_esteira_oficial = 'em_envase' THEN 'Concluir envase'
        WHEN v.status_esteira_oficial = 'cq_aprovado' THEN 'Realizar envase'
        WHEN v.status_esteira_oficial = 'cq_reprovado' THEN 'Corrigir lote'
        WHEN v.status_esteira_oficial = 'aguardando_cq' THEN 'Registrar CQ'
        WHEN v.status_esteira_oficial = 'em_producao' AND v.lote_id IS NULL THEN 'Gerar lote'
        WHEN v.status_esteira_oficial = 'em_producao' THEN 'Enviar para CQ'
        ELSE 'Assumir demanda'
    END as proxima_acao,
    v.status_esteira_oficial,
    v.bloqueios as bloqueios_esteira,
    v.pode_finalizar
FROM public.vw_os_integridade_esteira v
-- Join lateral ou direto para pegar dados de produto/fazenda que não estão na view de integridade base
LEFT JOIN LATERAL (
    SELECT 
        f.nome as fazenda_nome,
        t.nome as talhao_nome,
        p.id as produto_id,
        p.nome as produto_nome,
        m.id as microrganismo_id,
        m.nome as microrganismo_nome,
        COALESCE(osm.volume_total_ml, osf.volume_total_ml) as volume_solicitado_ml,
        (COALESCE(osm.volume_total_ml, osf.volume_total_ml) / 1000.0)::NUMERIC(12,2) as volume_solicitado_l,
        COALESCE(osm.prioridade, osf.prioridade) as prioridade
    FROM (SELECT v.os_id, v.origem_os) _v
    LEFT JOIN public.ordens_servico osm ON _v.os_id = osm.id AND _v.origem_os = 'manual'
    LEFT JOIN public.ordens_servico_onfarm osf ON _v.os_id = osf.id AND _v.origem_os = 'onfarm'
    LEFT JOIN public.fazendas f ON f.id = COALESCE(osm.fazenda_id, osf.fazenda_id)
    LEFT JOIN public.talhoes t ON t.id = COALESCE(osm.talhao_id, osf.talhao_id)
    LEFT JOIN public.produtos p ON p.id = COALESCE(osm.produto_id, osf.produto_id)
    LEFT JOIN public.microrganismos m ON m.id = osm.microrganismo_id
    LIMIT 1
) os ON true
LEFT JOIN public.profiles prof ON v.responsavel_id = prof.id;

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;
