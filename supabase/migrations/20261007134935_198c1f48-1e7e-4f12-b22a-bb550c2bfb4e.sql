-- Canonical swzpzcwiasxmjutrmvkm. Technical projection, no parallel data store.
CREATE OR REPLACE FUNCTION platform_private.b2b_read_simulations(p_partner_id uuid DEFAULT NULL,p_simulation_id uuid DEFAULT NULL,p_items boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE u uuid:=auth.uid(); tech boolean; result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 tech:=public.has_role(u,'parceiro_b2b_tecnico');
 IF p_items THEN
  IF p_simulation_id IS NULL OR NOT platform_private.b2b_phase1_simulation_visible(p_simulation_id) THEN RAISE EXCEPTION 'scope_denied' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(CASE WHEN tech THEN to_jsonb(i)-ARRAY['valor_unitario_cheio','subtotal','preco_tabela_snapshot','preco_unitario','desconto_percentual'] ELSE to_jsonb(i) END ORDER BY i.created_at),'[]'::jsonb) INTO result FROM public.partner_simulation_items i WHERE i.simulation_id=p_simulation_id;
 ELSE
  SELECT coalesce(jsonb_agg((CASE WHEN tech THEN to_jsonb(s)-ARRAY['total_cheio'] ELSE to_jsonb(s) END)||jsonb_build_object('items_count',(SELECT count(*) FROM public.partner_simulation_items i WHERE i.simulation_id=s.id)) ORDER BY s.created_at DESC),'[]'::jsonb) INTO result
  FROM public.partner_simulations s WHERE (p_partner_id IS NULL OR s.partner_id=p_partner_id) AND (p_simulation_id IS NULL OR s.id=p_simulation_id)
   AND platform_private.b2b_phase1_simulation_visible(s.id)
   AND (tech OR public.is_platform_superadmin(u) OR public.has_role(u,'administrador') OR public.has_role(u,'gestor_comercial') OR public.has_role(u,'parceiro_b2b'));
 END IF;
 RETURN result;
END $f$;
CREATE OR REPLACE FUNCTION public.b2b_read_simulations(p_partner_id uuid DEFAULT NULL,p_simulation_id uuid DEFAULT NULL,p_items boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$ SELECT platform_private.b2b_read_simulations(p_partner_id,p_simulation_id,p_items); $f$;
REVOKE ALL ON FUNCTION public.b2b_read_simulations(uuid,uuid,boolean),platform_private.b2b_read_simulations(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.b2b_read_simulations(uuid,uuid,boolean),platform_private.b2b_read_simulations(uuid,uuid,boolean) TO authenticated,service_role;
DROP POLICY IF EXISTS b2b_technical_no_raw_prices ON public.partner_simulations;
CREATE POLICY b2b_technical_no_raw_prices ON public.partner_simulations AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(),'parceiro_b2b_tecnico'));
DROP POLICY IF EXISTS b2b_technical_no_raw_prices ON public.partner_simulation_items;
CREATE POLICY b2b_technical_no_raw_prices ON public.partner_simulation_items AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(),'parceiro_b2b_tecnico'));
CREATE OR REPLACE FUNCTION platform_private.b2b_save_technical_simulation(p_payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE u uuid:=auth.uid(); p uuid; s uuid; i jsonb; iid uuid; kind text; qty numeric; nm text; cl uuid;
BEGIN
 IF u IS NULL OR NOT public.has_role(u,'parceiro_b2b_tecnico') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 p:=(p_payload->>'partner_id')::uuid;
 IF NOT platform_private.b2b_phase1_partner_visible(p,true) THEN RAISE EXCEPTION 'scope_denied' USING ERRCODE='42501'; END IF;
 IF NOT public._saas_user_has_feature(u,'simulacoes') THEN RAISE EXCEPTION 'feature_not_entitled' USING ERRCODE='42501'; END IF;
 IF coalesce(p_payload->>'status','rascunho') NOT IN ('rascunho','enviada_gestor') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')=0 THEN RAISE EXCEPTION 'empty_simulation'; END IF;
 cl:=nullif(p_payload->>'cliente_id','')::uuid;
 IF cl IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cl AND c.organization_id=public.h15_actor_organization()) THEN RAISE EXCEPTION 'client_scope_denied' USING ERRCODE='42501'; END IF;
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
END $f$;
CREATE OR REPLACE FUNCTION public.b2b_save_technical_simulation(p_payload jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT platform_private.b2b_save_technical_simulation(p_payload); $f$;
REVOKE ALL ON FUNCTION public.b2b_save_technical_simulation(jsonb),platform_private.b2b_save_technical_simulation(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.b2b_save_technical_simulation(jsonb),platform_private.b2b_save_technical_simulation(jsonb) TO authenticated,service_role;
-- No historical values modified. Reversal removes projection policies/functions
-- after clients revert; exposes the proven technical price leak and is unsafe.
