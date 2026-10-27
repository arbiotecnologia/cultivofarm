-- RECORD ONLY. Captured LIVE read-only on ref swzpzcwiasxmjutrmvkm, 2026-10-27 ~14:48 UTC.
-- rpc OID 42803 md5 dc1ff655ba3bf156d38817fbf0c073dd; guard OID 42826 md5 55177f9db09a4d749c200a1801888249
-- Used by test-local.py to reproduce baseline defects. Never apply.
CREATE OR REPLACE FUNCTION public.rpc_salvar_campo_visita(p_registro_consultor_id uuid, p_client_uuid uuid, p_payload jsonb, p_versao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_registro public.registros_consultor;
  v_existing public.visitas_campo;
  v_result public.visitas_campo;
  v_is_admin boolean;
  v_has_scope boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);

  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_consultor_id;

  v_has_scope := v_registro.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_registro.cliente_id, ARRAY['execute','manage']);

  -- H9-D-L6: autorizacao antes de revelar existencia. Para quem nao tem escopo,
  -- registro inexistente e registro alheio produzem o MESMO erro 42501.
  IF NOT (v_is_admin OR COALESCE(v_registro.created_by = v_uid, false) OR v_has_scope) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF v_registro.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_registro.status::text) THEN
    RAISE EXCEPTION 'visita_locked' USING ERRCODE = '42501';
  END IF;

  IF v_registro.cliente_id IS NULL THEN
    RAISE EXCEPTION 'registro_sem_cliente' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing FROM public.visitas_campo WHERE registro_consultor_id = p_registro_consultor_id;

  IF v_existing.id IS NOT NULL AND COALESCE(p_versao, 0) < v_existing.versao THEN
    RAISE EXCEPTION 'stale_version' USING ERRCODE = '40001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.visitas_campo (
      registro_consultor_id, cliente_id, talhao_id, cultura_id,
      area_avaliada_ha, fase_fenologica, estande_plantas_ha, uniformidade,
      observacoes_campo, dados_extras, client_uuid, versao, created_by
    ) VALUES (
      p_registro_consultor_id,
      v_registro.cliente_id,
      NULLIF((p_payload->>'talhao_id'),'')::uuid,
      NULLIF((p_payload->>'cultura_id'),'')::uuid,
      NULLIF((p_payload->>'area_avaliada_ha'),'')::numeric,
      NULLIF(p_payload->>'fase_fenologica',''),
      NULLIF((p_payload->>'estande_plantas_ha'),'')::numeric,
      NULLIF(p_payload->>'uniformidade',''),
      NULLIF(p_payload->>'observacoes_campo',''),
      COALESCE(p_payload->'dados_extras', '{}'::jsonb),
      p_client_uuid,
      1,
      v_uid
    ) RETURNING * INTO v_result;
  ELSE
    UPDATE public.visitas_campo SET
      talhao_id = NULLIF((p_payload->>'talhao_id'),'')::uuid,
      cultura_id = NULLIF((p_payload->>'cultura_id'),'')::uuid,
      area_avaliada_ha = NULLIF((p_payload->>'area_avaliada_ha'),'')::numeric,
      fase_fenologica = NULLIF(p_payload->>'fase_fenologica',''),
      estande_plantas_ha = NULLIF((p_payload->>'estande_plantas_ha'),'')::numeric,
      uniformidade = NULLIF(p_payload->>'uniformidade',''),
      observacoes_campo = NULLIF(p_payload->>'observacoes_campo',''),
      dados_extras = COALESCE(p_payload->'dados_extras', '{}'::jsonb),
      versao = v_existing.versao + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  END IF;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'versao', v_result.versao,
    'client_uuid', v_result.client_uuid
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.visitas_campo_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.registro_consultor_id IS DISTINCT FROM OLD.registro_consultor_id THEN
    RAISE EXCEPTION 'campo_imutavel_registro_consultor_id' USING ERRCODE = '42501';
  END IF;
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'campo_imutavel_cliente_id' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'campo_imutavel_created_by' USING ERRCODE = '42501';
  END IF;
  IF OLD.client_uuid IS NOT NULL AND NEW.client_uuid IS DISTINCT FROM OLD.client_uuid THEN
    RAISE EXCEPTION 'campo_imutavel_client_uuid' USING ERRCODE = '42501';
  END IF;
  IF NEW.versao <= OLD.versao THEN
    RAISE EXCEPTION 'versao_deve_incrementar' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$function$;
