
CREATE OR REPLACE FUNCTION public._comunicacao_expand_event(_event_id uuid, _event_key text, _source_type text, _source_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','extensions'
AS $function$
DECLARE
  v_rule public.comunicacao_regras%rowtype;
  v_tpl public.comunicacao_templates%rowtype;
  v_rec record; v_snapshot jsonb; v_payload_snapshot jsonb; v_idem_out text;
  v_enq int := 0; v_skp int := 0; v_row int := 0; v_target_role public.app_role;
BEGIN
  IF _event_key = 'administrative_important_update' THEN
    BEGIN v_target_role := (_payload->>'target_role')::public.app_role;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'target_role inválido'; END;
  END IF;
  FOR v_rule IN
    SELECT * FROM public.comunicacao_regras
     WHERE event_key = _event_key AND enabled = true
       AND (_event_key <> 'administrative_important_update'
            OR (estrategia='broadcast_role' AND perfil = v_target_role))
     ORDER BY prioridade ASC
  LOOP
    v_tpl := public._comunicacao_resolve_template(v_rule.template_chave, v_rule.canal, v_rule.template_versao);
    IF v_tpl.id IS NULL OR v_tpl.canal <> v_rule.canal THEN v_skp := v_skp+1; CONTINUE; END IF;
    v_snapshot := jsonb_build_object(
      'assunto', v_tpl.assunto, 'corpo', v_tpl.corpo,
      'variaveis', v_tpl.variaveis, 'canal', v_tpl.canal, 'locale', v_tpl.locale,
      'provider_template_name', v_tpl.provider_template_name,
      'language_code', v_tpl.language_code,
      'parameter_mapping', v_tpl.parameter_mapping,
      'provider_template_status', v_tpl.provider_template_status);
    FOR v_rec IN SELECT * FROM public._comunicacao_resolve_recipients_v2(_event_key, v_rule, _source_type, _source_id)
    LOOP
      IF NOT public._comunicacao_can_deliver(v_rec.recipient_user_id, v_rec.recipient_cliente_id, v_rule.canal) THEN
        v_skp := v_skp+1; CONTINUE; END IF;
      v_payload_snapshot := public._comunicacao_build_snapshot_v2(
        _event_key, _source_type, _source_id, _payload,
        v_rec.recipient_user_id, v_rec.recipient_cliente_id);
      v_idem_out := encode(extensions.digest(
        concat_ws('|', _event_id::text, v_rule.id::text, v_tpl.id::text,
          COALESCE(v_rec.recipient_user_id::text,''),
          COALESCE(v_rec.recipient_cliente_id::text,'')), 'sha256'),'hex');
      INSERT INTO public.comunicacao_outbox(
        event_id, rule_id, template_id, template_chave, template_versao,
        template_snapshot, canal, recipient_user_id, recipient_cliente_id,
        payload_snapshot, idempotency_key)
      VALUES (_event_id, v_rule.id, v_tpl.id, v_tpl.chave, v_tpl.versao,
        v_snapshot, v_rule.canal, v_rec.recipient_user_id, v_rec.recipient_cliente_id,
        v_payload_snapshot, v_idem_out)
      ON CONFLICT (idempotency_key) DO NOTHING;
      GET DIAGNOSTICS v_row = ROW_COUNT;
      IF v_row = 1 THEN v_enq := v_enq+1; ELSE v_skp := v_skp+1; END IF;
    END LOOP;
  END LOOP;
  UPDATE public.comunicacao_eventos
     SET status='processed', processed_at=now(),
         outbox_enqueued=v_enq, outbox_skipped=v_skp
   WHERE id = _event_id;
  RETURN jsonb_build_object('enqueued',v_enq,'skipped',v_skp);
END$function$;

REVOKE ALL ON FUNCTION public._comunicacao_expand_event(uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
