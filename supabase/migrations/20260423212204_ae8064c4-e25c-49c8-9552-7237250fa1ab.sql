-- Trigger: notify when a portal_solicitacao is assigned to a consultant
CREATE OR REPLACE FUNCTION public.notify_solicitacao_atribuida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo TEXT;
  v_cliente_nome TEXT;
BEGIN
  -- Only notify on transition to 'atribuida' or when consultor_atribuido changes
  IF (TG_OP = 'UPDATE' AND OLD.consultor_atribuido IS DISTINCT FROM NEW.consultor_atribuido AND NEW.consultor_atribuido IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'checkin_realizado') THEN

    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;

    -- Notify the client portal
    IF NEW.status = 'checkin_realizado' THEN
      INSERT INTO public.portal_notificacoes (cliente_id, titulo, mensagem, tipo)
      VALUES (
        NEW.cliente_id,
        'Consultor chegou na sua área',
        COALESCE('Atendimento de "' || NEW.tipo_demanda || '" — check-in realizado.', 'Check-in realizado.'),
        'informativo'
      );
    ELSIF NEW.status = 'atribuida' OR (OLD.consultor_atribuido IS NULL AND NEW.consultor_atribuido IS NOT NULL) THEN
      INSERT INTO public.portal_notificacoes (cliente_id, titulo, mensagem, tipo)
      VALUES (
        NEW.cliente_id,
        'Sua solicitação foi atribuída',
        'Um consultor técnico foi designado para a sua solicitação "' || NEW.tipo_demanda || '".',
        'informativo'
      );
    END IF;
  END IF;

  -- Notify on creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.portal_notificacoes (cliente_id, titulo, mensagem, tipo)
    VALUES (
      NEW.cliente_id,
      'Solicitação recebida',
      'Sua solicitação "' || NEW.tipo_demanda || '" foi registrada e está em triagem.',
      'informativo'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_solicitacao ON public.portal_solicitacoes;
CREATE TRIGGER trg_notify_solicitacao
  AFTER INSERT OR UPDATE ON public.portal_solicitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_solicitacao_atribuida();

-- Trigger: notify on visit finalized
CREATE OR REPLACE FUNCTION public.notify_visita_finalizada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'finalizado'
     AND NEW.cliente_id IS NOT NULL THEN

    INSERT INTO public.portal_notificacoes (cliente_id, titulo, mensagem, tipo)
    VALUES (
      NEW.cliente_id,
      'Visita técnica concluída',
      'Sua visita técnica foi finalizada. ' || COALESCE('Problema identificado: ' || NEW.problema_principal, 'Confira os detalhes no portal.'),
      'informativo'
    );

    -- If linked to a solicitation, advance its status
    IF NEW.solicitacao_id IS NOT NULL THEN
      UPDATE public.portal_solicitacoes
      SET status = 'aguardando_recomendacao', updated_at = now()
      WHERE id = NEW.solicitacao_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_visita_finalizada ON public.registros_consultor;
CREATE TRIGGER trg_notify_visita_finalizada
  AFTER UPDATE ON public.registros_consultor
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_visita_finalizada();

-- Auto-log audit entry when a check-in is created
CREATE OR REPLACE FUNCTION public.log_visita_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.visitas_logs (
    registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata
  ) VALUES (
    NEW.registro_consultor_id,
    NEW.solicitacao_id,
    'checkin_realizado',
    'Check-in (' || NEW.tipo_checkin || ') registrado',
    NEW.consultor_id,
    jsonb_build_object('lat', NEW.latitude, 'lng', NEW.longitude, 'precisao', NEW.precisao_gps)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_checkin ON public.visitas_checkin;
CREATE TRIGGER trg_log_checkin
  AFTER INSERT ON public.visitas_checkin
  FOR EACH ROW
  EXECUTE FUNCTION public.log_visita_checkin();