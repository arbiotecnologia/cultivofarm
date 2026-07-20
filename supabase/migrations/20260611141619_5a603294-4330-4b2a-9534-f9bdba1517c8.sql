-- 1. Dropar as views com CASCADE para permitir a mudança na estrutura de colunas
DROP VIEW IF EXISTS public.vw_esteira_laboratorio CASCADE;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira CASCADE;

-- 2. Recriar a view de integridade da esteira com a nova estrutura de colunas
CREATE VIEW public.vw_os_integridade_esteira AS
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
            (ent.status = 'entregue') AS possui_entrega_confirmada,
            (ap.id IS NOT NULL) AS possui_aplicacao
           FROM ((((((((base_os bos
             LEFT JOIN clientes c ON ((bos.cliente_id = c.id)))
             LEFT JOIN programacao_producao pp ON ((((bos.origem_os = 'manual'::text) AND (pp.ordem_servico_id = bos.os_id)) OR ((bos.origem_os = 'onfarm'::text) AND (pp.ordem_servico_onfarm_id = bos.os_id)))))
             LEFT JOIN lotes l ON ((pp.id = l.programacao_id)))
             LEFT JOIN LATERAL ( SELECT q.resultado
                   FROM controle_qualidade q
                  WHERE (q.lote_id = l.id)
                  ORDER BY q.created_at DESC
                 LIMIT 1) cq ON (true))
             LEFT JOIN envase ev ON ((l.id = ev.lote_id)))
             LEFT JOIN LATERAL ( SELECT e.id,
                    e.status,
                    e.quantidade_reservada
                   FROM estoque_produto e
                  WHERE (e.lote_id = l.id)
                  ORDER BY e.created_at DESC
                 LIMIT 1) ep ON (true))
             LEFT JOIN entregas ent ON ((bos.os_id = ent.ordem_servico_id)))
             LEFT JOIN aplicacoes ap ON (((bos.os_id = ap.ordem_servico_id) OR (bos.os_id = ap.ordem_servico_onfarm_id))))
        )
 SELECT os_id,
    origem_os,
    numero_os,
    cliente_id,
    cliente_nome,
    status_os,
    prioridade,
    status_programacao,
    programacao_id,
    data_programada,
    responsavel_id,
    programacao_created_at,
    os_created_at,
    status_lote,
    lote_id,
    codigo_lote,
    status_cq,
    envase_id,
    status_estoque,
    estoque_id,
    quantidade_reservada,
    status_entrega,
    aplicacao_id,
    possui_programacao,
    possui_lote,
    possui_cq_aprovado,
    possui_envase,
    possui_estoque,
    possui_reserva,
    possui_entrega,
    possui_entrega_confirmada,
    possui_aplicacao,
        CASE
            WHEN (status_os = 'cancelada'::text) THEN 'cancelado'::text
            WHEN (status_os = 'finalizada'::text) THEN 'finalizado'::text
            WHEN possui_entrega_confirmada THEN 'entregue'::text
            WHEN (status_entrega = 'em_transito'::text) THEN 'em_entrega'::text
            WHEN possui_reserva THEN 'estoque_reservado'::text
            WHEN possui_estoque THEN 'estoque_gerado'::text
            WHEN possui_envase THEN 'em_envase'::text
            WHEN (status_cq = 'aprovado'::text) THEN 'cq_aprovado'::text
            WHEN (status_cq = 'reprovado'::text) THEN 'cq_reprovado'::text
            WHEN (status_lote = 'aguardando_cq'::text) THEN 'aguardando_cq'::text
            WHEN (status_programacao = 'em_producao'::text) THEN 'em_producao'::text
            WHEN possui_programacao THEN 'demanda_recebida'::text
            ELSE 'demanda_recebida'::text
        END AS status_esteira_oficial,
        CASE
            WHEN (status_os = 'cancelada'::text) THEN 'cancelada'::text
            WHEN (status_os = 'finalizada'::text) THEN 'finalizada'::text
            WHEN possui_entrega_confirmada THEN 'finalizar_os'::text
            WHEN (status_entrega = 'em_transito'::text) THEN 'confirmar_entrega'::text
            WHEN possui_reserva THEN 'criar_entrega'::text
            WHEN possui_estoque THEN 'reservar_estoque'::text
            WHEN possui_envase THEN 'gerar_estoque'::text
            WHEN (status_cq = 'aprovado'::text) THEN 'enviar_envase'::text
            WHEN (status_cq = 'reprovado'::text) THEN 'revisar_producao'::text
            WHEN (status_lote = 'aguardando_cq'::text) THEN 'registrar_cq'::text
            WHEN (status_programacao = 'em_producao'::text) THEN 'gerar_lote'::text
            WHEN possui_programacao THEN 'assumir_producao'::text
            ELSE 'assumir_producao'::text
        END AS proxima_acao,
    ARRAY( SELECT b
           FROM unnest(ARRAY[
                CASE WHEN (NOT possui_programacao) THEN 'OS sem programação de produção'::text ELSE NULL::text END, 
                CASE WHEN (possui_programacao AND (NOT possui_lote)) THEN 'Programação sem lote vinculado'::text ELSE NULL::text END, 
                CASE WHEN (possui_lote AND (status_cq IS NULL)) THEN 'Lote aguardando envio para CQ ou análise'::text ELSE NULL::text END, 
                CASE WHEN ((status_cq = 'reprovado'::text) AND (NOT possui_envase)) THEN 'Lote reprovado no controle de qualidade'::text ELSE NULL::text END, 
                CASE WHEN (possui_cq_aprovado AND (NOT possui_envase)) THEN 'Aguardando registro de envase'::text ELSE NULL::text END, 
                CASE WHEN (possui_envase AND (NOT possui_estoque)) THEN 'Aguardando entrada no estoque'::text ELSE NULL::text END, 
                CASE WHEN (possui_estoque AND (NOT possui_reserva)) THEN 'Estoque disponível aguardando reserva'::text ELSE NULL::text END, 
                CASE WHEN (possui_reserva AND (NOT possui_entrega)) THEN 'Reserva realizada aguardando criação da entrega'::text ELSE NULL::text END, 
                CASE WHEN (possui_entrega AND (NOT possui_entrega_confirmada)) THEN 'Entrega em trânsito (não confirmada)'::text ELSE NULL::text END
            ]) b(b)
          WHERE (b.b IS NOT NULL)) AS bloqueios,
    (possui_entrega_confirmada AND (status_os <> 'finalizada'::text)) AS pode_finalizar
   FROM esteira_data;

-- 3. Recriar a vw_esteira_laboratorio dependente
CREATE VIEW public.vw_esteira_laboratorio AS
 SELECT v.programacao_id,
    v.origem_os,
    v.os_id,
    v.numero_os,
    v.cliente_id,
    v.cliente_nome,
    os.fazenda_nome,
    os.talhao_nome,
    os.produto_id,
    os.produto_nome,
    os.microrganismo_id,
    os.microrganismo_nome,
    os.volume_solicitado_ml,
    os.volume_solicitado_l,
    v.prioridade,
    v.data_programada,
    v.responsavel_id,
    prof.nome AS responsavel_nome,
    v.status_os,
    v.status_programacao,
    v.lote_id,
    v.codigo_lote,
    v.status_lote,
    v.status_cq AS cq_resultado,
    v.envase_id,
    v.estoque_id,
    v.status_estoque,
    v.quantidade_reservada,
    v.status_entrega AS entrega_status,
        CASE
            WHEN v.possui_aplicacao THEN 'concluida'::text
            ELSE NULL::text
        END AS aplicacao_status,
    v.os_created_at AS created_at,
    ((v.data_programada < CURRENT_DATE) AND (v.status_os <> ALL (ARRAY['finalizada'::text, 'entregue'::text, 'cancelada'::text]))) AS atrasado,
    v.proxima_acao,
    v.status_esteira_oficial,
    v.bloqueios AS bloqueios_esteira,
    v.pode_finalizar
   FROM ((vw_os_integridade_esteira v
     LEFT JOIN LATERAL ( SELECT f.nome AS fazenda_nome,
            t.nome AS talhao_nome,
            p.id AS produto_id,
            p.nome AS produto_nome,
            m.id AS microrganismo_id,
            m.nome AS microrganismo_nome,
            COALESCE(osm.volume_total_ml, osf.volume_total_ml) AS volume_solicitado_ml,
            ((COALESCE(osm.volume_total_ml, osf.volume_total_ml) / 1000.0))::numeric(12,2) AS volume_solicitado_l
           FROM ((((((( SELECT v.os_id,
                    v.origem_os) _v
             LEFT JOIN ordens_servico osm ON (((_v.os_id = osm.id) AND (_v.origem_os = 'manual'::text))))
             LEFT JOIN ordens_servico_onfarm osf ON (((_v.os_id = osf.id) AND (_v.origem_os = 'onfarm'::text))))
             LEFT JOIN fazendas f ON ((f.id = COALESCE(osm.fazenda_id, osf.fazenda_id))))
             LEFT JOIN talhoes t ON ((t.id = COALESCE(osm.talhao_id, osf.talhao_id))))
             LEFT JOIN produtos p ON ((p.id = COALESCE(osm.produto_id, osf.produto_id))))
             LEFT JOIN microrganismos m ON ((m.id = osm.microrganismo_id)))
         LIMIT 1) os ON (true))
     LEFT JOIN profiles prof ON ((v.responsavel_id = prof.id)));

-- 4. Atualizar a função rpc_validar_integridade_esteira
CREATE OR REPLACE FUNCTION public.rpc_validar_integridade_esteira(p_os_id uuid, p_origem_os text, p_acao_solicitada text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
AS $function$
DECLARE
    v_integridade RECORD;
    v_permitido BOOLEAN := TRUE;
    v_bloqueios TEXT[] := ARRAY[]::TEXT[];
    v_status_esteira TEXT;
    v_pode_finalizar BOOLEAN;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('permitido', FALSE, 'bloqueios', ARRAY['Usuário não autenticado'], 'status_esteira_atual', 'erro_seguranca');
    END IF;

    SELECT * INTO v_integridade FROM public.vw_os_integridade_esteira WHERE os_id = p_os_id AND origem_os = p_origem_os;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('permitido', FALSE, 'bloqueios', ARRAY['Ordem de Serviço não encontrada'], 'status_esteira_atual', 'nao_encontrado');
    END IF;

    v_status_esteira := v_integridade.status_esteira_oficial;
    v_pode_finalizar := v_integridade.pode_finalizar;

    CASE p_acao_solicitada
        WHEN 'enviar_cq' THEN
            IF NOT v_integridade.possui_lote THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível enviar para CQ sem lote gerado.'); END IF;
        WHEN 'enviar_envase' THEN
            IF NOT v_integridade.possui_cq_aprovado THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível envasar sem CQ aprovado.'); END IF;
        WHEN 'gerar_estoque' THEN
            IF NOT v_integridade.possui_envase THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível gerar estoque sem envase concluído.'); END IF;
        WHEN 'criar_entrega' THEN
            IF NOT v_integridade.possui_estoque THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível criar entrega sem estoque disponível.'); END IF;
        WHEN 'finalizar_os' THEN
            IF NOT v_integridade.pode_finalizar THEN v_permitido := FALSE; v_bloqueios := v_integridade.bloqueios; END IF;
        ELSE
    END CASE;

    RETURN jsonb_build_object('permitido', v_permitido, 'bloqueios', v_bloqueios, 'status_esteira_atual', v_status_esteira, 'pode_finalizar', v_pode_finalizar);
END;
$function$;

-- 5. Atualizar a função rpc_avancar_esteira_laboratorio
CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(p_origem_os text, p_os_id uuid, p_programacao_id uuid, p_etapa_destino text, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role public.app_role;
    v_profile_id UUID;
    v_status_atual TEXT;
    v_lote_id UUID;
    v_cq_aprovado BOOLEAN;
    v_envase_id UUID;
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

    IF p_programacao_id IS NOT NULL THEN
        PERFORM id FROM public.programacao_producao WHERE id = p_programacao_id FOR UPDATE;
    END IF;

    -- Localiza lote vinculado
    IF p_programacao_id IS NOT NULL AND p_programacao_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
        SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id FOR UPDATE;
    ELSE
        -- Tenta localizar lote pela OS se programacao_id for null
        IF p_origem_os = 'manual' THEN
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_id = p_os_id LIMIT 1;
        ELSE
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_onfarm_id = p_os_id LIMIT 1;
        END IF;
    END IF;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_producao');
            UPDATE public.programacao_producao SET status = 'em_producao', responsavel_id = auth.uid() WHERE id = p_programacao_id;

        WHEN 'enviar_cq' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_cq');
            UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;

        WHEN 'aprovar_cq' THEN
            UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
            INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'aprovado', v_profile_id);

        WHEN 'reprovar_cq' THEN
            UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
            INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'reprovado', v_profile_id);

        WHEN 'enviar_envase' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'envase');
            UPDATE public.lotes SET status = 'em_envase' WHERE id = v_lote_id;

        WHEN 'concluir_envase' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
            UPDATE public.lotes SET status = 'concluido' WHERE id = v_lote_id;

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
