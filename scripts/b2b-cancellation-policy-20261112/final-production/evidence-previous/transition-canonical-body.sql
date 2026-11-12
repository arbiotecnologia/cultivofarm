CREATE OR REPLACE FUNCTION platform_private.b2b_financial_forecast_transition_v1(p_forecast uuid, p_expected_version integer, p_event text, p_reference text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE f platform_private.b2b_financial_forecasts;new_state text;existing platform_private.b2b_financial_forecast_events;event_ref text;
BEGIN
 IF p_reference IS NULL OR btrim(p_reference)='' OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
  RAISE EXCEPTION 'B2B_FORECAST_EVENT_INVALID' USING ERRCODE='22023';END IF;
 IF coalesce(p_payload->>'attempt','1')!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION 'B2B_FORECAST_ATTEMPT_INVALID' USING ERRCODE='22023';END IF;
 -- Replay key is per source transmission when present (attempt-199: constant attempt
 -- collided across two cycles of one invoice); reference stays the intent invoice.
 event_ref:=p_reference||':'||coalesce(nullif(p_payload->>'transmission_id',''),nullif(p_payload->>'attempt',''),'1');
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE id=p_forecast FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO existing FROM platform_private.b2b_financial_forecast_events WHERE forecast_id=p_forecast AND event_type=p_event AND event_reference=event_ref;
 IF FOUND THEN
  IF existing.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'B2B_FORECAST_REPLAY_DIVERGENCE' USING ERRCODE='PT409';END IF;
  RETURN jsonb_build_object('forecast_id',p_forecast,'state',f.state,'version',f.version,'replayed',true);END IF;
 IF f.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_event='EMISSION_STARTED' THEN
  IF f.residual_amount<=0 OR f.state NOT IN ('aguardando_fiscal','emissao_em_andamento','faturado_parcial') THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF f.state='emissao_em_andamento' AND f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_INTENT_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='emissao_em_andamento';
 ELSIF p_event IN ('EMISSION_FAILED','EMISSION_REJECTED') THEN
  IF f.state<>'emissao_em_andamento' OR f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='aguardando_fiscal';
 ELSIF p_event='EMISSION_TIMEOUT' THEN
  IF f.state<>'emissao_em_andamento' OR f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='consulta_fiscal_obrigatoria';
 ELSIF p_event='CONSULTATION_NOT_AUTHORIZED' THEN
  IF f.state<>'consulta_fiscal_obrigatoria' OR f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='aguardando_fiscal';
 ELSE RAISE EXCEPTION 'B2B_FORECAST_EVENT_INVALID' USING ERRCODE='22023';END IF;
 UPDATE platform_private.b2b_financial_forecasts SET state=new_state,fiscal_intent_id=CASE WHEN p_event='EMISSION_STARTED' THEN p_reference::uuid ELSE fiscal_intent_id END,
  last_error_code=CASE WHEN p_event IN ('EMISSION_FAILED','EMISSION_REJECTED','EMISSION_TIMEOUT') THEN nullif(p_payload->>'error_code','') ELSE NULL END,
  version=version+1,updated_at=now() WHERE id=f.id;
 INSERT INTO platform_private.b2b_financial_forecast_events(forecast_id,event_type,event_reference,payload) VALUES(f.id,p_event,event_ref,p_payload);
 RETURN jsonb_build_object('forecast_id',f.id,'state',new_state,'version',f.version+1,'replayed',false);
END$function$