
CREATE OR REPLACE FUNCTION public.rpc_entrega_registrar_conferencia_v1(p_entrega_id uuid, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_etq uuid;
  v_status text;
  v_qtd numeric;
  v_motivo text;
  v_emb uuid;
  v_cq boolean;
  v_n integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entregas WHERE id = p_entrega_id AND status <> 'cancelada') THEN
    RAISE EXCEPTION 'entrega_invalida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entrega_termos WHERE entrega_id = p_entrega_id AND status = 'assinado') THEN
    RAISE EXCEPTION 'termo_ja_assinado';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_conf:' || p_entrega_id::text, 0));

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  LOOP
    v_etq := nullif(v_item->>'etiqueta_id','')::uuid;
    v_status := coalesce(nullif(v_item->>'status',''), 'pendente');
    v_qtd := coalesce(nullif(v_item->>'quantidade','')::numeric, 1);
    v_motivo := nullif(trim(coalesce(v_item->>'motivo','')), '');

    IF v_etq IS NULL THEN RAISE EXCEPTION 'etiqueta_id_obrigatorio'; END IF;
    IF v_status NOT IN ('aceito','recusado','pendente') THEN
      RAISE EXCEPTION 'status_invalido: %', v_status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.entrega_etiquetas ee
                   WHERE ee.entrega_id = p_entrega_id AND ee.etiqueta_id = v_etq AND ee.ativo) THEN
      RAISE EXCEPTION 'etiqueta_nao_vinculada_a_entrega';
    END IF;

    SELECT pe.embalagem_id, pe.cq_liberado INTO v_emb, v_cq
    FROM public.produto_etiquetas pe WHERE pe.id = v_etq;

    IF v_status = 'aceito' THEN
      IF EXISTS (SELECT 1 FROM public.produto_etiquetas pe
                 WHERE pe.id = v_etq
                   AND (pe.status IN ('cancelada','substituida')
                        OR (pe.validade_em IS NOT NULL AND pe.validade_em < current_date))) THEN
        RAISE EXCEPTION 'etiqueta_invalida_ou_vencida';
      END IF;
      IF coalesce(v_cq, false) IS FALSE THEN
        RAISE EXCEPTION 'cq_nao_liberado';
      END IF;
      IF v_emb IS NULL THEN
        RAISE EXCEPTION 'embalagem_nao_vinculada_a_etiqueta';
      END IF;
    END IF;

    INSERT INTO public.entrega_conferencia_itens
      (entrega_id, etiqueta_id, embalagem_id, status, quantidade, motivo, conferido_em, conferido_por)
    VALUES (p_entrega_id, v_etq, v_emb, v_status, v_qtd, v_motivo, now(), v_uid)
    ON CONFLICT (entrega_id, etiqueta_id) WHERE etiqueta_id IS NOT NULL
    DO UPDATE SET status = EXCLUDED.status,
                  quantidade = EXCLUDED.quantidade,
                  motivo = EXCLUDED.motivo,
                  embalagem_id = EXCLUDED.embalagem_id,
                  conferido_em = now(),
                  conferido_por = v_uid;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'itens', v_n,
    'cobertura', public.fn_entrega_cobertura_v1(p_entrega_id));
END $function$;
