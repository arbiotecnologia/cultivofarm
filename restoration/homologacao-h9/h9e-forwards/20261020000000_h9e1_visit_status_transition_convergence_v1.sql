-- H9-E1 — forward reversível (homologação ikaauvsflpmamgxmkhoq; ledger 675 -> 676)
-- Objeto único: public.validate_registro_status_transition() (trigger trg_validate_registro_status,
-- BEFORE UPDATE ON public.registros_consultor), OID 18869, owner postgres,
-- SECURITY DEFINER, search_path=public, ACL postgres=X,service_role=X (sem PUBLIC, sem anon).
-- Fingerprint pré-H9-E1 (md5 de pg_get_functiondef): 33e9641876fc4cc6007cca730308ffa7
--
-- Defeito reproduzido em homologação, em transação integralmente revertida:
--   dono legítimo  -> 23514 'Transição inválida: ... de "rascunho" para "em_andamento"'
--   administrador  -> 23514 (idem)
-- public.start_technical_visit_secure(...) grava status='em_andamento' e
-- public.finish_technical_visit_secure(...) exige status='em_andamento' antes de 'finalizado',
-- mas a matriz do trigger nunca previu 'em_andamento' — estado que existe no enum
-- public.status_registro_consultor e é reconhecido por public.is_technical_visit_editable_status.
-- Resultado: o início de visita era impossível e o fluxo não convergia ponta a ponta.
--
-- Correção mínima (somente a matriz de transições e a validação de finalização):
--   + rascunho      -> em_andamento
--   + em_andamento  -> finalizado, arquivado
--   + a exigência de problema_principal ao finalizar passa a cobrir também
--     em_andamento -> finalizado, para que o novo caminho não contorne regra já vigente.
-- Preservados: nome, assinatura, retorno, owner, ACL, SECURITY DEFINER, search_path,
-- todas as demais transições, a reabertura restrita a administrador e o log de status.
-- Nenhuma permissão ampliada. Sem BEGIN/COMMIT internos (aplicar em transação externa).

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
      WHEN OLD.status::text = 'rascunho' AND NEW.status::text IN ('em_andamento', 'finalizado', 'arquivado') THEN TRUE

      -- H9-E1: visita iniciada por start_technical_visit_secure e encerrada por
      -- finish_technical_visit_secure. Estado intermediario legitimo do fluxo de campo.
      WHEN OLD.status::text = 'em_andamento' AND NEW.status::text IN ('finalizado', 'arquivado') THEN TRUE
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
    IF NEW.status::text = 'finalizado' AND OLD.status::text IN ('rascunho', 'em_andamento') THEN
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
