CREATE OR REPLACE FUNCTION platform_private.b2b_save_technical_simulation(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); p uuid; s uuid; i jsonb; iid uuid; kind text; qty numeric; nm text; cl uuid;
BEGIN
 IF u IS NULL OR NOT public.has_role(u,'parceiro_b2b_tecnico') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 p:=(p_payload->>'partner_id')::uuid;
 IF NOT platform_private.b2b_phase1_partner_visible(p,true) THEN RAISE EXCEPTION 'scope_denied' USING ERRCODE='42501'; END IF;
 IF NOT public._saas_user_has_feature(u,'simulacoes') THEN RAISE EXCEPTION 'feature_not_entitled' USING ERRCODE='42501'; END IF;
 IF coalesce(p_payload->>'status','rascunho') NOT IN ('rascunho','enviada_gestor') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')=0 THEN RAISE EXCEPTION 'empty_simulation'; END IF;
 cl:=nullif(p_payload->>'cliente_id','')::uuid;
 IF cl IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM public.partner_user_clients puc WHERE puc.cliente_id=cl AND puc.user_id=u AND puc.partner_id=p AND puc.active=true) OR EXISTS (SELECT 1 FROM public.partner_technician_clients ptc WHERE ptc.cliente_id=cl AND ptc.technician_user_id=u AND ptc.partner_id=p AND ptc.active=true)) THEN RAISE EXCEPTION 'client_scope_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.partner_simulations(partner_id,created_by,titulo,observacoes,cultura,area_total_ha,objetivo_tecnico,status,total_cheio,valid_until,cliente_id)
 VALUES(p,u,left(p_payload->>'titulo',200),left(p_payload->>'observacoes',4000),left(p_payload->>'cultura',200),(p_payload->>'area_total_ha')::numeric,left(p_payload->>'objetivo_tecnico',2000),'rascunho',0,(p_payload->>'valid_until')::date,cl) RETURNING id INTO s;
 FOR i IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
  iid:=(i->>'item_id')::uuid; kind:=i->>'item_tipo'; qty:=(i->>'quantidade')::numeric;
  IF qty IS NULL OR qty<=0 OR qty::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_qty'; END IF;
  IF kind='produto' THEN SELECT nome INTO nm FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled;
  ELSIF kind='microrganismo' THEN SELECT nome INTO nm FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled;
  ELSE RAISE EXCEPTION 'invalid_item'; END IF;
  IF nm IS NULL THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF coalesce(i->>'unidade_medida','hectare') NOT IN ('hectare','litro','dose','unidade') THEN RAISE EXCEPTION 'invalid_unit'; END IF;
  IF i->>'unidade_medida'='unidade' AND coalesce((i->>'volume_ml')::numeric,0)<=0 THEN RAISE EXCEPTION 'invalid_volume'; END IF;
  INSERT INTO public.partner_simulation_items(simulation_id,item_tipo,item_id,nome,quantidade,valor_unitario_cheio,subtotal,unidade_medida,volume_ml,area_ha)
  VALUES(s,kind,iid,nm,qty,0,0,coalesce(i->>'unidade_medida','hectare'),(i->>'volume_ml')::numeric,(i->>'area_ha')::numeric);
 END LOOP;
 IF p_payload->>'status'='enviada_gestor' THEN PERFORM public.send_partner_simulation_to_manager_secure(s); END IF;
 RETURN s;
END $function$;
