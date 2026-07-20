-- 1. DROP Prévio para evitar erro de alteração de colunas ou parâmetros
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira;
DROP FUNCTION IF EXISTS public.rpc_avancar_esteira_laboratorio(text, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_validar_integridade_esteira(text, uuid);

-- 2. Correção da View de Integridade da Esteira
CREATE VIEW public.vw_os_integridade_esteira AS
WITH os_consolidada AS (
    SELECT 
        'manual'::text as origem_os,
        id as os_id,
        cliente_id,
        fazenda_id,
        talhao_id,
        status::text as status_os 
    FROM ordens_servico
    UNION ALL
    SELECT 
        'onfarm'::text as origem_os,
        id as os_id,
        cliente_id,
        fazenda_id,
        talhao_id,
        status::text as status_os 
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
    -- Programação
    EXISTS (SELECT 1 FROM programacao_producao p WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)) as tem_programacao,
    -- Lote
    EXISTS (
        SELECT 1 FROM lotes l 
        JOIN programacao_producao p ON l.programacao_id = p.id 
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
    ) as tem_lote,
    -- CQ
    COALESCE((
        SELECT cq.resultado::text 
        FROM controle_qualidade cq
        JOIN lotes l ON cq.lote_id = l.id
        JOIN programacao_producao p ON l.programacao_id = p.id
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
        ORDER BY cq.created_at DESC LIMIT 1
    ), 'pendente') as cq_resultado,
    -- Envase
    EXISTS (
        SELECT 1 FROM envase ev
        JOIN lotes l ON ev.lote_id = l.id
        JOIN programacao_producao p ON l.programacao_id = p.id
        WHERE (os.origem_os = 'manual' AND p.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND p.ordem_servico_onfarm_id = os.os_id)
    ) as tem_envase,
    -- Estoque
    EXISTS (
        SELECT 1 FROM estoque_produto ep
        WHERE ep.reservado_para_os_id = os.os_id AND ep.reservado_para_os_tipo = os.origem_os
    ) as tem_estoque,
    -- Entrega
    COALESCE(ue.status_entrega, 'pendente') as entrega_status,
    COALESCE(ue.status_entrega IN ('entregue', 'confirmada', 'concluida'), false) as entrega_confirmada,
    -- Aplicação (Informativa)
    EXISTS (
        SELECT 1 FROM aplicacoes a 
        WHERE (os.origem_os = 'manual' AND a.ordem_servico_id = os.os_id) OR (os.origem_os = 'onfarm' AND a.ordem_servico_onfarm_id = os.os_id)
    ) as tem_aplicacao,
    -- Regra de Finalização
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

GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO service_role;

-- 3. Recriação da View vw_esteira_laboratorio
CREATE VIEW public.vw_esteira_laboratorio AS
WITH os_base AS (
    SELECT 
        'manual'::text as origem_os, id, cliente_id, fazenda_id, talhao_id, produto_id, status::text as status_os_text, created_at, numero_os
    FROM ordens_servico
    UNION ALL
    SELECT 
        'onfarm'::text as origem_os, id, cliente_id, fazenda_id, talhao_id, produto_id, status::text as status_os_text, created_at, numero_os
    FROM ordens_servico_onfarm
)
SELECT 
    ob.origem_os,
    ob.id as os_id,
    ob.numero_os,
    ob.cliente_id,
    c.nome as cliente_nome,
    f.nome as fazenda_nome,
    t.nome as talhao_nome,
    p.nome as produto_nome,
    ob.status_os_text as status_os,
    -- Integridade
    vi.tem_programacao,
    vi.tem_lote,
    vi.cq_resultado,
    vi.tem_envase,
    vi.tem_estoque,
    vi.entrega_status,
    vi.entrega_confirmada,
    vi.tem_aplicacao as aplicacao_informativa,
    vi.pode_finalizar,
    -- Status Oficial
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
    END as status_esteira_oficial
FROM os_base ob
JOIN public.vw_os_integridade_esteira vi ON ob.id = vi.os_id AND ob.origem_os = vi.origem_os
LEFT JOIN clientes c ON ob.cliente_id = c.id
LEFT JOIN fazendas f ON ob.fazenda_id = f.id
LEFT JOIN talhoes t ON ob.talhao_id = t.id
LEFT JOIN produtos p ON ob.produto_id = p.id;

GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_esteira_laboratorio TO service_role;

-- 4. Recriação da RPC de Avanço da Esteira
CREATE FUNCTION public.rpc_avancar_esteira_laboratorio(
    p_origem text,
    p_os_id uuid,
    p_programacao_id uuid,
    p_etapa_destino text,
    p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_status_os text;
    v_lote_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
    END IF;

    -- Validação de Perfil
    SELECT role INTO v_role FROM user_roles WHERE user_id = v_user_id AND role IN ('administrador', 'gestor', 'producao', 'estoque') LIMIT 1;
    IF v_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para avançar esteira laboratorial');
    END IF;

    -- Busca status atual da OS
    IF p_origem = 'manual' THEN
        SELECT status::text INTO v_status_os FROM ordens_servico WHERE id = p_os_id;
    ELSE
        SELECT status::text INTO v_status_os FROM ordens_servico_onfarm WHERE id = p_os_id;
    END IF;

    IF v_status_os IN ('finalizada', 'cancelada') THEN
        RETURN jsonb_build_object('success', false, 'message', 'OS já finalizada ou cancelada');
    END IF;

    -- Lógica por etapa
    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            UPDATE programacao_producao SET status = 'em_producao', responsavel_id = v_user_id WHERE id = p_programacao_id;
            
        WHEN 'enviar_cq' THEN
            SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
            IF v_lote_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Lote não encontrado para esta programação');
            END IF;
            UPDATE lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;
            
        WHEN 'aprovar_cq' THEN
            SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
            UPDATE lotes SET status = 'aprovado' WHERE id = v_lote_id;
            
        WHEN 'reprovar_cq' THEN
            SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
            UPDATE lotes SET status = 'reprovado' WHERE id = v_lote_id;
            
        WHEN 'enviar_envase' THEN
            IF p_origem = 'manual' THEN
                UPDATE ordens_servico SET status = 'em_envase' WHERE id = p_os_id;
            ELSE
                UPDATE ordens_servico_onfarm SET status = 'em_envase' WHERE id = p_os_id;
            END IF;

        WHEN 'enviar_entrega' THEN
            IF p_origem = 'manual' THEN
                UPDATE ordens_servico SET status = 'em_entrega' WHERE id = p_os_id;
            ELSE
                UPDATE ordens_servico_onfarm SET status = 'em_entrega' WHERE id = p_os_id;
            END IF;

        WHEN 'finalizar_os' THEN
            -- Valida integridade antes de finalizar
            IF NOT (SELECT pode_finalizar FROM vw_os_integridade_esteira WHERE os_id = p_os_id AND origem_os = p_origem) THEN
                RETURN jsonb_build_object('success', false, 'message', 'OS não cumpre requisitos para finalização');
            END IF;
            
            IF p_origem = 'manual' THEN
                UPDATE ordens_servico SET status = 'finalizada' WHERE id = p_os_id;
            ELSE
                UPDATE ordens_servico_onfarm SET status = 'finalizada' WHERE id = p_os_id;
            END IF;

        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Etapa de destino inválida: ' || p_etapa_destino);
    END CASE;

    RETURN jsonb_build_object('success', true, 'message', 'Esteira avançada com sucesso');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(text, uuid, uuid, text, text) TO authenticated;

-- 5. Recriação da RPC de Validação de Integridade
CREATE FUNCTION public.rpc_validar_integridade_esteira(
    p_origem text,
    p_os_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_integridade record;
BEGIN
    SELECT * INTO v_integridade FROM vw_os_integridade_esteira WHERE os_id = p_os_id AND origem_os = p_origem;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Dados de integridade não encontrados');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'pode_finalizar', v_integridade.pode_finalizar,
        'detalhes', jsonb_build_object(
            'tem_programacao', v_integridade.tem_programacao,
            'tem_lote', v_integridade.tem_lote,
            'cq_resultado', v_integridade.cq_resultado,
            'tem_envase', v_integridade.tem_envase,
            'tem_estoque', v_integridade.tem_estoque,
            'entrega_confirmada', v_integridade.entrega_confirmada,
            'entrega_status', v_integridade.entrega_status
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_validar_integridade_esteira(text, uuid) TO authenticated;
