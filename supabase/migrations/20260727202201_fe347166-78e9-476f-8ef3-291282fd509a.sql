CREATE OR REPLACE FUNCTION public._comunicacao_trg_portal_solicitacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ev text;
  v_transition text;
  v_idem text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ev := 'solicitacao_criada';
    v_transition := 'insert';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_ev := CASE NEW.status
        WHEN 'atribuida' THEN 'solicitacao_atribuida'
        WHEN 'checkin_realizado' THEN 'solicitacao_checkin_realizado'
        WHEN 'em_visita' THEN 'solicitacao_em_visita'
        WHEN 'aguardando_os' THEN 'solicitacao_aguardando_os'
        WHEN 'concluida' THEN 'solicitacao_concluida'
        WHEN 'cancelada' THEN 'solicitacao_cancelada'
        ELSE NULL
      END;
      v_transition := 'status:' || COALESCE(NEW.status::text,'null');
    END IF;
  END IF;

  IF v_ev IS NOT NULL THEN
    v_idem := 'solicitacao:' || encode(
      extensions.digest(
        concat_ws('|', v_ev, NEW.id::text, v_transition, COALESCE(NEW.updated_at::text,'')),
        'sha256'
      ), 'hex'
    );
    v_payload := jsonb_build_object(
      'solicitacao_id', NEW.id,
      'cliente_id', NEW.cliente_id,
      'consultor_atribuido', NEW.consultor_atribuido,
      'status', NEW.status,
      'urgencia', NEW.urgencia,
      'tipo_demanda', NEW.tipo_demanda
    );
    PERFORM public._comunicacao_publish_system_event(
      v_ev, 'portal_solicitacoes', NEW.id, v_payload, v_idem
    );
  END IF;

  -- Escalada de urgência (independente da transição de status)
  IF (TG_OP = 'INSERT' AND NEW.urgencia = 'critica')
     OR (TG_OP = 'UPDATE' AND NEW.urgencia = 'critica' AND OLD.urgencia IS DISTINCT FROM 'critica') THEN
    v_idem := 'solicitacao:' || encode(
      extensions.digest(
        concat_ws('|', 'solicitacao_urgencia_critica', NEW.id::text, 'urgencia:critica',
                  COALESCE(NEW.updated_at::text,'')),
        'sha256'
      ), 'hex'
    );
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_urgencia_critica', 'portal_solicitacoes', NEW.id,
      jsonb_build_object(
        'solicitacao_id', NEW.id,
        'cliente_id', NEW.cliente_id,
        'consultor_atribuido', NEW.consultor_atribuido,
        'urgencia', NEW.urgencia,
        'tipo_demanda', NEW.tipo_demanda,
        'status', NEW.status
      ),
      v_idem
    );
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._comunicacao_trg_portal_solicitacao() FROM PUBLIC;