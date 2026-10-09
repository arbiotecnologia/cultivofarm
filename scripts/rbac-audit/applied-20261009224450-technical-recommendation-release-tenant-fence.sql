CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_registro public.registros_consultor;
  v_rec_count integer;
  v_solic_id uuid;
  v_can_approve boolean;
  v_new_version integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF NOT public.can_manage_technical_visit(v_user_id, p_registro_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para aprovar esta recomendação.');
  END IF;

  SELECT * INTO v_registro
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;

  IF v_registro.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita técnica não encontrada.');
  END IF;

  v_can_approve :=
    public.has_role(v_user_id, 'administrador'::public.app_role)
    OR (
      public.has_role(v_user_id, 'gestor'::public.app_role)
      AND v_registro.cliente_id IS NOT NULL
      AND public.has_active_user_cliente_access(
        v_user_id, v_registro.cliente_id, ARRAY['manage']
      )
    );

  IF NOT v_can_approve THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para aprovar esta recomendação.');
  END IF;

  IF v_registro.status::text <> 'enviado_aprovacao' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Visita em status ' || v_registro.status::text || ' não pode ser aprovada.'
    );
  END IF;

  SELECT count(*) INTO v_rec_count
    FROM public.registros_consultor_recomendacoes
   WHERE registro_consultor_id = p_registro_id
     AND (
       coalesce(btrim(recomendacao_tecnica), '') <> ''
       OR coalesce(btrim(observacoes_finais), '') <> ''
       OR coalesce(btrim(estrategia_manejo::text), '') <> ''
     );

  IF v_rec_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não existe recomendação técnica preenchida para esta visita.');
  END IF;

  v_solic_id := v_registro.solicitacao_id;
  v_new_version := COALESCE(v_registro.version, 1) + 1;

  UPDATE public.registros_consultor
     SET status = 'aprovado'::public.status_registro_consultor,
         version = v_new_version,
         updated_at = now()
   WHERE id = p_registro_id;

  IF v_solic_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
       SET status = 'aguardando_decisao_produtor', updated_at = now()
     WHERE id = v_solic_id;

    INSERT INTO public.solicitacoes_timeline
      (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES
      (v_solic_id, 'recomendacao_liberada', 'Recomendação técnica liberada para decisão do produtor.', v_user_id);
  END IF;

  INSERT INTO public.registros_consultor_status_log
    (registro_consultor_id, status_anterior, status_novo, motivo, changed_by, changed_at)
  VALUES
    (p_registro_id, v_registro.status::text, 'aprovado', 'Liberação da recomendação ao produtor', v_user_id, now());

  INSERT INTO public.visitas_logs
    (registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES
    (p_registro_id, v_solic_id, 'recomendacao_liberada',
     'Recomendação técnica liberada ao produtor.', v_user_id,
     jsonb_build_object('status_anterior', v_registro.status::text,
                        'status_novo', 'aprovado',
                        'version', v_new_version));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Recomendação liberada ao produtor com sucesso.',
    'registro_id', p_registro_id,
    'solicitacao_id', v_solic_id,
    'status_anterior', v_registro.status::text,
    'status_novo', 'aprovado',
    'version', v_new_version
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', 'Erro ao liberar recomendação: ' || SQLERRM);
END;
$function$
