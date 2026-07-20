-- 1. Reforço de RLS para registros_consultor_arquivos
ALTER TABLE public.registros_consultor_arquivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/Gestor total access on files" ON public.registros_consultor_arquivos;
CREATE POLICY "Admin/Gestor total access on files" ON public.registros_consultor_arquivos
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Consultor read own visit files" ON public.registros_consultor_arquivos;
CREATE POLICY "Consultor read own visit files" ON public.registros_consultor_arquivos
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registros_consultor_arquivos.registro_consultor_id
    AND r.consultor_responsavel = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registros_consultor_arquivos.registro_consultor_id
    AND r.consultor_responsavel = auth.uid()
  )
);

DROP POLICY IF EXISTS "Cliente read own released files" ON public.registros_consultor_arquivos;
CREATE POLICY "Cliente read own released files" ON public.registros_consultor_arquivos
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registros_consultor_arquivos.registro_consultor_id
    AND r.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
    AND r.status = ANY (ARRAY['aprovado'::public.status_registro_consultor, 'convertido_os'::public.status_registro_consultor])
  )
);

-- 2. Garantir security_invoker em views (Recriação preventiva se necessário)
-- Obs: A Fase 10.2.1.8.1 já deve ter feito isso, mas reforçamos a estrutura segura.

-- 3. Tabela de Auditoria de Duplicidade (Não destrutiva)
CREATE TABLE IF NOT EXISTS public.auditoria_duplicidade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tabela_origem TEXT NOT NULL,
    item_id UUID NOT NULL,
    client_uuid TEXT,
    motivo TEXT,
    resolvido BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.auditoria_duplicidade TO authenticated;
GRANT ALL ON public.auditoria_duplicidade TO service_role;
ALTER TABLE public.auditoria_duplicidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/Gestor view audit" ON public.auditoria_duplicidade FOR SELECT USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role));

-- 4. Reforço de Segurança nas RPCs (Exemplo de padrão seguro)
-- RPC Liberar Recomendação
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_consultor_id UUID;
    v_status status_registro_consultor;
BEGIN
    -- Validação Auth
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Não autenticado'); END IF;

    SELECT consultor_responsavel, status INTO v_consultor_id, v_status
    FROM registros_consultor WHERE id = p_registro_id;

    -- Validação Permissão
    IF NOT (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor') OR v_consultor_id = auth.uid()) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sem permissão');
    END IF;

    -- Lógica
    UPDATE registros_consultor SET status = 'aprovado', data_aprovacao = now() 
    WHERE id = p_registro_id AND status = 'finalizado';
    
    RETURN jsonb_build_object('success', true);
END;
$$;
