-- ARQUIVO HISTÓRICO JÁ APLICADO PELO REVISOR: NÃO EXECUTAR/REAPLICAR.
-- Versões oficiais: 20261015161648 (lab+visita), 20261015162631 (hotfix12); ver applied-catalog-lab-20261015-manifest.json.
-- CANDIDATO 07 — NÃO APLICAR/PUBLICAR. Fase separada e revisável.
-- Laboratório: somente produtos familia_catalogo='biologico' e microrganismos.
-- Preserva históricos/estoque/entregas; protege apenas NOVAS entradas/conversões.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
  -- Hash live de 15/10/2026 após o hardening que inclui B2B_INTERNAL_DOWNSTREAM_UNVERIFIED.
  IF md5(pg_get_functiondef('public.generate_production_orders_from_partner(uuid)'::regprocedure)) <> 'ad584fa71bd7cc2bb00f4887e5b3706b' THEN RAISE EXCEPTION 'lab07_generate_orders_drift'; END IF;
  IF md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure)) <> '3e7479b964f0927a36442770c25e8562' THEN RAISE EXCEPTION 'lab07_programar_drift'; END IF;
  IF md5(pg_get_functiondef('public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)'::regprocedure)) <> '9abcfbc1fef46483179e5c03d1d11da3' THEN RAISE EXCEPTION 'lab07_lote_drift'; END IF;
  IF md5(pg_get_functiondef('public.rpc_planejamento_publicar_v1(uuid,text)'::regprocedure)) <> '6726b3f7fd2204d6b03f7ce4b40d1791' THEN RAISE EXCEPTION 'lab07_publicar_drift'; END IF;
  IF md5(pg_get_functiondef('public.publish_planning_to_lab(uuid)'::regprocedure)) <> '3b81cf570b4cabb5799257ac07ea44cd' THEN RAISE EXCEPTION 'lab07_publish_drift'; END IF;
  IF md5(pg_get_functiondef('public.trg_os_sync_partner_order_fn()'::regprocedure)) <> '6684080e5556c041e6709543ee7af8e0' THEN RAISE EXCEPTION 'lab07_mixed_sync_drift'; END IF;
END $$;

-- Autorização laboratorial focada: h15 prova ator ativo/readiness; owner comercial explícito.
-- b2b_phase1_partner_visible NÃO é mandato comercial: deriva organizations.partner_account_id.
-- Reutiliza invariantes de b2b_internal_assert_origin (owner/ativo/deleted/client), sem autorizar origem interna.
CREATE OR REPLACE FUNCTION platform_private.lab_partner_order_authorized(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $auth$
DECLARE v_uid uuid:=auth.uid(); v_org uuid;
BEGIN
 IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization();
 IF v_org IS NULL THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.partner_orders o JOIN public.partner_accounts p ON p.id=o.partner_id
 WHERE o.id=p_order_id AND p.commercial_owner_organization_id=v_org AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND (p.client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p.client_id AND c.organization_id=v_org)));
END $auth$;
REVOKE ALL ON FUNCTION platform_private.lab_partner_order_authorized(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION platform_private.lab_item_is_manufacturable(p_product_id uuid,p_microorganism_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE
    -- Duas referências na mesma linha são ambíguas e falham fechadas. Isso impede que
    -- um microrganismo válido transforme produto químico/fertilizante em fabricável.
    WHEN p_product_id IS NOT NULL AND p_microorganism_id IS NOT NULL THEN false
    WHEN p_product_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=p_product_id AND p.familia_catalogo='biologico')
    WHEN p_microorganism_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_microorganism_id)
    ELSE false END
$$;
REVOKE ALL ON FUNCTION platform_private.lab_item_is_manufacturable(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION platform_private.lab_assert_manufacturable(p_product_id uuid,p_microorganism_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT platform_private.lab_item_is_manufacturable(p_product_id,p_microorganism_id) THEN
    RAISE EXCEPTION 'LAB_ITEM_NOT_MANUFACTURABLE' USING ERRCODE='23514',
      HINT='Somente produtos biológicos e microrganismos podem gerar fabricação laboratorial.';
  END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.lab_assert_manufacturable(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Defesa em profundidade: só bloqueia INSERT ou mudança de referência; updates históricos irrelevantes passam.
CREATE FUNCTION platform_private.trg_lab_programming_biological_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
                    AND NEW.microrganismo_id IS NOT DISTINCT FROM OLD.microrganismo_id THEN RETURN NEW; END IF;
  PERFORM platform_private.lab_assert_manufacturable(NEW.produto_id,NEW.microrganismo_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_lab_programming_biological_only() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_lab_programming_biological_only BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id ON public.programacao_producao
FOR EACH ROW EXECUTE FUNCTION platform_private.trg_lab_programming_biological_only();

CREATE FUNCTION platform_private.trg_lab_lot_biological_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
                    AND NEW.microrganismo_id IS NOT DISTINCT FROM OLD.microrganismo_id THEN RETURN NEW; END IF;
  PERFORM platform_private.lab_assert_manufacturable(NEW.produto_id,NEW.microrganismo_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_lab_lot_biological_only() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_lab_lot_biological_only BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id ON public.lotes
FOR EACH ROW EXECUTE FUNCTION platform_private.trg_lab_lot_biological_only();

-- Auto-OS / conversão de visita: barreira no destino, antes de inserir qualquer OS.
-- Nenhuma alteração de recomendações/solicitações, estoque, entrega ou classificação histórica.
CREATE FUNCTION platform_private.trg_lab_os_biological_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
    AND NEW.microrganismo_id IS NOT DISTINCT FROM OLD.microrganismo_id THEN RETURN NEW; END IF;
  PERFORM platform_private.lab_assert_manufacturable(NEW.produto_id,NEW.microrganismo_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_lab_os_biological_only() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_lab_os_biological_only BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id
 ON public.ordens_servico FOR EACH ROW EXECUTE FUNCTION platform_private.trg_lab_os_biological_only();
CREATE TRIGGER trg_lab_onfarm_biological_only BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id
 ON public.ordens_servico_onfarm FOR EACH ROW EXECUTE FUNCTION platform_private.trg_lab_os_biological_only();

CREATE OR REPLACE FUNCTION public.generate_production_orders_from_partner(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planning_id uuid;
  v_partner_id uuid;
  v_order_numero text;
  v_order_status text;
  v_ready boolean;
  v_partner_nome text;
  v_grp RECORD;
  v_item RECORD;
  v_os_id uuid;
  v_numero text;
  v_count int := 0;
  v_nonlab_count int := 0;
  v_uid uuid := auth.uid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_anchor_item_id uuid;
BEGIN
 IF NOT platform_private.lab_partner_order_authorized(p_partner_order_id) THEN
  RAISE EXCEPTION 'LAB_PARTNER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;

  -- H5-B01: serializa geração concorrente por pedido (idempotência de resultado)
  PERFORM pg_advisory_xact_lock(hashtext('generate_production_orders_from_partner:' || p_partner_order_id::text));

  SELECT po.partner_id, po.numero, po.status::text, po.ready_for_production
    INTO v_partner_id, v_order_numero, v_order_status, v_ready
  FROM public.partner_orders po
  WHERE po.id = p_partner_order_id;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Pedido B2B não encontrado';
  END IF;

  IF v_order_status IN ('cancelado','reprovado','faturado','entregue') THEN
    RAISE EXCEPTION 'Pedido B2B não pode gerar produção (status: %)', v_order_status;
  END IF;

  -- Fase 7: bloqueia produção enquanto aprovação financeira exigida está pendente/rejeitada
   IF EXISTS (
     SELECT 1 FROM public.partner_orders po2
     WHERE po2.id = p_partner_order_id
       AND po2.requires_financial_approval = true
       AND po2.financial_approval_status IN ('pending','rejected')
   ) THEN
     RAISE EXCEPTION 'financial_approval_required_before_production';
   END IF;

   IF v_order_status <> 'aprovado' OR v_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'Pedido B2B ainda não está aprovado para produção.';
  END IF;

  SELECT id INTO v_planning_id FROM public.production_planning WHERE partner_order_id = p_partner_order_id;
  IF v_planning_id IS NULL THEN
    RAISE EXCEPTION 'Planejamento não encontrado para o pedido %', p_partner_order_id;
  END IF;

  SELECT COALESCE(nome_fantasia, razao_social) INTO v_partner_nome FROM public.partner_accounts WHERE id = v_partner_id;

  SELECT count(*) INTO v_nonlab_count FROM public.partner_order_items poi
   WHERE poi.order_id=p_partner_order_id
     AND NOT platform_private.lab_item_is_manufacturable(poi.product_id,poi.microrganismo_id);

  FOR v_grp IN
    WITH itens AS (
      SELECT poi.id,
             poi.product_id,
             poi.quantidade,
             COALESCE(poi.unidade_medida,'unidade') AS unidade_medida,
             poi.preco_tabela_snapshot,
             poi.preco_unitario,
             poi.produto_nome_snapshot,
             poi.produto_codigo_snapshot,
             poi.created_at,
             cv.volume_ml AS vasilhame_volume_ml
      FROM public.partner_order_items poi
      LEFT JOIN LATERAL (
        SELECT cv2.volume_ml
          FROM public.catalogo_volumes cv2
         WHERE cv2.item_tipo = 'produto'
           AND cv2.produto_id = poi.product_id
           AND cv2.ativo = true
         ORDER BY (cv2.preco_brl = COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) DESC,
                  ABS(cv2.preco_brl - COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) ASC
         LIMIT 1
      ) cv ON true
      WHERE poi.order_id = p_partner_order_id
        AND poi.product_id IS NOT NULL
        AND platform_private.lab_item_is_manufacturable(poi.product_id,poi.microrganismo_id)
        AND COALESCE(poi.unidade_medida,'unidade') <> 'hectare'
        AND NOT EXISTS (
          SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id
        )
    )
    SELECT product_id,
           MIN(produto_nome_snapshot) AS produto_nome,
           MIN(produto_codigo_snapshot) AS produto_codigo,
           SUM(
             CASE unidade_medida
               WHEN 'ml'    THEN quantidade
               WHEN 'litro' THEN quantidade * 1000
               WHEN 'unidade' THEN quantidade * vasilhame_volume_ml
               WHEN 'dose'    THEN quantidade * vasilhame_volume_ml
               ELSE NULL
             END
           ) AS volume_total_ml,
           bool_or(
             unidade_medida IN ('unidade','dose') AND vasilhame_volume_ml IS NULL
           ) AS faltou_vasilhame,
           array_agg(id ORDER BY created_at, id) AS item_ids,
           (array_agg(id ORDER BY created_at, id))[1] AS anchor_id
    FROM itens
    GROUP BY product_id
  LOOP
    IF v_grp.faltou_vasilhame THEN
      RAISE EXCEPTION 'Produto % (%) está em unidade/dose mas não tem vasilhame ativo no catálogo. Configure o vasilhame antes de gerar produção.',
        COALESCE(v_grp.produto_nome,'?'), COALESCE(v_grp.produto_codigo,'?');
    END IF;

    IF v_grp.volume_total_ml IS NULL OR v_grp.volume_total_ml <= 0 THEN
      RAISE EXCEPTION 'Não foi possível calcular o volume do produto % (%).',
        COALESCE(v_grp.produto_nome,'?'), COALESCE(v_grp.produto_codigo,'?');
    END IF;

    v_anchor_item_id := v_grp.anchor_id;
    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_grp.product_id, v_grp.volume_total_ml, NULL,
      'media','aprovada','produto', v_numero,
      p_partner_order_id, v_anchor_item_id, 'b2b'
    ) RETURNING id INTO v_os_id;

    INSERT INTO public.production_order_link (
      partner_order_id, partner_order_item_id, planning_id, ordem_servico_id, created_by
    )
    SELECT p_partner_order_id, unnest(v_grp.item_ids), v_planning_id, v_os_id, v_uid;

    v_ids := array_append(v_ids, v_os_id);
    v_count := v_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT poi.* FROM public.partner_order_items poi
    WHERE poi.order_id = p_partner_order_id
      AND platform_private.lab_item_is_manufacturable(poi.product_id,poi.microrganismo_id)
      AND NOT EXISTS (SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id)
      AND (
        poi.product_id IS NULL
        OR COALESCE(poi.unidade_medida,'unidade') = 'hectare'
      )
  LOOP
    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, microrganismo_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_item.product_id, v_item.microrganismo_id, NULL,
      CASE WHEN COALESCE(v_item.unidade_medida,'unidade') = 'hectare' THEN v_item.quantidade ELSE NULL END,
      'media','aprovada',
      CASE WHEN v_item.product_id IS NULL THEN 'microrganismo' ELSE 'produto' END,
      v_numero,
      p_partner_order_id, v_item.id, 'b2b'
    ) RETURNING id INTO v_os_id;

    INSERT INTO public.production_order_link (
      partner_order_id, partner_order_item_id, planning_id, ordem_servico_id, created_by
    ) VALUES (p_partner_order_id, v_item.id, v_planning_id, v_os_id, v_uid);

    v_ids := array_append(v_ids, v_os_id);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'os_created', 0, 'planning_id', v_planning_id,
                              'non_lab_items',v_nonlab_count, 'message', 'Nenhuma nova OS biológica gerada; itens não laboratoriais permanecem no pedido.');
  END IF;

  UPDATE public.production_planning
     SET status = 'planejado', updated_at = now()
   WHERE id = v_planning_id AND status = 'aguardando_planejamento';

  INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
  VALUES (p_partner_order_id, 'op_gerada', v_uid, jsonb_build_object('os_count', v_count, 'planning_id', v_planning_id));

  INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (
    p_partner_order_id, v_partner_id, v_uid, 'op_gerada',
    jsonb_build_object(
      'planning_id', v_planning_id,
      'os_count', v_count,
      'ordens_servico_ids', to_jsonb(v_ids),
      'created_at', now()
    )
  );

  RETURN jsonb_build_object('ok', true, 'os_created', v_count, 'planning_id', v_planning_id, 'ordens_servico_ids', to_jsonb(v_ids), 'non_lab_items',v_nonlab_count);
END
$function$;

CREATE OR REPLACE FUNCTION public.publish_planning_to_lab(p_planning_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pl public.production_planning%ROWTYPE;
  v_result jsonb;
  v_count int;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_pl FROM public.production_planning WHERE id = p_planning_id FOR UPDATE;
  IF v_pl.id IS NULL THEN RAISE EXCEPTION 'planning_not_found'; END IF;

  IF v_pl.status IN ('em_producao','produzido','entregue') THEN
    RAISE EXCEPTION 'already_published';
  END IF;

  IF v_pl.planned_start_date IS NOT NULL AND v_pl.planned_finish_date IS NOT NULL
     AND v_pl.planned_finish_date < v_pl.planned_start_date THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;

  PERFORM public._validate_planning_integrity(v_pl.partner_order_id);

  v_result := public.generate_production_orders_from_partner(v_pl.partner_order_id);
  v_count := COALESCE((v_result->>'os_created')::int, 0);

  IF v_count = 0 AND NOT EXISTS (
    SELECT 1 FROM public.production_order_link WHERE planning_id = v_pl.id
  ) THEN
    RAISE EXCEPTION 'LAB_NO_MANUFACTURABLE_ITEMS' USING ERRCODE='23514', HINT='Químicos e fertilizantes permanecem no catálogo e nas solicitações, sem fabricação.';
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, acao, etapa_nova, usuario_id, observacao)
  SELECT os.id, COALESCE(os.origem,'b2b'), 'demanda_publicada', 'recebido_no_lab', v_uid,
         'Planejamento publicado no Cockpit'
  FROM public.ordens_servico os
  WHERE os.partner_order_id = v_pl.partner_order_id
    AND platform_private.lab_item_is_manufacturable(os.produto_id,os.microrganismo_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.laboratorio_esteira_eventos e
      WHERE e.os_id = os.id AND e.acao = 'demanda_publicada'
    );

  -- Advance OS status aprovada -> programada so the treadmill transitions are valid.
  UPDATE public.ordens_servico
     SET status = 'programada'
   WHERE partner_order_id = v_pl.partner_order_id
     AND status::text = 'aprovada'
     AND platform_private.lab_item_is_manufacturable(produto_id,microrganismo_id);

  UPDATE public.production_planning
     SET status = 'planejado', updated_at = now()
   WHERE id = v_pl.id AND status IN ('aguardando_planejamento','replanejar');

  INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
  VALUES (v_pl.partner_order_id, 'planejamento_publicado', v_uid,
          jsonb_build_object('planning_id', v_pl.id, 'os_created', v_count));

  INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_pl.partner_order_id, v_pl.partner_id, v_uid, 'planejamento_publicado',
          jsonb_build_object('planning_id', v_pl.id, 'os_created', v_count));

  PERFORM public.refresh_esteira_laboratorio();

  RETURN jsonb_build_object('ok', true, 'planning_id', v_pl.id, 'os_created', v_count,'non_lab_items',v_result->'non_lab_items');
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_programar_os_v1(p_os_id uuid,p_origem text,p_data_programada date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_user_id uuid; v_role text; v_status text; v_status_inicial text; v_onfarm boolean;
 v_product uuid; v_micro uuid;
BEGIN
 v_user_id:=auth.uid();
 IF v_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'message','Não autenticado'); END IF;
 SELECT role::text INTO v_role FROM public.user_roles WHERE user_id=v_user_id
 AND role IN ('administrador','gestor','producao','administrativo') LIMIT 1;
 IF v_role IS NULL THEN RETURN jsonb_build_object('success',false,'message','Seu perfil não possui permissão para programar ordens de serviço.'); END IF;
 IF p_origem IN ('manual','b2b') THEN
  v_onfarm:=false;
  SELECT status::text,produto_id,microrganismo_id INTO v_status,v_product,v_micro
   FROM public.ordens_servico WHERE id=p_os_id FOR UPDATE;
 ELSIF p_origem='onfarm' THEN
  v_onfarm:=true;
  SELECT status::text,produto_id,microrganismo_id INTO v_status,v_product,v_micro
   FROM public.ordens_servico_onfarm WHERE id=p_os_id FOR UPDATE;
 ELSE RETURN jsonb_build_object('success',false,'message','Origem de OS inválida: '||coalesce(p_origem,'null')); END IF;
 IF v_status IS NULL THEN RETURN jsonb_build_object('success',false,'message','Ordem de serviço não encontrada.'); END IF;
 v_status_inicial:=v_status;
 IF v_status IN ('finalizada','cancelada') THEN RETURN jsonb_build_object('success',false,'message','Operação não permitida: OS já está '||v_status); END IF;
 IF v_status NOT IN ('aberta','aprovada','programada') THEN RETURN jsonb_build_object('success',false,'status',v_status,'message','OS já avançou além da programação. Status atual: '||v_status); END IF;
 -- Já programada: alteração de data não reclassifica nem refabrica histórico.
 IF v_status<>'programada' AND NOT platform_private.lab_item_is_manufacturable(v_product,v_micro) THEN
  RETURN jsonb_build_object('success',false,'message','Somente produtos biológicos e microrganismos podem gerar fabricação laboratorial.'); END IF;
 IF v_status='aberta' THEN
  IF v_onfarm THEN UPDATE public.ordens_servico_onfarm SET status='aprovada' WHERE id=p_os_id;
  ELSE UPDATE public.ordens_servico SET status='aprovada' WHERE id=p_os_id; END IF;
  v_status:='aprovada';
 END IF;
 IF v_status='aprovada' THEN
  IF v_onfarm THEN UPDATE public.ordens_servico_onfarm SET status='programada' WHERE id=p_os_id;
  ELSE UPDATE public.ordens_servico SET status='programada' WHERE id=p_os_id; END IF;
  v_status:='programada';
 END IF;
 IF p_data_programada IS NOT NULL THEN
  IF v_onfarm THEN UPDATE public.programacao_producao SET data_programada=p_data_programada WHERE ordem_servico_onfarm_id=p_os_id;
  ELSE
   UPDATE public.ordens_servico SET data_programada=p_data_programada WHERE id=p_os_id;
   UPDATE public.programacao_producao SET data_programada=p_data_programada WHERE ordem_servico_id=p_os_id;
  END IF;
 END IF;
 INSERT INTO public.laboratorio_esteira_eventos(os_id,origem_os,etapa_anterior,etapa_nova,acao,usuario_id,observacao)
 VALUES(p_os_id,p_origem,v_status_inicial,v_status,'programar_os',v_user_id,
 CASE WHEN p_data_programada IS NULL THEN NULL ELSE 'data_programada='||p_data_programada::text END);
 PERFORM public.refresh_esteira_laboratorio();
 RETURN jsonb_build_object('success',true,'status',v_status,'message',CASE WHEN v_status_inicial='programada' THEN 'Programação atualizada' ELSE 'OS programada com sucesso' END);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_planejamento_publicar_v1(p_planning_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid:=auth.uid(); v_pl public.production_planning%ROWTYPE;
 v_prev public.production_planning_publications%ROWTYPE; v_result jsonb; v_count int;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'nao_autenticado' USING ERRCODE='42501'; END IF;
 IF NOT(public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501'; END IF;
 IF p_planning_id IS NULL THEN RAISE EXCEPTION 'planejamento_invalido' USING ERRCODE='22023'; END IF;
 IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key))<8 THEN RAISE EXCEPTION 'chave_idempotencia_obrigatoria' USING ERRCODE='22023'; END IF;
 -- Nunca devolver recibo de origem interna bloqueada, nem em replay.
 -- Escopo antes de status/recibo: ID inexistente e cross-tenant dão a mesma negação.
 IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION 'LAB_PARTNER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT pl.* INTO v_pl FROM public.production_planning pl
 WHERE pl.id=p_planning_id AND platform_private.lab_partner_order_authorized(pl.partner_order_id) FOR UPDATE;
 IF v_pl.id IS NULL THEN RAISE EXCEPTION 'LAB_PARTNER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=v_pl.partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('planejamento_publicar:'||p_planning_id::text));
 SELECT * INTO v_prev FROM public.production_planning_publications WHERE idempotency_key=btrim(p_idempotency_key);
 IF FOUND THEN
  IF v_prev.planning_id<>p_planning_id THEN RAISE EXCEPTION 'chave_idempotencia_conflitante' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('ok',true,'replay',true,'planning_id',v_prev.planning_id,'os_created',v_prev.os_created,'resultado',v_prev.resultado);
 END IF;
 SELECT * INTO v_prev FROM public.production_planning_publications WHERE planning_id=p_planning_id;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'replay',true,'planning_id',v_prev.planning_id,'os_created',v_prev.os_created,'resultado',v_prev.resultado); END IF;
 v_result:=public.publish_planning_to_lab(p_planning_id); v_count:=coalesce((v_result->>'os_created')::int,0);
 INSERT INTO public.production_planning_publications(planning_id,partner_order_id,idempotency_key,os_created,resultado,performed_by)
 VALUES(p_planning_id,v_pl.partner_order_id,btrim(p_idempotency_key),v_count,v_result,v_uid);
 RETURN jsonb_build_object('ok',true,'replay',false,'planning_id',p_planning_id,'os_created',v_count,'resultado',v_result);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_cockpit_gerar_lote_v1(p_programacao_id uuid,p_os_id uuid,p_origem text,p_lote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_uid uuid:=auth.uid(); v_origem text; v_prog record; v_existente record;
 v_id uuid; v_codigo text; v_volume numeric; v_tentativa int:=0; v_constraint text; v_indexdef text;
BEGIN
 v_origem:=public.fn_cockpit_assert_operador_origem(p_origem);
 IF p_programacao_id IS NULL OR p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_PARAMS_INVALIDOS'; END IF;
 IF p_lote IS NULL OR jsonb_typeof(p_lote)<>'object' THEN RAISE EXCEPTION 'COCKPIT_LOTE_PAYLOAD_INVALIDO'; END IF;
 IF nullif(p_lote->>'codigo_lote','') IS NOT NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_CODIGO_NAO_ACEITO'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('cockpit_lote:'||p_programacao_id::text));
 SELECT id,ordem_servico_id,ordem_servico_onfarm_id,produto_id,microrganismo_id INTO v_prog
 FROM public.programacao_producao WHERE id=p_programacao_id FOR UPDATE;
 IF v_prog.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_PROGRAMACAO_NAO_ENCONTRADA'; END IF;
 IF v_prog.ordem_servico_id IS NOT NULL AND v_prog.ordem_servico_onfarm_id IS NOT NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_AMBIGUO'; END IF;
 IF v_origem='onfarm' THEN
  IF v_prog.ordem_servico_id IS NOT NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_AMBIGUO'; END IF;
  IF v_prog.ordem_servico_onfarm_id IS DISTINCT FROM p_os_id THEN RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_INVALIDO'; END IF;
 ELSE
  IF v_prog.ordem_servico_onfarm_id IS NOT NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_AMBIGUO'; END IF;
  IF v_prog.ordem_servico_id IS DISTINCT FROM p_os_id THEN RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_INVALIDO'; END IF;
 END IF;
 -- Replay histórico não fabrica de novo; referências e origem já foram validadas.
 SELECT id,codigo_lote INTO v_existente FROM public.lotes WHERE programacao_id=p_programacao_id LIMIT 1;
 IF v_existente.id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'replay',true,'lote_id',v_existente.id,'codigo_lote',v_existente.codigo_lote,'message',format('Lote %s ja existe para esta programacao.',v_existente.codigo_lote)); END IF;
 IF v_prog.produto_id IS NULL AND v_prog.microrganismo_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_ITEM_CANONICO_AUSENTE'; END IF;
 PERFORM platform_private.lab_assert_manufacturable(v_prog.produto_id,v_prog.microrganismo_id);
 BEGIN v_volume:=nullif(p_lote->>'volume_produzido','')::numeric;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'COCKPIT_LOTE_VOLUME_INVALIDO'; END;
 IF v_volume IS NULL OR NOT(v_volume>0) OR v_volume::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'COCKPIT_LOTE_VOLUME_INVALIDO'; END IF;
 LOOP
  v_tentativa:=v_tentativa+1; v_codigo:=public.gerar_codigo_lote(EXTRACT(YEAR FROM now())::int);
  BEGIN
   INSERT INTO public.lotes(programacao_id,codigo_lote,produto_id,microrganismo_id,volume_produzido,data_producao,responsavel_producao,tanque,observacoes_tecnicas)
   VALUES(p_programacao_id,v_codigo,v_prog.produto_id,v_prog.microrganismo_id,v_volume,
    coalesce(nullif(p_lote->>'data_producao','')::date,CURRENT_DATE),nullif(p_lote->>'responsavel_producao',''),nullif(p_lote->>'tanque',''),nullif(p_lote->>'observacoes_tecnicas','')) RETURNING id INTO v_id;
   EXIT;
  EXCEPTION WHEN unique_violation THEN
   GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
   SELECT pg_get_indexdef(c.oid) INTO v_indexdef FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=v_constraint AND c.relkind='i';
   IF v_indexdef IS NOT NULL AND v_indexdef LIKE '%(programacao_id)%' THEN
    SELECT id,codigo_lote INTO v_existente FROM public.lotes WHERE programacao_id=p_programacao_id LIMIT 1;
    IF v_existente.id IS NULL THEN RAISE; END IF;
    RETURN jsonb_build_object('success',true,'replay',true,'lote_id',v_existente.id,'codigo_lote',v_existente.codigo_lote,'message',format('Lote %s ja existe para esta programacao.',v_existente.codigo_lote));
   ELSIF v_indexdef IS NOT NULL AND v_indexdef LIKE '%(codigo_lote)%' THEN
    IF v_tentativa>=3 THEN RAISE EXCEPTION 'COCKPIT_LOTE_CODIGO_CONFLITO'; END IF;
   ELSE RAISE; END IF;
  END;
 END LOOP;
 INSERT INTO public.laboratorio_esteira_eventos(os_id,origem_os,programacao_id,lote_id,etapa_nova,acao,usuario_id,observacao)
 VALUES(p_os_id,v_origem,p_programacao_id,v_id,'lote_gerado','gerar_lote',v_uid,format('Lote %s gerado (codigo canonico do servidor).',v_codigo));
 RETURN jsonb_build_object('success',true,'replay',false,'lote_id',v_id,'codigo_lote',v_codigo,'message',format('Lote %s gerado com sucesso.',v_codigo));
END $function$;

CREATE OR REPLACE FUNCTION public.trg_os_sync_partner_order_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_partner_order_id uuid; v_total int; v_done int; v_in_prod int;
 v_new_status public.partner_order_status; v_old_status public.partner_order_status; v_nonlab int;
BEGIN
 v_partner_order_id:=coalesce(NEW.partner_order_id,OLD.partner_order_id);
 IF v_partner_order_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT count(*),count(*) FILTER(WHERE status IN ('pronto_entrega','entregue','finalizada')),
 count(*) FILTER(WHERE status IN ('em_producao','em_cq','envase','programada')) INTO v_total,v_done,v_in_prod
 FROM public.ordens_servico WHERE partner_order_id=v_partner_order_id;
 SELECT count(*) INTO v_nonlab FROM public.partner_order_items i WHERE i.order_id=v_partner_order_id
 AND NOT platform_private.lab_item_is_manufacturable(i.product_id,i.microrganismo_id);
 SELECT status INTO v_old_status FROM public.partner_orders WHERE id=v_partner_order_id;
 IF v_total>0 AND v_done=v_total AND v_nonlab=0 THEN v_new_status:='produzido';
 ELSIF v_in_prod>0 THEN v_new_status:='em_producao';
 ELSE v_new_status:=v_old_status; END IF;
 -- Pedido misto nunca é declarado integralmente produzido apenas por conclusão das OS biológicas.
 IF v_new_status IS DISTINCT FROM v_old_status THEN
  UPDATE public.partner_orders SET status=v_new_status,updated_at=now() WHERE id=v_partner_order_id;
  UPDATE public.production_planning SET status=v_new_status::text::public.production_planning_status,updated_at=now() WHERE partner_order_id=v_partner_order_id;
  INSERT INTO public.production_timeline_events(partner_order_id,event_type,meta) VALUES(v_partner_order_id,
  CASE WHEN v_new_status='produzido' THEN 'producao_finalizada' ELSE 'producao_iniciada' END,jsonb_build_object('from',v_old_status,'to',v_new_status));
 END IF;
 RETURN NEW;
END $function$;

-- CREATE OR REPLACE mantém ACL anteriores. Não reabrir EXECUTE dos RPCs operacionais fechados.
-- NO-GO hospedado até revisão e provas independentes; nenhuma reclassificação/backfill ou estoque alterado.
COMMIT;
