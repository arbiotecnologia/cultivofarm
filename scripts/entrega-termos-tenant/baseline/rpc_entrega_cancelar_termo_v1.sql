CREATE OR REPLACE FUNCTION public.rpc_entrega_cancelar_termo_v1(p_termo_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.entrega_termos%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sessao_invalida'; END IF;
  IF NOT (public.has_role(v_uid,'administrador'::public.app_role)
          OR public.has_role(v_uid,'gestor'::public.app_role)
          OR public.has_role(v_uid,'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF length(coalesce(trim(p_motivo),'')) < 5 THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;

  SELECT * INTO v_t FROM public.entrega_termos WHERE id = p_termo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'termo_nao_encontrado'; END IF;
  IF v_t.status NOT IN ('rascunho','assinado') THEN RAISE EXCEPTION 'termo_estado_invalido: %', v_t.status; END IF;

  UPDATE public.entrega_termos
     SET status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid,
         motivo_cancelamento = trim(p_motivo)
   WHERE id = p_termo_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('entrega', v_t.entrega_id, 'DELIVERY_TERM_CANCELLED',
          jsonb_build_object('termo_id', p_termo_id, 'versao', v_t.versao, 'motivo', trim(p_motivo)), v_uid);

  RETURN jsonb_build_object('success', true, 'termo_id', p_termo_id, 'status', 'cancelado');
END $function$
