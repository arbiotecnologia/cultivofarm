-- 1. Adicionar campos de rastreabilidade
ALTER TABLE public.portal_solicitacoes ADD COLUMN IF NOT EXISTS registro_origem_id UUID REFERENCES public.registros_consultor(id);
ALTER TABLE public.registros_consultor ADD COLUMN IF NOT EXISTS registro_origem_id UUID REFERENCES public.registros_consultor(id);
ALTER TABLE public.registros_consultor ADD COLUMN IF NOT EXISTS consultor_profile_id UUID REFERENCES public.profiles(id);

-- 2. Corrigir vínculos de check-ins órfãos
UPDATE public.visitas_checkin vc
SET registro_consultor_id = rc.id
FROM public.registros_consultor rc
WHERE vc.registro_consultor_id IS NULL
AND vc.solicitacao_id = rc.solicitacao_id
AND rc.solicitacao_id IS NOT NULL;

-- 3. RPC para liberação de recomendação ao produtor
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status_atual text;
    v_user_id uuid;
    v_user_role text;
    v_possui_recomendacao boolean;
BEGIN
    v_user_id := auth.uid();
    
    -- Verificar permissão (Administrador, Gestor ou Consultor Responsável)
    SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
    
    SELECT status::text INTO v_status_atual 
    FROM public.registros_consultor 
    WHERE id = p_registro_id;

    IF v_status_atual IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Visita não encontrada.');
    END IF;

    -- Verificar se é o consultor responsável ou tem role superior
    IF v_user_role NOT IN ('administrador', 'gestor') THEN
        IF NOT EXISTS (SELECT 1 FROM public.registros_consultor WHERE id = p_registro_id AND consultor_responsavel = v_user_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Permissão negada.');
        END IF;
    END IF;

    -- Verificar se possui recomendação
    SELECT EXISTS (
        SELECT 1 FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id = p_registro_id
    ) OR (
        SELECT (observacoes_tecnicas IS NOT NULL AND length(observacoes_tecnicas) > 20) 
        FROM public.registros_consultor WHERE id = p_registro_id
    ) INTO v_possui_recomendacao;

    IF NOT v_possui_recomendacao THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não é possível liberar: nenhuma recomendação técnica encontrada.');
    END IF;

    -- Atualizar status
    UPDATE public.registros_consultor
    SET status = 'aprovado',
        updated_at = now()
    WHERE id = p_registro_id;

    -- Registrar auditoria em visitas_logs se a tabela existir
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'visitas_logs') THEN
        INSERT INTO public.visitas_logs (registro_id, evento, descricao, realizado_por)
        VALUES (p_registro_id, 'liberacao_recomendacao', 'Recomendação liberada para o produtor.', v_user_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Recomendação liberada com sucesso.');
END;
$$;

-- 4. Criar View Consolidada vw_fluxo_visita_tecnica
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;
CREATE OR REPLACE VIEW public.vw_fluxo_visita_tecnica AS
WITH latest_checkin AS (
    SELECT DISTINCT ON (solicitacao_id, registro_consultor_id)
        solicitacao_id,
        registro_consultor_id,
        data_hora_checkin,
        id as checkin_id
    FROM public.visitas_checkin
    ORDER BY solicitacao_id, registro_consultor_id, data_hora_checkin DESC
),
evidencia_counts AS (
    SELECT registro_consultor_id, count(*) as count
    FROM public.registros_consultor_arquivos
    GROUP BY registro_consultor_id
),
recomendacao_counts AS (
    SELECT registro_consultor_id, count(*) as count
    FROM public.registros_consultor_recomendacoes
    GROUP BY registro_consultor_id
)
SELECT 
    ps.id as solicitacao_id,
    ps.numero_solicitacao,
    rc.id as registro_consultor_id,
    rc.codigo_visita,
    ps.cliente_id,
    c.nome as cliente_nome,
    ps.fazenda_id,
    f.nome as fazenda_nome,
    ps.talhao_id,
    t.nome as talhao_nome,
    rc.consultor_responsavel as consultor_id,
    p.nome as consultor_nome,
    ps.status as status_solicitacao,
    rc.status as status_visita,
    at.status_aprovacao as status_aprovacao,
    ps.confirmacao_produtor as status_decisao_produtor,
    ps.data_prevista_atendimento,
    lc.data_hora_checkin as data_checkin,
    rc.data_vistoria,
    rc.hora_fim as data_finalizacao,
    (lc.checkin_id IS NOT NULL) as possui_checkin,
    EXISTS (SELECT 1 FROM public.visita_diagnosticos vd WHERE vd.registro_id = rc.id) as possui_diagnostico,
    COALESCE(ec.count, 0) as qtd_evidencias,
    COALESCE(rec.count, 0) as qtd_recomendacoes,
    EXISTS (SELECT 1 FROM public.ordens_servico_onfarm os WHERE os.registro_consultor_id = rc.id) as possui_os,
    ps.created_at,
    rc.updated_at
FROM public.portal_solicitacoes ps
LEFT JOIN public.registros_consultor rc ON ps.id = rc.solicitacao_id
LEFT JOIN public.clientes c ON ps.cliente_id = c.id
LEFT JOIN public.fazendas f ON ps.fazenda_id = f.id
LEFT JOIN public.talhoes t ON ps.talhao_id = t.id
LEFT JOIN public.profiles p ON rc.consultor_responsavel = p.user_id
LEFT JOIN latest_checkin lc ON (ps.id = lc.solicitacao_id OR rc.id = lc.registro_consultor_id)
LEFT JOIN evidencia_counts ec ON rc.id = ec.registro_consultor_id
LEFT JOIN recomendacao_counts rec ON rc.id = rec.registro_consultor_id
LEFT JOIN public.aprovacoes_tecnicas at ON rc.id = at.registro_consultor_id;

-- 5. Atualizar RLS para arquivos de visita técnica
DROP POLICY IF EXISTS "admin_gestor_manage_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "consultor_manage_own_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "produtor_view_released_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_select_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_insert_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_update_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_delete_arquivos" ON public.registros_consultor_arquivos;

-- Administradores e Gestores podem tudo
CREATE POLICY "admin_gestor_manage_arquivos" ON public.registros_consultor_arquivos
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text IN ('administrador', 'gestor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text IN ('administrador', 'gestor')));

-- Consultores podem ver e gerenciar seus próprios arquivos
CREATE POLICY "consultor_manage_own_arquivos" ON public.registros_consultor_arquivos
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.registros_consultor rc 
            WHERE rc.id = registros_consultor_arquivos.registro_consultor_id 
            AND rc.consultor_responsavel = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.registros_consultor rc 
            WHERE rc.id = registros_consultor_arquivos.registro_consultor_id 
            AND rc.consultor_responsavel = auth.uid()
        )
    );

-- Produtores podem ver arquivos liberados
CREATE POLICY "produtor_view_released_arquivos" ON public.registros_consultor_arquivos
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.registros_consultor rc
            JOIN public.profiles prof ON rc.cliente_id = prof.cliente_id
            WHERE rc.id = registros_consultor_arquivos.registro_consultor_id
            AND prof.user_id = auth.uid()
            AND rc.status::text IN ('aprovado', 'convertido_os')
        )
    );

GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT ALL ON public.vw_fluxo_visita_tecnica TO service_role;
