-- Melhora RLS na tabela de templates recorrentes
ALTER TABLE public.recurring_financial_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff financeiro pode ver templates" ON public.recurring_financial_templates;
CREATE POLICY "Staff financeiro pode ver templates" 
ON public.recurring_financial_templates 
FOR SELECT 
TO authenticated 
USING (is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin/Gestor/Financeiro podem criar templates" ON public.recurring_financial_templates;
CREATE POLICY "Admin/Gestor/Financeiro podem criar templates" 
ON public.recurring_financial_templates 
FOR INSERT 
TO authenticated 
WITH CHECK (is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin/Gestor/Financeiro podem atualizar templates" ON public.recurring_financial_templates;
CREATE POLICY "Admin/Gestor/Financeiro podem atualizar templates" 
ON public.recurring_financial_templates 
FOR UPDATE 
TO authenticated 
USING (is_financial_staff(auth.uid()))
WITH CHECK (is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Apenas admin pode deletar templates" ON public.recurring_financial_templates;
CREATE POLICY "Apenas admin pode deletar templates" 
ON public.recurring_financial_templates 
FOR DELETE 
TO authenticated 
USING (has_role(auth.uid(), 'administrador'::app_role));

-- Melhora RLS na tabela de log de geração
ALTER TABLE public.recurring_generation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.recurring_generation_log;
DROP POLICY IF EXISTS "Staff financeiro pode ver logs" ON public.recurring_generation_log;

CREATE POLICY "Staff financeiro pode gerenciar logs" 
ON public.recurring_generation_log 
FOR ALL 
TO authenticated 
USING (is_financial_staff(auth.uid()))
WITH CHECK (is_financial_staff(auth.uid()));

-- Função de auditoria para log de geração
CREATE OR REPLACE FUNCTION public.fn_recurring_generation_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('RECURRING_LOG', NEW.id, 'GENERATION_LOG_CREATED', to_jsonb(NEW), auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by)
    VALUES ('RECURRING_LOG', NEW.id, 'GENERATION_LOG_UPDATED', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, performed_by)
    VALUES ('RECURRING_LOG', OLD.id, 'GENERATION_LOG_DELETED', to_jsonb(OLD), auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_recurring_generation_audit
AFTER INSERT OR UPDATE OR DELETE ON public.recurring_generation_log
FOR EACH ROW EXECUTE FUNCTION public.fn_recurring_generation_audit();

-- Função para reverter (estornar) uma geração de recorrência
CREATE OR REPLACE FUNCTION public.fn_revert_recurring_generation(p_log_id UUID)
RETURNS VOID AS $$
DECLARE
  v_log public.recurring_generation_log%ROWTYPE;
  v_status TEXT;
BEGIN
  -- 1. Verifica permissão
  IF NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- 2. Busca o log
  SELECT * INTO v_log FROM public.recurring_generation_log WHERE id = p_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log de geração não encontrado';
  END IF;

  IF v_log.status <> 'SUCCESS' THEN
    RAISE EXCEPTION 'Apenas gerações com sucesso podem ser revertidas';
  END IF;

  -- 3. Verifica se o título gerado ainda pode ser excluído (status deve ser OPEN)
  IF v_log.generated_entity_type = 'RECEIVABLE' THEN
    SELECT status INTO v_status FROM public.accounts_receivable WHERE id = v_log.generated_entity_id;
    IF v_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Título de receita não pode ser revertido pois não está mais Aberto (Status: %)', v_status;
    END IF;
    
    -- Deleta o título (o trigger de auditoria do accounts_receivable cuidará do log de DELETE)
    DELETE FROM public.accounts_receivable WHERE id = v_log.generated_entity_id;
    
  ELSIF v_log.generated_entity_type = 'PAYABLE' THEN
    SELECT status INTO v_status FROM public.accounts_payable WHERE id = v_log.generated_entity_id;
    IF v_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Título de despesa não pode ser revertido pois não está mais Aberto (Status: %)', v_status;
    END IF;

    DELETE FROM public.accounts_payable WHERE id = v_log.generated_entity_id;
  END IF;

  -- 4. Log de auditoria da reversão
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, performed_by, reason)
  VALUES ('RECURRING_TEMPLATE', v_log.template_id, 'RECURRING_GENERATION_REVERSED', to_jsonb(v_log), auth.uid(), 'Reversão manual solicitada pelo gestor');

  -- 5. Remove o log para permitir nova geração na mesma data (o trigger de log_audit registrará DELETED)
  DELETE FROM public.recurring_generation_log WHERE id = p_log_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
