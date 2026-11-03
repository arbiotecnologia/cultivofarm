CREATE OR REPLACE FUNCTION public.rpc_get_comprovante_entrega_data(p_entrega_id uuid, p_reemissao boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  e           public.entregas%ROWTYPE;
  v_conteudo  jsonb;
  v_snapshot  jsonb;
  v_comp      public.entrega_comprovantes%ROWTYPE;
  v_doc_tipo  text;
  v_receb     text;
  v_numero    text;
  v_hash      text;
  v_reemissoes int := 0;
  v_congelado boolean := false;
  v_item      jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_UNAUTHENTICATED';
  END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN
    RAISE EXCEPTION 'COMPROVANTE_FORBIDDEN';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('comprovante_entrega:' || p_entrega_id::text));

  SELECT * INTO e FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_NAO_ENCONTRADA';
  END IF;
  IF e.status = 'cancelada' THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_CANCELADA';
  END IF;

  v_receb := nullif(btrim(coalesce(e.recebido_por_nome, e.recebedor_nome, '')), '');
  v_doc_tipo := CASE
                  WHEN e.status = 'entregue' AND v_receb IS NOT NULL THEN 'comprovante'
                  ELSE 'romaneio'
                END;

  v_conteudo := public.fn_comprovante_entrega_montar_v1(p_entrega_id);

  -- Documento operacional: sempre montado do estado atual, sem congelar.
  IF v_doc_tipo = 'romaneio' THEN
    RETURN jsonb_build_object(
      'doc_tipo', 'romaneio',
      'titulo', 'Romaneio de Entrega',
      'definitivo', false,
      'numero_documento', 'RM-' || upper(substr(replace(e.id::text, '-', ''), 1, 8)),
      'emitido_em', now(),
      'conteudo', v_conteudo,
      'aviso', 'Documento operacional. Nao comprova o recebimento fisico.'
    );
  END IF;

  -- Comprovante definitivo: cliente + OS + produto + lote + quantidade + volume.
  IF (v_conteudo->'destinatario'->>'cliente_id') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_CLIENTE_OBRIGATORIO';
  END IF;
  IF v_conteudo->'ordem_servico' IS NULL
     OR jsonb_typeof(v_conteudo->'ordem_servico') <> 'object'
     OR (v_conteudo->'ordem_servico'->>'os_id') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_OS_OBRIGATORIA';
  END IF;
  IF jsonb_array_length(v_conteudo->'itens') = 0 THEN
    RAISE EXCEPTION 'COMPROVANTE_SEM_ITENS';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_conteudo->'itens') LOOP
    IF nullif(btrim(coalesce(v_item->>'produto', '')), '') IS NULL THEN
      RAISE EXCEPTION 'COMPROVANTE_PRODUTO_OBRIGATORIO';
    END IF;
    IF nullif(btrim(coalesce(v_item->>'lote', '')), '') IS NULL THEN
      RAISE EXCEPTION 'COMPROVANTE_LOTE_OBRIGATORIO';
    END IF;
    IF coalesce((v_item->>'quantidade')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'COMPROVANTE_QUANTIDADE_OBRIGATORIA';
    END IF;
    IF coalesce((v_item->>'volume_total_ml')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'COMPROVANTE_VOLUME_OBRIGATORIO';
    END IF;
  END LOOP;
  IF (v_conteudo->'recebimento'->>'confirmado_em') IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_CONFIRMACAO_SEM_DATA';
  END IF;

  SELECT * INTO v_comp
    FROM public.entrega_comprovantes
   WHERE entrega_id = p_entrega_id
     AND metadata ? 'comprovante_snapshot_v1'
   ORDER BY gerado_em DESC
   LIMIT 1;

  IF v_comp.id IS NOT NULL THEN
    v_congelado := true;
    v_snapshot  := v_comp.metadata->'comprovante_snapshot_v1';
    v_numero    := coalesce(v_comp.metadata->>'comprovante_numero', v_comp.numero_formulario);
    v_hash      := v_comp.metadata->>'comprovante_snapshot_hash';
    v_reemissoes := coalesce((v_comp.metadata->>'comprovante_reemissoes')::int, 0);
  ELSE
    SELECT * INTO v_comp
      FROM public.entrega_comprovantes
     WHERE entrega_id = p_entrega_id
     ORDER BY gerado_em DESC
     LIMIT 1;

    v_numero := 'CE-' || to_char(now(), 'YYYY') || '-'
             || lpad(nextval('public.comprovante_entrega_seq')::text, 6, '0');
    v_snapshot := v_conteudo || jsonb_build_object(
      'congelado_em', now(),
      'congelado_por', v_uid,
      'numero_documento', v_numero
    );
    v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');

    IF v_comp.id IS NULL THEN
      INSERT INTO public.entrega_comprovantes (
        entrega_id, numero_formulario, tipo, status,
        validation_token, gerado_por, metadata
      ) VALUES (
        p_entrega_id, v_numero, 'comprovante_entrega', 'confirmado',
        gen_random_uuid(), v_uid,
        jsonb_build_object(
          'comprovante_snapshot_v1', v_snapshot,
          'comprovante_snapshot_hash', v_hash,
          'comprovante_numero', v_numero,
          'comprovante_reemissoes', 0
        )
      ) RETURNING * INTO v_comp;
    ELSE
      UPDATE public.entrega_comprovantes
         SET metadata = metadata || jsonb_build_object(
               'comprovante_snapshot_v1', v_snapshot,
               'comprovante_snapshot_hash', v_hash,
               'comprovante_numero', v_numero,
               'comprovante_reemissoes', 0
             ),
             updated_at = now()
       WHERE id = v_comp.id
       RETURNING * INTO v_comp;
    END IF;

    INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
    VALUES ('entrega', p_entrega_id, 'DELIVERY_RECEIPT_SNAPSHOT_FROZEN',
            jsonb_build_object('comprovante_id', v_comp.id, 'numero', v_numero, 'hash', v_hash), v_uid);
  END IF;

  IF p_reemissao AND v_congelado THEN
    v_reemissoes := v_reemissoes + 1;
    UPDATE public.entrega_comprovantes
       SET metadata = metadata || jsonb_build_object(
             'comprovante_reemissoes', v_reemissoes,
             'comprovante_ultima_reemissao_em', now(),
             'comprovante_ultima_reemissao_por', v_uid),
           updated_at = now()
     WHERE id = v_comp.id;

    INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
    VALUES ('entrega', p_entrega_id, 'DELIVERY_RECEIPT_REISSUED',
            jsonb_build_object('comprovante_id', v_comp.id, 'reemissao', v_reemissoes), v_uid);
  END IF;

  RETURN jsonb_build_object(
    'doc_tipo', 'comprovante',
    'titulo', 'Comprovante de Entrega',
    'definitivo', true,
    'numero_documento', v_numero,
    'comprovante_id', v_comp.id,
    'snapshot_hash', v_hash,
    'reemissoes', v_reemissoes,
    'emitido_em', now(),
    'conteudo', v_snapshot,
    'aviso', 'Este documento comprova exclusivamente a entrega fisica dos produtos nele relacionados. '
          || 'Nao substitui documento fiscal, receituario agronomico, prescricao tecnica ou laudo tecnico '
          || 'quando legalmente exigiveis.'
  );
END
$function$
