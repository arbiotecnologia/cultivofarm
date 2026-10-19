CREATE OR REPLACE FUNCTION public.rpc_entrega_gerar_termo_v1(p_entrega_id uuid, p_template_versao text DEFAULT 'termo-entrega-v1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_snap jsonb;
  v_hash text;
  v_cob text;
  v_id uuid;
  v_versao integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT public.is_delivery_staff(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_termo:' || p_entrega_id::text, 0));
  -- Tenant explícito: ator canônico ativo/pronto (h15) e entrega+cliente da mesma empresa.
  IF NOT public.is_delivery_staff(v_uid) OR NOT platform_private.entrega_termo_tenant_ok(p_entrega_id) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  IF EXISTS (SELECT 1 FROM public.entrega_termos WHERE entrega_id = p_entrega_id AND status = 'assinado') THEN
    RAISE EXCEPTION 'termo_ja_assinado';
  END IF;

  v_snap := public.fn_entrega_build_snapshot_v1(p_entrega_id);
  v_cob := public.fn_entrega_cobertura_v1(p_entrega_id);
  v_hash := encode(extensions.digest(p_template_versao || '|' || v_snap::text, 'sha256'), 'hex');

  SELECT id INTO v_id FROM public.entrega_termos
   WHERE entrega_id = p_entrega_id AND status = 'rascunho' LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.entrega_termos
       SET snapshot = v_snap, snapshot_hash = v_hash, cobertura = v_cob,
           template_versao = p_template_versao, comprovante_id = (SELECT comprovante_id FROM public.entregas WHERE id = p_entrega_id)
     WHERE id = v_id
     RETURNING versao INTO v_versao;
  ELSE
    SELECT coalesce(max(versao), 0) + 1 INTO v_versao
      FROM public.entrega_termos WHERE entrega_id = p_entrega_id;
    INSERT INTO public.entrega_termos
      (entrega_id, comprovante_id, versao, template_versao, status, snapshot, snapshot_hash, cobertura, created_by,
       substitui_termo_id)
    VALUES (p_entrega_id, (SELECT comprovante_id FROM public.entregas WHERE id = p_entrega_id),
            v_versao, p_template_versao, 'rascunho', v_snap, v_hash, v_cob, v_uid,
            (SELECT id FROM public.entrega_termos WHERE entrega_id = p_entrega_id
              AND status IN ('cancelado','substituido') ORDER BY versao DESC LIMIT 1))
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'termo_id', v_id, 'versao', v_versao,
                            'snapshot_hash', v_hash, 'cobertura', v_cob);
END $function$
