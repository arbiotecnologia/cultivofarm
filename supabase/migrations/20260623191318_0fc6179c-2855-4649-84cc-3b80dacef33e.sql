
CREATE OR REPLACE FUNCTION public.validate_catalog_approval_checklist(
  p_kind text,
  p_checklist jsonb,
  p_b2b_enabled boolean,
  p_has_sources boolean,
  p_aprovado_sem_fonte boolean
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_required text[];
  v_key text;
BEGIN
  IF p_kind NOT IN ('micro','produto') THEN
    RAISE EXCEPTION 'approval_invalid_kind';
  END IF;

  IF p_checklist IS NULL OR jsonb_typeof(p_checklist) <> 'object' THEN
    RAISE EXCEPTION 'approval_checklist_empty';
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(p_checklist)) = 0 THEN
    RAISE EXCEPTION 'approval_checklist_empty';
  END IF;

  IF p_kind = 'micro' THEN
    v_required := ARRAY['resumo','mecanismo','beneficios','tecnica','produtor','alvos','cuidados','regulatorias'];
  ELSE
    v_required := ARRAY['resumo','composicao','beneficio','tecnica','produtor','alvos','cuidados'];
  END IF;

  FOREACH v_key IN ARRAY v_required LOOP
    IF NOT COALESCE((p_checklist ->> v_key)::boolean, false) THEN
      RAISE EXCEPTION 'approval_checklist_missing_%', v_key;
    END IF;
  END LOOP;

  IF p_b2b_enabled AND NOT COALESCE((p_checklist ->> 'b2b')::boolean, false) THEN
    RAISE EXCEPTION 'approval_checklist_missing_b2b';
  END IF;

  IF p_has_sources THEN
    IF NOT COALESCE((p_checklist ->> 'fontes')::boolean, false) THEN
      RAISE EXCEPTION 'approval_checklist_missing_fontes';
    END IF;
  ELSE
    IF NOT p_aprovado_sem_fonte THEN
      RAISE EXCEPTION 'approval_missing_fontes';
    END IF;
    IF NOT COALESCE((p_checklist ->> 'sem_fonte')::boolean, false) THEN
      RAISE EXCEPTION 'approval_checklist_missing_sem_fonte';
    END IF;
  END IF;
END;
$$;

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
$function$;

CREATE OR REPLACE FUNCTION public.approve_product_profile_with_audit(p_profile_id uuid, p_checklist jsonb, p_aprovado_sem_fonte boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prod_id uuid;
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

  SELECT produto_id INTO v_prod_id FROM product_technical_profiles WHERE id = p_profile_id;
  IF v_prod_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT COALESCE(b2b_enabled, false) INTO v_b2b_enabled FROM produtos WHERE id = v_prod_id;

  SELECT EXISTS(
    SELECT 1 FROM catalog_technical_sources
    WHERE (entidade_tipo = 'produto' AND entidade_id = v_prod_id)
       OR (entidade_tipo = 'ficha_produto' AND entidade_id = p_profile_id)
  ) INTO v_has_sources;

  PERFORM public.validate_catalog_approval_checklist('produto', p_checklist, v_b2b_enabled, v_has_sources, p_aprovado_sem_fonte);

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
$function$;
