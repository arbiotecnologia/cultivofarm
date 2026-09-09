-- H9-E1 rollback byte-fiel ao estado pré-H9-E1 | homologação ikaauvsflpmamgxmkhoq
-- Restaura a definição viva imediatamente anterior a 20261020000000
-- (fingerprint 33e9641876fc4cc6007cca730308ffa7), preservando inclusive os
-- terminadores CRLF originais do corpo. Reintroduz, por definição, o bloqueio
-- 23514 no início da visita. ACL mínima: sem PUBLIC e sem anon.
-- Sem BEGIN/COMMIT internos (aplicar em transação externa).

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

REVOKE ALL ON FUNCTION public.validate_registro_status_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_registro_status_transition() FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_registro_status_transition() TO service_role;
