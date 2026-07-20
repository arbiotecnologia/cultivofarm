-- Fase Envase 1.1.1 - Corrige RPC desvincular e auditoria
DROP FUNCTION IF EXISTS public.rpc_desvincular_etiqueta_entrega(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_desvincular_etiqueta_entrega(
  p_entrega_id uuid,
  p_etiqueta_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motivo text := btrim(coalesce(p_motivo, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 3 caracteres)';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role) OR
    public.has_role(v_uid, 'gestor'::app_role) OR
    public.has_role(v_uid, 'producao'::app_role) OR
    public.has_role(v_uid, 'operador_onfarm'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para desvincular etiqueta';
  END IF;

  UPDATE public.entrega_etiquetas
     SET ativo = false,
         desvinculado_em = now(),
         desvinculado_por = v_uid,
         motivo_desvinculacao = v_motivo
   WHERE entrega_id = p_entrega_id
     AND etiqueta_id = p_etiqueta_id
     AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo entrega/etiqueta não encontrado ou já desvinculado';
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(
    etiqueta_id, evento, descricao, user_id, metadata
  ) VALUES (
    p_etiqueta_id,
    'etiqueta_substituida',
    'Etiqueta desvinculada da entrega de forma lógica.',
    v_uid,
    jsonb_build_object(
      'entrega_id', p_entrega_id,
      'motivo', v_motivo,
      'acao', 'desvinculada'
    )
  );

  INSERT INTO public.financial_audit_log(
    entity_type, entity_id, action, old_data, new_data, performed_by, reason
  ) VALUES (
    'produto_etiqueta',
    p_etiqueta_id,
    'LABEL_DELIVERY_UNLINKED',
    NULL,
    jsonb_build_object(
      'entrega_id', p_entrega_id,
      'motivo', v_motivo,
      'ativo', false
    ),
    v_uid,
    v_motivo
  );

  RETURN jsonb_build_object(
    'success', true,
    'entrega_id', p_entrega_id,
    'etiqueta_id', p_etiqueta_id,
    'status', 'desvinculada'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_desvincular_etiqueta_entrega(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_desvincular_etiqueta_entrega(uuid, uuid, text) TO authenticated;