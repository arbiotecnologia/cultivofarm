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
  v_status_ant text;
  v_status_novo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ev := 'solicitacao_criada';
    v_transition := 'insert';
    v_status_ant := NULL;
    v_status_novo := NEW.status::text;
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
      v_status_ant := OLD.status::text;
      v_status_novo := NEW.status::text;
    END IF;
  END IF;

  IF v_ev IS NOT NULL THEN
    v_idem := 'solicitacao:' || encode(
      extensions.digest(
        concat_ws('|', v_ev, NEW.id::text, v_transition, COALESCE(NEW.updated_at::text,'')),
        'sha256'
      ), 'hex'
    );
    PERFORM public._comunicacao_publish_system_event(
      v_ev, 'portal_solicitacoes', NEW.id,
      jsonb_strip_nulls(jsonb_build_object(
        'solicitacao_id', NEW.id,
        'numero', NEW.numero,
        'cliente_id', NEW.cliente_id,
        'fazenda_id', NEW.fazenda_id,
        'tipo_demanda', NEW.tipo_demanda,
        'urgencia', NEW.urgencia,
        'status_anterior', v_status_ant,
        'status_novo', v_status_novo,
        'consultor_atribuido', NEW.consultor_atribuido,
        'ocorrido_em', COALESCE(NEW.updated_at, now()),
        'transicao', v_transition
      )),
      v_idem
    );
  END IF;

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
      jsonb_strip_nulls(jsonb_build_object(
        'solicitacao_id', NEW.id,
        'numero', NEW.numero,
        'cliente_id', NEW.cliente_id,
        'fazenda_id', NEW.fazenda_id,
        'tipo_demanda', NEW.tipo_demanda,
        'urgencia', NEW.urgencia,
        'status_novo', NEW.status::text,
        'consultor_atribuido', NEW.consultor_atribuido,
        'ocorrido_em', COALESCE(NEW.updated_at, now()),
        'transicao', 'urgencia:critica'
      )),
      v_idem
    );
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._comunicacao_trg_portal_solicitacao() FROM PUBLIC;