-- Adicionar valores extras à categoria de arquivos para suportar laudos e documentos do cliente
ALTER TYPE public.categoria_arquivo_consultor ADD VALUE IF NOT EXISTS 'laudo';
ALTER TYPE public.categoria_arquivo_consultor ADD VALUE IF NOT EXISTS 'documento_cliente';
ALTER TYPE public.categoria_arquivo_consultor ADD VALUE IF NOT EXISTS 'recomendacao_anexa';

-- Trigger: validar transições de status do registro do consultor
CREATE OR REPLACE FUNCTION public.validate_registro_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Matriz de transições permitidas
    v_allowed := CASE
      WHEN OLD.status = 'rascunho' AND NEW.status IN ('finalizado', 'arquivado') THEN TRUE
      WHEN OLD.status = 'finalizado' AND NEW.status IN ('enviado_aprovacao', 'arquivado') THEN TRUE
      WHEN OLD.status = 'enviado_aprovacao' AND NEW.status IN ('aprovado', 'finalizado', 'arquivado') THEN TRUE
      WHEN OLD.status = 'aprovado' AND NEW.status IN ('convertido_os', 'arquivado') THEN TRUE
      WHEN OLD.status = 'convertido_os' AND NEW.status = 'arquivado' THEN TRUE
      ELSE FALSE
    END;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'Transição inválida: não é possível mudar de "%" para "%". Conclua a etapa atual antes de avançar.',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    -- Validações adicionais ao finalizar
    IF NEW.status = 'finalizado' THEN
      IF COALESCE(TRIM(NEW.problema_principal), '') = '' THEN
        RAISE EXCEPTION 'Para finalizar a visita, informe o problema principal.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF COALESCE(TRIM(NEW.observacoes_tecnicas), '') = '' THEN
        RAISE EXCEPTION 'Para finalizar a visita, preencha a descrição técnica.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Log da transição
    INSERT INTO public.registros_consultor_status_log (
      registro_consultor_id, status_anterior, status_novo, changed_by
    ) VALUES (
      NEW.id, OLD.status::TEXT, NEW.status::TEXT, auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_registro_status ON public.registros_consultor;
CREATE TRIGGER trg_validate_registro_status
  BEFORE UPDATE ON public.registros_consultor
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_registro_status_transition();