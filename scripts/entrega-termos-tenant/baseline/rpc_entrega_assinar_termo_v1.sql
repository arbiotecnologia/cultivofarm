CREATE OR REPLACE FUNCTION public.rpc_entrega_assinar_termo_v1(p_termo_id uuid, p_payload jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.entrega_termos%ROWTYPE;
  v_fp text;
  v_rec text := nullif(trim(coalesce(p_payload->>'recebedor_nome','')), '');
  v_tipo text := coalesce(nullif(p_payload->>'assinatura_tipo',''), 'digital_tela');
  v_ahash text := nullif(p_payload->>'assinatura_hash','');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF coalesce(trim(p_idempotency_key),'') = '' THEN RAISE EXCEPTION 'idempotency_key_obrigatoria'; END IF;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'recebedor_nome_obrigatorio'; END IF;
  IF v_tipo <> 'dispensada' AND v_ahash IS NULL THEN RAISE EXCEPTION 'assinatura_hash_obrigatoria'; END IF;

  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_termo:' || v_t.entrega_id::text, 0));
  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;

  v_fp := encode(extensions.digest(
    v_t.snapshot_hash || '|' || v_rec || '|' || coalesce(v_ahash,'') || '|' || v_tipo, 'sha256'), 'hex');

  -- Replay
  IF v_t.status = 'assinado' THEN
    IF v_t.idempotency_key = p_idempotency_key THEN
      IF v_t.request_fingerprint IS DISTINCT FROM v_fp THEN
        RAISE EXCEPTION 'idempotency_payload_mismatch';
      END IF;
      RETURN jsonb_build_object('success', true, 'replay', true, 'termo_id', v_t.id,
                                'versao', v_t.versao, 'snapshot_hash', v_t.snapshot_hash);
    END IF;
    RAISE EXCEPTION 'termo_ja_assinado';
  END IF;

  IF v_t.status <> 'rascunho' THEN RAISE EXCEPTION 'termo_estado_invalido: %', v_t.status; END IF;

  IF EXISTS (SELECT 1 FROM public.entrega_termos
             WHERE entrega_id = v_t.entrega_id AND idempotency_key = p_idempotency_key AND id <> v_t.id) THEN
    RAISE EXCEPTION 'idempotency_key_reutilizada';
  END IF;

  -- O rascunho deve representar os dados atuais, exceto a hora de geração.
  -- O replay acima permanece imutável e não refaz a assinatura.
  PERFORM 1 FROM public.entregas
   WHERE id = v_t.entrega_id AND status <> 'cancelada'
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entrega_invalida'; END IF;

  IF (v_t.snapshot - 'gerado_em') IS DISTINCT FROM
     (public.fn_entrega_build_snapshot_v1(v_t.entrega_id) - 'gerado_em')
     OR v_t.cobertura IS DISTINCT FROM public.fn_entrega_cobertura_v1(v_t.entrega_id) THEN
    RAISE EXCEPTION 'termo_desatualizado: atualize o rascunho antes de assinar';
  END IF;
  IF v_t.snapshot_hash IS DISTINCT FROM
     encode(extensions.digest(v_t.template_versao || '|' || v_t.snapshot::text, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'termo_integridade_invalida';
  END IF;

  IF v_t.cobertura = 'pendente' AND coalesce((p_payload->>'permitir_pendencia')::boolean, false) IS FALSE THEN
    RAISE EXCEPTION 'cobertura_pendente: conferir todos os itens antes de assinar';
  END IF;

  UPDATE public.entrega_termos SET
    status = 'assinado',
    recebedor_nome = v_rec,
    recebedor_documento = nullif(p_payload->>'recebedor_documento',''),
    recebedor_cargo = nullif(p_payload->>'recebedor_cargo',''),
    recebedor_telefone = nullif(p_payload->>'recebedor_telefone',''),
    assinatura_hash = v_ahash,
    assinatura_tipo = v_tipo,
    assinatura_origem = nullif(p_payload->>'origem',''),
    assinado_em = now(),
    assinado_por = v_uid,
    idempotency_key = p_idempotency_key,
    request_fingerprint = v_fp
  WHERE id = p_termo_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', v_t.entrega_id, 'DELIVERY_TERM_SIGNED',
          jsonb_build_object('termo_id', p_termo_id, 'versao', v_t.versao,
                             'snapshot_hash', v_t.snapshot_hash, 'cobertura', v_t.cobertura), v_uid);

  RETURN jsonb_build_object('success', true, 'replay', false, 'termo_id', p_termo_id,
                            'versao', v_t.versao, 'snapshot_hash', v_t.snapshot_hash,
                            'cobertura', v_t.cobertura);
END $function$
