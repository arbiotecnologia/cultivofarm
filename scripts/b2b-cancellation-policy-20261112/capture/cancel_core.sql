CREATE OR REPLACE FUNCTION platform_private.b2b_financial_forecast_cancel_residual_v1(p_forecast uuid, p_expected_version integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE f platform_private.b2b_financial_forecasts;new_state text;
BEGIN
 IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_REASON_REQUIRED' USING ERRCODE='22023';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE id=p_forecast FOR UPDATE;
 IF NOT FOUND OR f.version<>p_expected_version THEN RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 IF f.state IN ('emissao_em_andamento','consulta_fiscal_obrigatoria','faturado_total','cancelado_antes_nf','cancelado_residual') THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
 new_state:=CASE WHEN f.residual_amount<f.total_amount THEN 'cancelado_residual' ELSE 'cancelado_antes_nf' END;
 UPDATE platform_private.b2b_financial_forecasts SET state=new_state,residual_amount=0,version=version+1,updated_at=now() WHERE id=f.id;
 INSERT INTO platform_private.b2b_financial_forecast_events(forecast_id,event_type,event_reference,payload)
 VALUES(f.id,'FORECAST_CANCELED',f.id::text||':'||(f.version+1)::text,jsonb_build_object('reason',p_reason,'previous_state',f.state));
 RETURN jsonb_build_object('forecast_id',f.id,'state',new_state,'version',f.version+1);
END$function$