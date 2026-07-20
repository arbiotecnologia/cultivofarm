-- 0. Remover funções antigas para evitar erro de tipo de retorno
DROP FUNCTION IF EXISTS public.rpc_liberar_recomendacao_produtor(uuid);
DROP FUNCTION IF EXISTS public.rpc_converter_visita_em_os(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid);

-- 1. Backup da lógica original da rpc_avancar_esteira_laboratorio para manter comportamento
CREATE OR REPLACE FUNCTION public._rpc_avancar_esteira_laboratorio_internal(p_os_id uuid, p_origem_os text, p_etapa_destino text, p_programacao_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        WHEN 'gerar_lote' THEN NULL;
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
        WHEN 'enviar_envase' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'envase');
        WHEN 'concluir_envase' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
        WHEN 'gerar_estoque', 'reservar_estoque' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
        WHEN 'criar_entrega' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');
        WHEN 'enviar_entrega' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');
        WHEN 'finalizar_os' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'finalizada');
        ELSE
    END CASE;

    INSERT INTO public.laboratorio_esteira_eventos (ordem_servico_id, origem_os, etapa_origem, etapa_destino, usuario_id)
    VALUES (p_os_id, p_origem_os, v_etapa_anterior_os, p_etapa_destino, auth.uid());

    RETURN jsonb_build_object('success', true, 'message', 'Etapa avançada com sucesso');
END;
$$;

-- 2. Recriar Views com security_invoker = true
DROP VIEW IF EXISTS public.vw_esteira_laboratorio;
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;
DROP VIEW IF EXISTS public.vw_os_integridade_esteira;

CREATE VIEW public.vw_os_integridade_esteira 
WITH (security_invoker = true) AS
WITH base_os AS (
    SELECT id AS os_id, 'manual'::text AS origem_os, numero_os, cliente_id, (status)::text AS status_os, prioridade, created_at FROM public.ordens_servico
    UNION ALL
    SELECT id AS os_id, 'onfarm'::text AS origem_os, numero_os, cliente_id, (status)::text AS status_os, prioridade, created_at FROM public.ordens_servico_onfarm
), esteira_data AS (
    SELECT 
        bos.os_id, bos.origem_os, bos.numero_os, bos.cliente_id, c.nome AS cliente_nome, bos.status_os, bos.prioridade,
        (pp.status)::text AS status_programacao, pp.id AS programacao_id, pp.data_programada, pp.responsavel_id, pp.created_at AS programacao_created_at, bos.created_at AS os_created_at,
        (l.status)::text AS status_lote, l.id AS lote_id, l.codigo_lote, (cq.resultado)::text AS status_cq, ev.id AS envase_id, (ep.status)::text AS status_estoque, ep.id AS estoque_id,
        (pp.id IS NOT NULL) AS possui_programacao, (l.id IS NOT NULL) AS possui_lote, ((cq.resultado)::text = 'aprovado'::text) AS possui_cq_aprovado, (ev.id IS NOT NULL) AS possui_envase,
        (ep.id IS NOT NULL) AS possui_estoque, ((ep.status)::text = 'reservado'::text) AS possui_reserva, (ent.id IS NOT NULL) AS possui_entrega, (ent.status = 'entregue'::status_entrega) AS possui_entrega_confirmada,
        (ap.id IS NOT NULL) AS possui_aplicacao
    FROM base_os bos
    LEFT JOIN public.clientes c ON bos.cliente_id = c.id
    LEFT JOIN public.programacao_producao pp ON ((bos.origem_os = 'manual' AND pp.ordem_servico_id = bos.os_id) OR (bos.origem_os = 'onfarm' AND pp.ordem_servico_onfarm_id = bos.os_id))
    LEFT JOIN public.lotes l ON pp.id = l.programacao_id
    LEFT JOIN LATERAL (SELECT resultado FROM public.controle_qualidade WHERE lote_id = l.id ORDER BY created_at DESC LIMIT 1) cq ON true
    LEFT JOIN public.envase ev ON l.id = ev.lote_id
    LEFT JOIN LATERAL (SELECT id, status FROM public.estoque_produto WHERE lote_id = l.id ORDER BY created_at DESC LIMIT 1) ep ON true
    LEFT JOIN LATERAL (SELECT id, status FROM public.entregas WHERE ((bos.origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR (bos.origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id)) AND status <> 'cancelada' ORDER BY created_at DESC LIMIT 1) ent ON true
    LEFT JOIN LATERAL (SELECT id FROM public.aplicacoes WHERE (bos.origem_os = 'manual' AND ordem_servico_id = bos.os_id) OR (bos.origem_os = 'onfarm' AND ordem_servico_onfarm_id = bos.os_id) LIMIT 1) ap ON true
)
SELECT 
    *,
    CASE 
        WHEN possui_entrega_confirmada THEN 'concluida'
        WHEN possui_entrega THEN 'em_entrega'
        WHEN possui_estoque THEN 'pronto_entrega'
        WHEN possui_envase THEN 'envase'
        WHEN possui_cq_aprovado THEN 'aprovado_cq'
        WHEN possui_lote THEN 'em_producao'
        WHEN possui_programacao THEN 'programado'
        ELSE 'aguardando_producao'
    END AS status_esteira_oficial,
    NOT (status_os = 'cancelada' OR status_os = 'finalizada') AS pode_avancar,
    possui_entrega_confirmada AS pode_finalizar,
    ARRAY[]::TEXT[] AS bloqueios
FROM esteira_data;

CREATE VIEW public.vw_fluxo_visita_tecnica 
WITH (security_invoker = true) AS
WITH last_checkin AS (
    SELECT DISTINCT ON (registro_consultor_id) registro_consultor_id, created_at AS data_checkin FROM public.visitas_checkin ORDER BY registro_consultor_id, created_at DESC
), last_aprovacao AS (
    SELECT DISTINCT ON (registro_consultor_id) registro_consultor_id, status_aprovacao, created_at AS data_aprovacao FROM public.aprovacoes_tecnicas ORDER BY registro_consultor_id, created_at DESC
)
SELECT 
    r.id AS registro_id, r.cliente_id, c.nome AS cliente_nome, r.fazenda_id, f.nome AS fazenda_nome, r.talhao_id, t.nome AS talhao_nome, r.status, r.consultor_responsavel, p.nome AS consultor_nome,
    r.created_at AS data_criacao, lc.data_checkin, r.observacoes_tecnicas, la.status_aprovacao, la.data_aprovacao, os.id AS os_onfarm_id, os.numero_os AS os_onfarm_numero,
    CASE 
        WHEN os.id IS NOT NULL THEN 'convertido_os'
        WHEN la.status_aprovacao = 'aprovado' THEN 'aprovado'
        WHEN r.observacoes_tecnicas IS NOT NULL AND r.observacoes_tecnicas <> '' THEN 'aguardando_aprovacao'
        WHEN lc.data_checkin IS NOT NULL THEN 'em_visita'
        ELSE 'agendado'
    END AS status_fluxo
FROM public.registros_consultor r
LEFT JOIN public.clientes c ON r.cliente_id = c.id
LEFT JOIN public.fazendas f ON r.fazenda_id = f.id
LEFT JOIN public.talhoes t ON r.talhao_id = t.id
LEFT JOIN public.profiles p ON r.consultor_responsavel = p.user_id
LEFT JOIN last_checkin lc ON r.id = lc.registro_consultor_id
LEFT JOIN last_aprovacao la ON r.id = la.registro_consultor_id
LEFT JOIN public.ordens_servico_onfarm os ON r.id = os.registro_consultor_id;

CREATE VIEW public.vw_esteira_laboratorio 
WITH (security_invoker = true) AS
SELECT 
    v.origem_os, v.os_id, v.numero_os, v.cliente_id, v.cliente_nome, v.status_os, v.status_programacao, v.lote_id, v.codigo_lote, v.status_lote, v.status_cq, v.envase_id, v.estoque_id, v.status_esteira_oficial, v.pode_finalizar, v.os_created_at AS created_at
FROM public.vw_os_integridade_esteira v;

-- 3. Atualizar RPCs com Validação de Segurança
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role public.app_role;
  v_registro record;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role NOT IN ('administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão');
  END IF;
  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Visita não encontrada'); END IF;
  IF v_user_role NOT IN ('administrador', 'gestor') AND v_registro.consultor_responsavel <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Você não é o consultor responsável por esta visita');
  END IF;
  UPDATE public.registros_consultor SET status = 'aprovado', updated_at = now() WHERE id = p_registro_id;
  RETURN jsonb_build_object('success', true, 'message', 'Recomendação liberada');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(p_registro_id uuid, p_observacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role public.app_role;
  v_registro record;
  v_new_os_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role NOT IN ('administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão');
  END IF;
  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_registro.status <> 'aprovado' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita precisa estar aprovada/liberada');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ordens_servico_onfarm WHERE registro_consultor_id = p_registro_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'OS já existe para esta visita');
  END IF;
  INSERT INTO public.ordens_servico_onfarm (
    cliente_id, fazenda_id, talhao_id, cultura_id, consultor_responsavel, registro_consultor_id, status, created_by, observacoes_adicionais
  ) VALUES (
    v_registro.cliente_id, v_registro.fazenda_id, v_registro.talhao_id, v_registro.cultura_id, v_registro.consultor_responsavel, v_registro.id, 'aberta', v_user_id, p_observacao
  ) RETURNING id INTO v_new_os_id;
  UPDATE public.registros_consultor SET status = 'convertido_os', updated_at = now() WHERE id = p_registro_id;
  RETURN jsonb_build_object('success', true, 'os_id', v_new_os_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(p_os_id uuid, p_origem_os text, p_etapa_destino text, p_programacao_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role public.app_role;
BEGIN
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    IF v_user_role IS NULL THEN RAISE EXCEPTION 'Usuário não possui perfil atribuído.'; END IF;
    IF v_user_role IN ('cliente_produtor', 'aplicador') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seu perfil não permite avançar a esteira laboratorial.');
    END IF;
    IF v_user_role IN ('consultor_tecnico', 'tecnico_agronomo') AND p_etapa_destino NOT IN ('assumir_producao', 'gerar_lote', 'enviar_cq') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Consultores só podem avançar até o envio para CQ.');
    END IF;
    RETURN public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem_os, p_etapa_destino, p_programacao_id);
END;
$$;

-- 4. RLS em registros_consultor_arquivos
ALTER TABLE public.registros_consultor_arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin/Gestor total access on files" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "Consultor read own visit files" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "Cliente read own released files" ON public.registros_consultor_arquivos;

CREATE POLICY "Admin/Gestor total access on files" ON public.registros_consultor_arquivos FOR ALL TO authenticated USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));
CREATE POLICY "Consultor read own visit files" ON public.registros_consultor_arquivos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.id = registros_consultor_arquivos.registro_consultor_id AND r.consultor_responsavel = auth.uid()));
CREATE POLICY "Cliente read own released files" ON public.registros_consultor_arquivos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.id = registros_consultor_arquivos.registro_consultor_id AND r.cliente_id = ANY(get_cliente_ids_for_user(auth.uid())) AND r.status IN ('aprovado', 'convertido_os')));

-- 5. Grants
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON public.registros_consultor_arquivos TO authenticated;
