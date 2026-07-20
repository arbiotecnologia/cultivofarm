-- 1. Adicionar novas categorias ao enum (idempotente)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'categoria_arquivo_consultor' AND e.enumlabel = 'checkin') THEN
        ALTER TYPE public.categoria_arquivo_consultor ADD VALUE 'checkin';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'categoria_arquivo_consultor' AND e.enumlabel = 'vistoria') THEN
        ALTER TYPE public.categoria_arquivo_consultor ADD VALUE 'vistoria';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'categoria_arquivo_consultor' AND e.enumlabel = 'retorno') THEN
        ALTER TYPE public.categoria_arquivo_consultor ADD VALUE 'retorno';
    END IF;
END $$;

-- 2. Recriar view vw_fluxo_visita_tecnica
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;
CREATE OR REPLACE VIEW public.vw_fluxo_visita_tecnica AS
WITH stats_visita AS (
    SELECT 
        v.id as registro_id,
        COUNT(DISTINCT d.id) as total_diagnosticos,
        COUNT(DISTINCT a.id) as total_evidencias,
        COUNT(DISTINCT r.id) as total_recomendacoes,
        EXISTS(SELECT 1 FROM public.visitas_checkin vc WHERE vc.registro_consultor_id = v.id) as tem_checkin
    FROM public.registros_consultor v
    LEFT JOIN public.visita_diagnosticos d ON d.registro_id = v.id
    LEFT JOIN public.registros_consultor_arquivos a ON a.registro_consultor_id = v.id
    LEFT JOIN public.registros_consultor_recomendacoes r ON r.registro_consultor_id = v.id
    GROUP BY v.id
),
ultima_aprovacao AS (
    SELECT DISTINCT ON (registro_consultor_id) 
        registro_consultor_id,
        status_aprovacao,
        created_at
    FROM public.aprovacoes_tecnicas
    ORDER BY registro_consultor_id, created_at DESC
),
os_vinculada AS (
    SELECT DISTINCT ON (registro_consultor_id)
        registro_consultor_id,
        id as os_id,
        numero_os
    FROM public.ordens_servico_onfarm
    ORDER BY registro_consultor_id, created_at DESC
)
SELECT 
    s.id as solicitacao_id,
    s.numero_solicitacao,
    v.id as registro_consultor_id,
    v.codigo_visita,
    COALESCE(s.cliente_id, v.cliente_id) as cliente_id,
    c.nome as cliente_nome,
    COALESCE(s.fazenda_id, v.fazenda_id) as fazenda_id,
    f.nome as fazenda_nome,
    COALESCE(s.talhao_id, v.talhao_id) as talhao_id,
    t.nome as talhao_nome,
    COALESCE(s.consultor_atribuido, v.consultor_responsavel) as consultor_id,
    p.nome as consultor_nome,
    s.status::text as status_solicitacao,
    v.status::text as status_visita,
    ua.status_aprovacao::text as status_aprovacao,
    COALESCE(s.tipo_demanda::text, v.tipo_visita::text) as tipo_demanda,
    s.data_prevista_atendimento,
    v.data_vistoria,
    COALESCE(v.created_at, s.created_at) as created_at,
    COALESCE(v.updated_at, s.updated_at) as updated_at,
    COALESCE(sv.tem_checkin, false) as possui_checkin,
    COALESCE(sv.total_diagnosticos, 0) as contagem_diagnosticos,
    COALESCE(sv.total_evidencias, 0) as contagem_evidencias,
    COALESCE(sv.total_recomendacoes, 0) as contagem_recomendacoes,
    (os.os_id IS NOT NULL) as possui_os,
    os.numero_os,
    CASE 
        WHEN s.id IS NOT NULL AND v.id IS NULL THEN 'Iniciar Visita'
        WHEN v.status::text = 'rascunho' THEN 'Executar Visita'
        WHEN v.status::text = 'finalizado' THEN 'Enviar para Aprovação'
        WHEN v.status::text = 'enviado_aprovacao' THEN 'Aprovar/Revisar'
        WHEN v.status::text = 'aprovado' AND s.status::text = 'aguardando_decisao_produtor' THEN 'Aguardar Produtor'
        ELSE 'Ver Detalhes'
    END as proxima_acao,
    EXTRACT(DAY FROM (now() - s.created_at))::int as dias_em_aberto
FROM public.portal_solicitacoes s
FULL OUTER JOIN public.registros_consultor v ON s.id = v.solicitacao_id
LEFT JOIN public.clientes c ON c.id = COALESCE(s.cliente_id, v.cliente_id)
LEFT JOIN public.fazendas f ON f.id = COALESCE(s.fazenda_id, v.fazenda_id)
LEFT JOIN public.talhoes t ON t.id = COALESCE(s.talhao_id, v.talhao_id)
LEFT JOIN public.profiles p ON p.id = COALESCE(s.consultor_atribuido, v.consultor_responsavel)
LEFT JOIN stats_visita sv ON sv.registro_id = v.id
LEFT JOIN ultima_aprovacao ua ON ua.registro_consultor_id = v.id
LEFT JOIN os_vinculada os ON os.registro_consultor_id = v.id;

-- 3. Recriar RPC rpc_liberar_recomendacao_produtor (Drop first to change return type if needed)
DROP FUNCTION IF EXISTS public.rpc_liberar_recomendacao_produtor(uuid);
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_visita RECORD;
    v_status_anterior TEXT;
    v_has_rec BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    -- 1. Validar Usuário e Perfil
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
    
    -- 2. Buscar Visita e Validar Existência
    SELECT * INTO v_visita FROM public.registros_consultor WHERE id = p_registro_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Visita técnica não encontrada.');
    END IF;

    v_status_anterior := v_visita.status::text;

    -- 3. Validar Permissões (Adm, Gestor ou Consultor Responsável)
    IF v_user_role NOT IN ('admin', 'gestor') AND v_visita.consultor_responsavel != v_user_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Você não tem permissão para liberar esta recomendação.');
    END IF;

    -- 4. Validar Status da Visita
    IF v_visita.status::text IN ('convertido_os', 'arquivado') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não é possível liberar recomendação de uma visita já convertida em OS ou arquivada.');
    END IF;

    -- 5. Validar se existe Recomendação
    SELECT EXISTS(
        SELECT 1 FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id = p_registro_id
    ) INTO v_has_rec;

    IF NOT v_has_rec AND (v_visita.observacoes_tecnicas IS NULL OR length(trim(v_visita.observacoes_tecnicas)) < 10) THEN
        RETURN jsonb_build_object('success', false, 'message', 'A visita não possui uma recomendação técnica estruturada ou descrição suficiente para liberação.');
    END IF;

    -- 6. Executar Atualizações
    UPDATE public.registros_consultor 
    SET status = 'aprovado', updated_at = now() 
    WHERE id = p_registro_id;

    IF v_visita.solicitacao_id IS NOT NULL THEN
        UPDATE public.portal_solicitacoes 
        SET status = 'aguardando_decisao_produtor', updated_at = now() 
        WHERE id = v_visita.solicitacao_id;
        
        INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
        VALUES (v_visita.solicitacao_id, 'recomendacao_liberada', 'Recomendação técnica liberada para decisão do produtor.', v_user_id);
    END IF;

    INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (p_registro_id, v_user_id, 'liberacao_produtor', 'Recomendação técnica aprovada e liberada para o portal do produtor.');

    INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, criado_por)
    VALUES (p_registro_id, v_status_anterior, 'aprovado', v_user_id);

    IF v_user_role IN ('admin', 'gestor') THEN
        INSERT INTO public.aprovacoes_tecnicas (registro_consultor_id, status_aprovacao, aprovado_por, data_aprovacao)
        VALUES (p_registro_id, 'aprovado', v_user_id, now());
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Recomendação liberada com sucesso.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Erro interno ao liberar recomendação: ' || SQLERRM);
END;
$$;
