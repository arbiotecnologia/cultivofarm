CREATE OR REPLACE FUNCTION public.rpc_enviar_visita_aprovacao(p_registro_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);

  -- H9-D-L5: resolucao e autorizacao em consulta unica escopada.
  -- Registro inexistente e registro alheio produzem o MESMO erro generico,
  -- eliminando o oraculo de existencia (enumeracao de registros_consultor).
  SELECT r.* INTO v_reg
    FROM public.registros_consultor r
   WHERE r.id = p_registro_id
     AND (
       v_is_admin
       OR r.created_by = v_uid
       OR r.consultor_responsavel = v_uid
       OR (r.cliente_id IS NOT NULL
           AND public.has_active_user_cliente_access(v_uid, r.cliente_id, ARRAY['execute','manage']))
     )
   FOR UPDATE;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF v_reg.status::text <> 'finalizado' THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  v_new_version := v_reg.version + 1;

  UPDATE public.registros_consultor
     SET status = 'enviado_aprovacao'::status_registro_consultor,
         version = v_new_version,
         updated_at = now()
   WHERE id = p_registro_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (p_registro_id, v_uid, 'enviado_aprovacao', 'Visita enviada para aprovação via rpc_enviar_visita_aprovacao');

  RETURN jsonb_build_object(
    'id', p_registro_id,
    'status', 'enviado_aprovacao',
    'version', v_new_version
  );
END;
$function$