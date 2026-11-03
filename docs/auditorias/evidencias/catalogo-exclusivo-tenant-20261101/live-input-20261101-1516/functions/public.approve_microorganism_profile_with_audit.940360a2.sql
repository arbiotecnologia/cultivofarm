CREATE OR REPLACE FUNCTION public.approve_microorganism_profile_with_audit(p_profile_id uuid, p_checklist jsonb, p_aprovado_sem_fonte boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_micro_id uuid;
  v_b2b_enabled boolean := false;
  v_has_sources boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF NOT (
    has_role(v_uid, 'administrador'::app_role)
    OR has_role(v_uid, 'gestor'::app_role)
    OR has_role(v_uid, 'consultor_tecnico'::app_role)
    OR has_role(v_uid, 'tecnico_agronomo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT microrganismo_id INTO v_micro_id FROM microorganism_technical_profiles WHERE id = p_profile_id;
  IF v_micro_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT COALESCE(b2b_enabled, false) INTO v_b2b_enabled FROM microrganismos WHERE id = v_micro_id;

  SELECT EXISTS(
    SELECT 1 FROM catalog_technical_sources
    WHERE (entidade_tipo = 'microrganismo' AND entidade_id = v_micro_id)
       OR (entidade_tipo = 'ficha_microrganismo' AND entidade_id = p_profile_id)
  ) INTO v_has_sources;

  PERFORM public.validate_catalog_approval_checklist('micro', p_checklist, v_b2b_enabled, v_has_sources, p_aprovado_sem_fonte);

  UPDATE microorganism_technical_profiles
  SET status_validacao = 'aprovado',
      validado_por = v_uid,
      validado_em = now(),
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO catalog_technical_audit_logs (entidade_tipo, entidade_id, acao, usuario_id, dados_novos)
  VALUES (
    'ficha_microrganismo',
    p_profile_id,
    CASE WHEN p_aprovado_sem_fonte THEN 'aprovacao_tecnica_sem_fonte' ELSE 'aprovacao_tecnica' END,
    v_uid,
    jsonb_build_object(
      'checklist_aprovacao', p_checklist,
      'aprovado_por', v_uid,
      'aprovado_em', now(),
      'aprovado_sem_fonte', p_aprovado_sem_fonte
    )
  );
END;
$function$
