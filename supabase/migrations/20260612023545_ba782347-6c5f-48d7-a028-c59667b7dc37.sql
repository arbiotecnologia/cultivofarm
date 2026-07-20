-- 1. Recriação da função can_user_access_cliente com lógica de vínculo operacional
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_admin boolean;
    v_is_gestor boolean;
    v_is_adm_sys boolean;
    v_is_consultor boolean;
    v_is_tecnico boolean;
    v_is_cliente boolean;
BEGIN
    -- Validação básica
    IF v_user_id IS NULL OR _cliente_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Cache de roles para performance (considerando que can_user_access_cliente é chamada em RLS)
    v_is_admin := has_role(v_user_id, 'administrador'::app_role);
    v_is_gestor := has_role(v_user_id, 'gestor'::app_role);
    v_is_adm_sys := has_role(v_user_id, 'administrativo'::app_role);
    v_is_consultor := has_role(v_user_id, 'consultor_tecnico'::app_role);
    v_is_tecnico := has_role(v_user_id, 'tecnico_agronomo'::app_role);
    v_is_cliente := has_role(v_user_id, 'cliente_produtor'::app_role);

    -- 1. Acesso Amplo para Administração e Gestão
    IF v_is_admin OR v_is_gestor OR v_is_adm_sys THEN
        RETURN TRUE;
    END IF;

    -- 2. Acesso Restrito para Clientes/Produtores (Vínculo Explícito em user_clientes)
    IF v_is_cliente THEN
        RETURN _cliente_id = ANY(get_cliente_ids_for_user(v_user_id));
    END IF;

    -- 3. Acesso Operacional para Consultores e Técnicos Agrônomos (Vínculo Real)
    IF v_is_consultor OR v_is_tecnico THEN
        RETURN EXISTS (
            -- Possui Visita técnica para este cliente
            SELECT 1 FROM public.registros_consultor 
            WHERE cliente_id = _cliente_id AND consultor_responsavel = v_user_id
        ) OR EXISTS (
            -- Possui Solicitação atribuída para este cliente
            SELECT 1 FROM public.portal_solicitacoes
            WHERE cliente_id = _cliente_id AND consultor_atribuido = v_user_id
        ) OR EXISTS (
            -- Possui vínculo direto no user_clientes (caso o sistema use essa tabela para consultores também)
            SELECT 1 FROM public.user_clientes
            WHERE user_id = v_user_id AND cliente_id = _cliente_id
        );
    END IF;

    -- 4. Demais usuários não acessam
    RETURN FALSE;
END;
$function$;

-- 2. Revisão de RLS em registros_consultor_arquivos
-- Limpa políticas antigas para evitar conflitos ou permissões sobrepostas
DROP POLICY IF EXISTS "Admin/Gestor total access on files" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "Consultor manage own files" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "Cliente read released files" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_select_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_insert_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_update_arquivos" ON public.registros_consultor_arquivos;
DROP POLICY IF EXISTS "auth_delete_arquivos" ON public.registros_consultor_arquivos;

-- A) Política para Administradores e Gestores (Acesso Total)
CREATE POLICY "Admin/Gestor manage technical files" ON public.registros_consultor_arquivos
FOR ALL TO authenticated
USING (
    has_role(auth.uid(), 'administrador'::app_role) 
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
);

-- B) Política para Consultores (Acesso às próprias visitas)
CREATE POLICY "Consultor manage own visit files" ON public.registros_consultor_arquivos
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.registros_consultor r 
        WHERE r.id = registros_consultor_arquivos.registro_consultor_id 
        AND r.consultor_responsavel = auth.uid()
    )
);

-- C) Política para Clientes/Produtores (Somente leitura de arquivos liberados)
CREATE POLICY "Cliente read released own files" ON public.registros_consultor_arquivos
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.registros_consultor r 
        WHERE r.id = registros_consultor_arquivos.registro_consultor_id 
        AND can_user_access_cliente(r.cliente_id)
        AND r.status IN ('aprovado', 'convertido_os', 'finalizado')
    )
);

-- 3. Grant de permissões
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_user_access_cliente(uuid) TO service_role;
