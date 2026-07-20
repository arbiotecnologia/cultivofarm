-- Drop views to allow schema changes
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira;

-- 1. Atualizar vw_os_integridade_esteira
CREATE OR REPLACE VIEW public.vw_os_integridade_esteira AS 
WITH base_os AS (
    SELECT ordens_servico.id AS os_id,
        'manual'::text AS origem_os,
        ordens_servico.numero_os,
        ordens_servico.cliente_id,
        (ordens_servico.status)::text AS status_os,
        ordens_servico.prioridade,
        ordens_servico.created_at
    FROM ordens_servico
    UNION ALL
    SELECT ordens_servico_onfarm.id AS os_id,
        'onfarm'::text AS origem_os,
        ordens_servico_onfarm.numero_os,
        ordens_servico_onfarm.cliente_id,
        (ordens_servico_onfarm.status)::text AS status_os,
        ordens_servico_onfarm.prioridade,
        ordens_servico_onfarm.created_at
    FROM ordens_servico_onfarm
), esteira_data AS (
    SELECT bos.os_id,
        bos.origem_os,
        bos.numero_os,
        bos.cliente_id,
        c.nome AS cliente_nome,
        bos.status_os,
        bos.prioridade,
        (pp.status)::text AS status_programacao,
        pp.id AS programacao_id,
        pp.data_programada,
        pp.responsavel_id,
        pp.created_at AS programacao_created_at,
        bos.created_at AS os_created_at,
        (l.status)::text AS status_lote,
        l.id AS lote_id,
        l.codigo_lote,
        (cq.resultado)::text AS status_cq,
        ev.id AS envase_id,
        (ep.status)::text AS status_estoque,
        ep.id AS estoque_id,
        ep.quantidade_reservada,
        (ent.status)::text AS status_entrega,
        ap.id AS aplicacao_id,
        (pp.id IS NOT NULL) AS possui_programacao,
        (l.id IS NOT NULL) AS possui_lote,
        ((cq.resultado)::text = 'aprovado'::text) AS possui_cq_aprovado,
        (ev.id IS NOT NULL) AS possui_envase,
        (ep.id IS NOT NULL) AS possui_estoque,
        ((ep.status)::text = 'reservado'::text) AS possui_reserva,
        (ent.id IS NOT NULL) AS possui_entrega,
        (ent.status = 'entregue'::public.status_entrega) AS possui_entrega_confirmada,
        (ap.id IS NOT NULL) AS possui_aplicacao
    FROM base_os bos
    LEFT JOIN clientes c ON bos.cliente_id = c.id
    LEFT JOIN programacao_producao pp ON (
        (bos.origem_os = 'manual' AND pp.ordem_servico_id = bos.os_id) OR 
        (bos.origem_os = 'onfarm' AND pp.ordem_servico_onfarm_id = bos.os_id)
    )
    LEFT JOIN lotes l ON pp.id = l.programacao_id
    LEFT JOIN LATERAL ( 
        SELECT q.resultado
        FROM controle_qualidade q
        WHERE q.lote_id = l.id
        ORDER BY q.created_at DESC
        LIMIT 1
    ) cq ON true
    LEFT JOIN envase ev ON l.id = ev.lote_id
    LEFT JOIN LATERAL ( 
        SELECT e.id, e.status, e.quantidade_reservada
        FROM estoque_produto e
        WHERE e.lote_id = l.id
        ORDER BY e.created_at DESC
        LIMIT 1
    ) ep ON true
    LEFT JOIN LATERAL (
        SELECT e.id, e.status
        FROM entregas e
        WHERE (
            (bos.origem_os = 'manual' AND e.ordem_servico_id = bos.os_id) OR 
            (bos.origem_os = 'onfarm' AND e.ordem_servico_onfarm_id = bos.os_id)
        )
        AND e.status <> 'cancelada'
        ORDER BY e.created_at DESC
        LIMIT 1
    ) ent ON true
    LEFT JOIN LATERAL (
        SELECT a.id
        FROM aplicacoes a
        WHERE (
            (bos.origem_os = 'manual' AND a.ordem_servico_id = bos.os_id) OR 
            (bos.origem_os = 'onfarm' AND a.ordem_servico_onfarm_id = bos.os_id)
        )
        LIMIT 1
    ) ap ON true
)
SELECT os_id,
    origem_os,
    numero_os,
    cliente_id,
    cliente_nome,
    status_os,
    prioridade,
    status_programacao,
    status_lote,
    status_cq,
    CASE
        WHEN (envase_id IS NOT NULL) THEN 'concluido'::text
        ELSE 'pendente'::text
    END AS status_envase,
    status_estoque,
    CASE
        WHEN possui_reserva THEN 'reservado'::text
        ELSE 'pendente'::text
    END AS status_reserva,
    status_entrega,
    CASE
        WHEN possui_aplicacao THEN 'concluida'::text
        ELSE 'pendente'::text
    END AS status_aplicacao,
    possui_programacao,
    possui_lote,
    possui_cq_aprovado,
    possui_envase,
    possui_estoque,
    possui_reserva,
    possui_entrega,
    possui_entrega_confirmada,
    possui_aplicacao,
    false AS aplicacao_bloqueante,
    (possui_programacao AND possui_lote AND possui_cq_aprovado AND possui_envase AND possui_estoque AND possui_entrega_confirmada) AS pode_finalizar,
    array_remove(ARRAY[
        CASE WHEN NOT possui_programacao THEN 'sem programação'::text ELSE NULL::text END,
        CASE WHEN NOT possui_lote THEN 'sem lote'::text ELSE NULL::text END,
        CASE WHEN NOT possui_cq_aprovado THEN 'CQ não aprovado'::text ELSE NULL::text END,
        CASE WHEN NOT possui_envase THEN 'sem envase'::text ELSE NULL::text END,
        CASE WHEN NOT possui_estoque THEN 'sem estoque'::text ELSE NULL::text END,
        CASE WHEN NOT possui_entrega_confirmada THEN 'sem entrega confirmada'::text ELSE NULL::text END
    ], NULL::text) AS bloqueios,
    CASE
        WHEN NOT possui_programacao THEN 'Programar produção'::text
        WHEN NOT possui_lote THEN 'Gerar lote'::text
        WHEN NOT possui_cq_aprovado THEN 'Realizar CQ'::text
        WHEN NOT possui_envase THEN 'Registrar envase'::text
        WHEN NOT possui_estoque THEN 'Gerar estoque'::text
        WHEN NOT possui_entrega THEN 'Registrar entrega'::text
        WHEN NOT possui_entrega_confirmada THEN 'Confirmar entrega'::text
        ELSE 'Finalizar laboratório'::text
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

-- 2. Atualizar vw_esteira_laboratorio
CREATE OR REPLACE VIEW public.vw_esteira_laboratorio AS 
SELECT v.origem_os,
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
    ((COALESCE(osm.volume_total_ml, osf.volume_total_ml) / 1000.0))::numeric(12,2) AS volume_solicitado_l,
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
    ((v.data_programada < CURRENT_DATE) AND (v.status_os <> ALL (ARRAY['finalizada'::text, 'entregue'::text, 'cancelada'::text]))) AS atrasado,
    (v.programacao_created_at - v.os_created_at) AS tempo_os_ate_programacao,
    ((l.data_producao)::timestamp with time zone - (v.data_programada)::timestamp with time zone) AS tempo_programacao_ate_lote,
    (cq.data_aprovacao - (l.data_producao)::timestamp with time zone) AS tempo_lote_ate_cq,
    (ev.created_at - cq.data_aprovacao) AS tempo_cq_ate_envase,
    ((ent.data_saida)::timestamp with time zone - ev.created_at) AS tempo_envase_ate_entrega,
    ((ent.data_saida)::timestamp with time zone - v.os_created_at) AS tempo_os_ate_entrega,
    v.os_created_at AS created_at,
    now() AS updated_at,
    v.bloqueios AS bloqueios_esteira,
    v.pode_finalizar,
    v.status_esteira_oficial
FROM vw_os_integridade_esteira v
LEFT JOIN ordens_servico osm ON (v.os_id = osm.id AND v.origem_os = 'manual')
LEFT JOIN ordens_servico_onfarm osf ON (v.os_id = osf.id AND v.origem_os = 'onfarm')
LEFT JOIN fazendas f ON f.id = COALESCE(osm.fazenda_id, osf.fazenda_id)
LEFT JOIN talhoes t ON t.id = COALESCE(osm.talhao_id, osf.talhao_id)
LEFT JOIN produtos p ON p.id = COALESCE(osm.produto_id, osf.produto_id)
LEFT JOIN microrganismos m ON m.id = osm.microrganismo_id
LEFT JOIN lotes l ON l.id = v.lote_id
LEFT JOIN LATERAL ( 
    SELECT q.created_at AS data_aprovacao
    FROM controle_qualidade q
    WHERE q.lote_id = v.lote_id AND q.resultado = 'aprovado'
    ORDER BY q.created_at DESC
    LIMIT 1
) cq ON true
LEFT JOIN envase ev ON ev.id = v.envase_id
LEFT JOIN estoque_produto ep ON ep.id = v.estoque_id
LEFT JOIN LATERAL (
    SELECT e.id, e.data_saida
    FROM entregas e
    WHERE (
        (v.origem_os = 'manual' AND e.ordem_servico_id = v.os_id) OR 
        (v.origem_os = 'onfarm' AND e.ordem_servico_onfarm_id = v.os_id)
    )
    AND e.status <> 'cancelada'
    ORDER BY e.created_at DESC
    LIMIT 1
) ent ON true;

-- 3. Atualizar rpc_avancar_esteira_laboratorio
CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(
    p_origem_os text, 
    p_os_id uuid, 
    p_programacao_id uuid, 
    p_etapa_destino text, 
    p_observacao text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role public.app_role;
    v_profile_id UUID;
    v_status_atual TEXT;
    v_lote_id UUID;
    v_etapa_anterior_os TEXT;
    v_tabela_os TEXT;
    v_validacao jsonb;
BEGIN
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    IF v_user_role IS NULL THEN RAISE EXCEPTION 'Usuário não possui perfil atribuído.'; END IF;

    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

    IF p_origem_os = 'manual' THEN v_tabela_os := 'ordens_servico';
    ELSE v_tabela_os := 'ordens_servico_onfarm';
    END IF;

    -- Validação de integridade antes de avançar
    SELECT * INTO v_validacao FROM public.rpc_validar_integridade_esteira(p_os_id, p_origem_os, p_etapa_destino);
    IF NOT (v_validacao->>'permitido')::BOOLEAN THEN
        RETURN jsonb_build_object('success', false, 'message', (v_validacao->'bloqueios'->>0));
    END IF;

    EXECUTE format('SELECT status::text FROM %I WHERE id = $1 FOR UPDATE', v_tabela_os)
    INTO v_status_atual USING p_os_id;

    IF v_status_atual IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.'); END IF;

    v_etapa_anterior_os := v_status_atual;

    -- Localiza lote vinculado
    IF p_programacao_id IS NOT NULL AND p_programacao_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
        SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id FOR UPDATE;
    ELSE
        IF p_origem_os = 'manual' THEN
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_id = p_os_id LIMIT 1;
        ELSE
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_onfarm_id = p_os_id LIMIT 1;
        END IF;
    END IF;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_producao');
            IF p_programacao_id IS NOT NULL THEN
                UPDATE public.programacao_producao SET status = 'em_producao', responsavel_id = auth.uid() WHERE id = p_programacao_id;
            END IF;

        WHEN 'enviar_cq' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_cq');
            UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;

        WHEN 'aprovar_cq' THEN
            UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
            IF NOT EXISTS (SELECT 1 FROM public.controle_qualidade WHERE lote_id = v_lote_id AND resultado = 'aprovado' AND created_at > now() - interval '10 seconds') THEN
                INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'aprovado', v_profile_id);
            END IF;

        WHEN 'reprovar_cq' THEN
            UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
            IF NOT EXISTS (SELECT 1 FROM public.controle_qualidade WHERE lote_id = v_lote_id AND resultado = 'reprovado' AND created_at > now() - interval '10 seconds') THEN
                INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'reprovado', v_profile_id);
            END IF;

        WHEN 'enviar_envase' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'envase');

        WHEN 'concluir_envase' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');

        WHEN 'enviar_entrega' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');

        WHEN 'finalizar_os' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'finalizada');

        ELSE
    END CASE;

    INSERT INTO public.laboratorio_esteira_eventos (
        origem_os, os_id, programacao_id, lote_id, etapa_anterior, etapa_nova, acao, observacao, usuario_id
    ) VALUES (
        p_origem_os, p_os_id, p_programacao_id, v_lote_id, v_etapa_anterior_os, p_etapa_destino, 'rpc_avanco_seguro', p_observacao, auth.uid()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Etapa avançada com sucesso.');
END;
$function$;
