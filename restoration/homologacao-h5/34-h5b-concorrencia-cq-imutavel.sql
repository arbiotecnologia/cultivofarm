-- ============================================================
-- H5b — Correção focada dos bloqueios da auditoria independente
-- H5-B01: idempotência concorrente da geração de OS a partir de pedido B2B
-- H5-B02: serialização por lote na validação de volume de envase
-- H5-B03: imutabilidade de resultado final de Controle de Qualidade
-- Ambiente alvo: STAGING (ikaauvsflpmamgxmkhoq)
-- ============================================================

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
  v_uid uuid := auth.uid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_anchor_item_id uuid;
BEGIN
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

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
                              'message', 'Nenhuma nova OS gerada. Pedido já possui ordens vinculadas.');
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

  RETURN jsonb_build_object('ok', true, 'os_created', v_count, 'planning_id', v_planning_id, 'ordens_servico_ids', to_jsonb(v_ids));
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_validate_envase_volume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_produzido numeric;
  v_envasado numeric;
  v_novo numeric;
  v_codigo text;
  v_saldo numeric;
BEGIN
  IF NEW.quantidade IS NULL OR NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade do envase deve ser maior que zero.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.volume_por_unidade IS NULL OR NEW.volume_por_unidade <= 0 THEN
    RAISE EXCEPTION 'O volume por unidade deve ser maior que zero.' USING ERRCODE = 'check_violation';
  END IF;

  -- H5-B01/B02: serializa qualquer INSERT de envase (inclusive direto via RLS) pela linha do lote.
  -- Ordem de lock compatível com rpc_cockpit_registrar_envase_v1 (programacao -> lote).
  SELECT volume_produzido, codigo_lote INTO v_produzido, v_codigo
  FROM public.lotes WHERE id = NEW.lote_id FOR UPDATE;

  IF v_codigo IS NULL AND v_produzido IS NULL THEN
    RAISE EXCEPTION 'Lote % inexistente para envase.', NEW.lote_id USING ERRCODE = 'check_violation';
  END IF;

  IF v_produzido IS NULL OR v_produzido <= 0 THEN
    RAISE EXCEPTION 'O lote % não possui volume produzido informado. Registre a produção antes de envasar.', COALESCE(v_codigo,'(desconhecido)')
      USING ERRCODE = 'check_violation';
  END IF;

  v_envasado := public.lote_volume_envasado(NEW.lote_id);
  v_novo := COALESCE(NEW.volume_por_unidade,0) * COALESCE(NEW.quantidade,0);
  v_saldo := v_produzido - v_envasado;

  IF (v_envasado + v_novo) > v_produzido THEN
    RAISE EXCEPTION 'Envase excede o volume produzido do lote %. Produzido: % L, já envasado: % L, saldo disponível: % L, solicitado: % L.',
      COALESCE(v_codigo,'(desconhecido)'),
      ROUND(v_produzido/1000.0, 2),
      ROUND(v_envasado/1000.0, 2),
      ROUND(v_saldo/1000.0, 2),
      ROUND(v_novo/1000.0, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- H5-B03: imutabilidade de resultado final de CQ (histórico por linhas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_cq_resultado_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Escape controlado APENAS para limpeza de fixtures executada por papel
  -- de manutenção (nunca anon/authenticated, portanto inacessível ao app).
  IF COALESCE(current_setting('app.cq_purge_fixture', true), '') = 'on'
     AND current_user NOT IN ('anon','authenticated') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.resultado IS NOT NULL THEN
      RAISE EXCEPTION 'CQ_RESULTADO_FINAL_IMUTAVEL: análise % do lote % já possui resultado final (%) e não pode ser excluída. Registre uma nova análise (reanálise) para o mesmo lote.',
        OLD.id, OLD.lote_id, OLD.resultado USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- transição inicial (pendente -> resultado final) continua permitida
  IF OLD.resultado IS NULL THEN
    IF NEW.lote_id IS DISTINCT FROM OLD.lote_id THEN
      RAISE EXCEPTION 'CQ_LOTE_IMUTAVEL: não é permitido mover a análise de CQ para outro lote.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.resultado      IS DISTINCT FROM OLD.resultado
     OR NEW.lote_id        IS DISTINCT FROM OLD.lote_id
     OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
     OR NEW.responsavel    IS DISTINCT FROM OLD.responsavel
     OR NEW.data_analise   IS DISTINCT FROM OLD.data_analise
     OR NEW.created_at     IS DISTINCT FROM OLD.created_at
     OR NEW.seq            IS DISTINCT FROM OLD.seq
     OR NEW.ph             IS DISTINCT FROM OLD.ph
     OR NEW.aparencia      IS DISTINCT FROM OLD.aparencia
     OR NEW.odor           IS DISTINCT FROM OLD.odor
     OR NEW.concentracao   IS DISTINCT FROM OLD.concentracao
     OR NEW.contaminacao   IS DISTINCT FROM OLD.contaminacao
  THEN
    RAISE EXCEPTION 'CQ_RESULTADO_FINAL_IMUTAVEL: a análise % do lote % já foi finalizada (%). Registre uma NOVA análise (reanálise) para o mesmo lote em vez de sobrescrever o histórico.',
      OLD.id, OLD.lote_id, OLD.resultado USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_cq_resultado_imutavel() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_cq_resultado_imutavel ON public.controle_qualidade;
CREATE TRIGGER trg_cq_resultado_imutavel
BEFORE UPDATE OR DELETE ON public.controle_qualidade
FOR EACH ROW EXECUTE FUNCTION public.fn_cq_resultado_imutavel();
