
-- FASE 21: Transactional approval RPCs for technical catalog
CREATE OR REPLACE FUNCTION public.approve_microorganism_profile_with_audit(
  p_profile_id uuid,
  p_checklist jsonb,
  p_aprovado_sem_fonte boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
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

  SELECT EXISTS(SELECT 1 FROM microorganism_technical_profiles WHERE id = p_profile_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

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
$$;

CREATE OR REPLACE FUNCTION public.approve_product_profile_with_audit(
  p_profile_id uuid,
  p_checklist jsonb,
  p_aprovado_sem_fonte boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
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

  SELECT EXISTS(SELECT 1 FROM product_technical_profiles WHERE id = p_profile_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  UPDATE product_technical_profiles
  SET status_validacao = 'aprovado',
      validado_por = v_uid,
      validado_em = now(),
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO catalog_technical_audit_logs (entidade_tipo, entidade_id, acao, usuario_id, dados_novos)
  VALUES (
    'ficha_produto',
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
$$;

CREATE OR REPLACE FUNCTION public.return_catalog_profile_to_review(
  p_kind text,
  p_profile_id uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
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
  IF p_kind NOT IN ('micro','produto') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'motivo_too_short';
  END IF;

  IF p_kind = 'micro' THEN
    SELECT EXISTS(SELECT 1 FROM microorganism_technical_profiles WHERE id = p_profile_id) INTO v_exists;
    IF NOT v_exists THEN RAISE EXCEPTION 'profile_not_found'; END IF;
    UPDATE microorganism_technical_profiles
    SET status_validacao = 'em_revisao',
        updated_by = v_uid,
        updated_at = now()
    WHERE id = p_profile_id;
    INSERT INTO catalog_technical_audit_logs (entidade_tipo, entidade_id, acao, usuario_id, dados_novos)
    VALUES ('ficha_microrganismo', p_profile_id, 'retorno_ajuste', v_uid,
      jsonb_build_object('motivo_retorno_ajuste', btrim(p_motivo)));
  ELSE
    SELECT EXISTS(SELECT 1 FROM product_technical_profiles WHERE id = p_profile_id) INTO v_exists;
    IF NOT v_exists THEN RAISE EXCEPTION 'profile_not_found'; END IF;
    UPDATE product_technical_profiles
    SET status_validacao = 'em_revisao',
        updated_by = v_uid,
        updated_at = now()
    WHERE id = p_profile_id;
    INSERT INTO catalog_technical_audit_logs (entidade_tipo, entidade_id, acao, usuario_id, dados_novos)
    VALUES ('ficha_produto', p_profile_id, 'retorno_ajuste', v_uid,
      jsonb_build_object('motivo_retorno_ajuste', btrim(p_motivo)));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_microorganism_profile_with_audit(uuid, jsonb, boolean) FROM public;
REVOKE ALL ON FUNCTION public.approve_product_profile_with_audit(uuid, jsonb, boolean) FROM public;
REVOKE ALL ON FUNCTION public.return_catalog_profile_to_review(text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_microorganism_profile_with_audit(uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_product_profile_with_audit(uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_catalog_profile_to_review(text, uuid, text) TO authenticated;
