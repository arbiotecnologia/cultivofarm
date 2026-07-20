-- 1. Adicionar novos valores aos ENUMs (se não existirem)
ALTER TYPE public.status_aprovacao ADD VALUE IF NOT EXISTS 'ajuste_solicitado';
ALTER TYPE public.status_aprovacao ADD VALUE IF NOT EXISTS 'reaberto';
ALTER TYPE public.status_registro_consultor ADD VALUE IF NOT EXISTS 'reprovado';

-- 2. Ajustar tabela aprovacoes_tecnicas
ALTER TABLE public.aprovacoes_tecnicas 
RENAME COLUMN gestor_responsavel TO aprovado_por;

ALTER TABLE public.aprovacoes_tecnicas 
ADD COLUMN IF NOT EXISTS aprovado_por_role public.app_role,
ADD COLUMN IF NOT EXISTS override boolean DEFAULT false;

-- 3. Atualizar a função de validação de transição de status
CREATE OR REPLACE FUNCTION public.validate_registro_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed BOOLEAN := FALSE;
  v_user_role public.app_role;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Obter a role do usuário atual
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

    -- Matriz de transições permitidas
    v_allowed := CASE
      -- Fluxo padrão
      WHEN OLD.status::text = 'rascunho' AND NEW.status::text IN ('finalizado', 'arquivado') THEN TRUE
      WHEN OLD.status::text = 'finalizado' AND NEW.status::text IN ('enviado_aprovacao', 'arquivado') THEN TRUE
      
      -- Durante Aprovação
      WHEN OLD.status::text = 'enviado_aprovacao' AND NEW.status::text IN ('aprovado', 'reprovado', 'rascunho', 'finalizado', 'arquivado') THEN TRUE
      
      -- Pós Aprovação
      WHEN OLD.status::text = 'aprovado' AND NEW.status::text IN ('convertido_os', 'arquivado') THEN TRUE
      
      -- REABERTURA: Só administrador pode reabrir um aprovado para enviado_aprovacao
      WHEN OLD.status::text = 'aprovado' AND NEW.status::text = 'enviado_aprovacao' AND v_user_role = 'administrador' THEN TRUE
      
      WHEN OLD.status::text = 'convertido_os' AND NEW.status::text = 'arquivado' THEN TRUE
      WHEN OLD.status::text = 'reprovado' AND NEW.status::text = 'arquivado' THEN TRUE
      ELSE FALSE
    END;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'Transição inválida: não é possível mudar de "%" para "%". Conclua a etapa atual antes de avançar ou verifique suas permissões.',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    -- Validações adicionais ao finalizar (VT)
    IF NEW.status::text = 'finalizado' AND OLD.status::text = 'rascunho' THEN
      IF COALESCE(TRIM(NEW.problema_principal), '') = '' THEN
        RAISE EXCEPTION 'Para finalizar a visita, informe o problema principal.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Log da transição com metadados estendidos
    INSERT INTO public.registros_consultor_status_log (
      registro_consultor_id, 
      status_anterior, 
      status_novo, 
      changed_by
    ) VALUES (
      NEW.id, 
      OLD.status::TEXT, 
      NEW.status::TEXT, 
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Atualizar RLS de aprovacoes_tecnicas para Produtores
DROP POLICY IF EXISTS "Staff manage technical approvals" ON public.aprovacoes_tecnicas;

CREATE POLICY "Authorized roles manage technical approvals"
ON public.aprovacoes_tecnicas
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'gestor'::app_role) OR
  (
    has_role(auth.uid(), 'cliente_produtor'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.registros_consultor r
      WHERE r.id = aprovacoes_tecnicas.registro_consultor_id
      AND r.cliente_id = ANY(get_cliente_ids_for_user(auth.uid()))
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role) OR 
  has_role(auth.uid(), 'gestor'::app_role) OR
  (
    has_role(auth.uid(), 'cliente_produtor'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.registros_consultor r
      WHERE r.id = aprovacoes_tecnicas.registro_consultor_id
      AND r.cliente_id = ANY(get_cliente_ids_for_user(auth.uid()))
    )
  )
);
