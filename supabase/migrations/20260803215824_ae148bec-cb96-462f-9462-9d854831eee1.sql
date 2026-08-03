
CREATE OR REPLACE FUNCTION public.rpc_entrega_reconciliar_v1(p_entrega_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_e public.entregas%ROWTYPE;
  v_t public.entrega_termos%ROWTYPE;
  v_r public.entrega_reconciliacoes%ROWTYPE;
  v_total int := 0; v_ok int := 0; v_no int := 0; v_pend int := 0;
  v_qtd_ok numeric := 0; v_qtd_no numeric := 0;
  v_vol_ok numeric := 0; v_vol_no numeric := 0;
  v_ratio numeric := 0;
  v_fp text;
  v_item record;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE='insufficient_privilege';
  END IF;
  IF coalesce(trim(p_idempotency_key),'') = '' THEN RAISE EXCEPTION 'idempotency_key_obrigatoria'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_reconc:' || p_entrega_id::text, 0));

  SELECT * INTO v_e FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entrega_nao_encontrada'; END IF;
  IF v_e.status = 'cancelada' THEN RAISE EXCEPTION 'entrega_cancelada'; END IF;

  SELECT * INTO v_t FROM public.entrega_termos
   WHERE entrega_id = p_entrega_id AND status = 'assinado'
   ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_assinado'; END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE status='aceito')::int,
         count(*) FILTER (WHERE status='recusado')::int,
         count(*) FILTER (WHERE status='pendente')::int,
         coalesce(sum(quantidade) FILTER (WHERE status='aceito'),0),
         coalesce(sum(quantidade) FILTER (WHERE status='recusado'),0)
    INTO v_total, v_ok, v_no, v_pend, v_qtd_ok, v_qtd_no
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  IF v_total = 0 THEN RAISE EXCEPTION 'conferencia_ausente'; END IF;
  IF v_pend > 0 THEN RAISE EXCEPTION 'conferencia_pendente: % item(ns) sem decisao', v_pend; END IF;

  v_fp := encode(digest(
    v_t.snapshot_hash || '|' || v_total::text || '|' || v_ok::text || '|' || v_no::text
    || '|' || v_qtd_ok::text || '|' || v_qtd_no::text, 'sha256'), 'hex');

  SELECT * INTO v_r FROM public.entrega_reconciliacoes
   WHERE entrega_id = p_entrega_id AND status = 'reconciliada';
  IF FOUND THEN
    IF v_r.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'entrega_ja_reconciliada';
    END IF;
    IF v_r.request_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'idempotency_payload_mismatch';
    END IF;
    RETURN jsonb_build_object('success', true, 'replay', true,
      'reconciliacao_id', v_r.id, 'itens_aceitos', v_r.itens_aceitos,
      'itens_recusados', v_r.itens_recusados, 'faturavel', v_r.faturavel,
      'ratio_aceito', v_r.ratio_aceito);
  END IF;

  FOR v_item IN
    SELECT ci.id, ci.status, ci.quantidade, ci.motivo, ci.etiqueta_id, ci.embalagem_id
      FROM public.entrega_conferencia_itens ci
     WHERE ci.entrega_id = p_entrega_id
     ORDER BY ci.id
  LOOP
    IF v_item.status = 'aceito' THEN
      IF v_item.embalagem_id IS NOT NULL THEN
        UPDATE public.estoque_embalagens
           SET status = 'entregue', entregue_em = now(), entregue_por = v_uid,
               entrega_id = p_entrega_id, updated_at = now()
         WHERE id = v_item.embalagem_id
           AND status <> 'entregue';

        INSERT INTO public.estoque_embalagem_movimentacoes
          (embalagem_id, tipo_movimentacao, status_anterior, status_novo, origem, destino,
           entrega_id, user_id, observacao, metadata)
        SELECT v_item.embalagem_id, 'entrega_confirmada', 'separado', 'entregue',
               'entrega', 'cliente', p_entrega_id, v_uid,
               'baixa por conferencia aceita',
               jsonb_build_object('conferencia_item_id', v_item.id, 'termo_id', v_t.id);
      END IF;
      IF v_item.etiqueta_id IS NOT NULL THEN
        UPDATE public.produto_etiquetas
           SET entrega_id = p_entrega_id, updated_at = now()
         WHERE id = v_item.etiqueta_id;
      END IF;
    ELSE
      IF v_item.embalagem_id IS NOT NULL THEN
        UPDATE public.estoque_embalagens
           SET status = 'em_estoque', entrega_id = NULL, entrega_item_id = NULL,
               reservado_em = NULL, reservado_por = NULL,
               separado_em = NULL, separado_por = NULL,
               entregue_em = NULL, entregue_por = NULL,
               updated_at = now()
         WHERE id = v_item.embalagem_id;

        INSERT INTO public.estoque_embalagem_movimentacoes
          (embalagem_id, tipo_movimentacao, status_anterior, status_novo, origem, destino,
           entrega_id, user_id, observacao, metadata)
        VALUES (v_item.embalagem_id, 'estorno_recusa', 'separado', 'em_estoque',
                'entrega', 'estoque', p_entrega_id, v_uid,
                left(coalesce(v_item.motivo,'recusa na conferencia'), 240),
                jsonb_build_object('conferencia_item_id', v_item.id, 'termo_id', v_t.id));
      END IF;
      IF v_item.etiqueta_id IS NOT NULL THEN
        UPDATE public.produto_etiquetas
           SET entrega_id = NULL, updated_at = now()
         WHERE id = v_item.etiqueta_id;
      END IF;
    END IF;
  END LOOP;

  SELECT coalesce(sum(ee.volume * ci.quantidade) FILTER (WHERE ci.status='aceito'), 0),
         coalesce(sum(ee.volume * ci.quantidade) FILTER (WHERE ci.status='recusado'), 0)
    INTO v_vol_ok, v_vol_no
    FROM public.entrega_conferencia_itens ci
    LEFT JOIN public.estoque_embalagens ee ON ee.id = ci.embalagem_id
   WHERE ci.entrega_id = p_entrega_id;

  v_ratio := CASE WHEN (v_qtd_ok + v_qtd_no) > 0
                  THEN round(v_qtd_ok / (v_qtd_ok + v_qtd_no), 5) ELSE 0 END;

  INSERT INTO public.entrega_reconciliacoes (
    entrega_id, termo_id, termo_versao, status,
    itens_total, itens_aceitos, itens_recusados,
    quantidade_aceita, quantidade_recusada, volume_aceito, volume_recusado,
    ratio_aceito, faturavel, resumo, idempotency_key, request_fingerprint, reconciliado_por
  ) VALUES (
    p_entrega_id, v_t.id, v_t.versao, 'reconciliada',
    v_total, v_ok, v_no,
    v_qtd_ok, v_qtd_no, v_vol_ok, v_vol_no,
    v_ratio, (v_ok > 0),
    jsonb_build_object(
      'termo_snapshot_hash', v_t.snapshot_hash,
      'cobertura', v_t.cobertura,
      'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'conferencia_item_id', ci.id, 'status', ci.status,
                  'quantidade', ci.quantidade) ORDER BY ci.id), '[]'::jsonb)
                FROM public.entrega_conferencia_itens ci WHERE ci.entrega_id = p_entrega_id)
    ),
    p_idempotency_key, v_fp, v_uid
  ) RETURNING id INTO v_id;

  UPDATE public.entregas SET
    status = CASE WHEN v_ok > 0 THEN 'entregue'::status_entrega ELSE status END,
    recebido_por_nome = coalesce(nullif(trim(recebido_por_nome), ''), v_t.recebedor_nome),
    recebido_por_documento = coalesce(recebido_por_documento, v_t.recebedor_documento),
    confirmado_por = coalesce(confirmado_por, v_uid),
    entregue_em = CASE WHEN v_ok > 0 THEN coalesce(entregue_em, now()) ELSE entregue_em END,
    confirmada_em = coalesce(confirmada_em, now()),
    confirmada_por = coalesce(confirmada_por, v_uid),
    quantidade_entregue = v_qtd_ok,
    volume_entregue_ml = v_vol_ok,
    financial_status = CASE WHEN v_ok > 0 THEN 'PENDING_BILLING' ELSE 'NOT_BILLABLE' END,
    not_billable_reason = CASE WHEN v_ok = 0 THEN 'RECUSA_TOTAL_NA_CONFERENCIA' ELSE not_billable_reason END,
    updated_at = now()
  WHERE id = p_entrega_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', p_entrega_id, 'DELIVERY_RECONCILED',
          jsonb_build_object('reconciliacao_id', v_id, 'termo_id', v_t.id,
                             'itens_aceitos', v_ok, 'itens_recusados', v_no,
                             'ratio_aceito', v_ratio, 'faturavel', (v_ok > 0)), v_uid);

  RETURN jsonb_build_object('success', true, 'replay', false, 'reconciliacao_id', v_id,
    'itens_total', v_total, 'itens_aceitos', v_ok, 'itens_recusados', v_no,
    'quantidade_aceita', v_qtd_ok, 'quantidade_recusada', v_qtd_no,
    'ratio_aceito', v_ratio, 'faturavel', (v_ok > 0));
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_entrega_reconciliar_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_reconciliar_v1(uuid, text) TO authenticated;
