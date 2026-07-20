-- Fase 2: função central de imutabilidade

CREATE OR REPLACE FUNCTION public.is_technical_visit_editable_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_status IS NOT NULL
     AND p_status IN ('rascunho', 'em_andamento', 'devolvido_correcao');
$$;

GRANT EXECUTE ON FUNCTION public.is_technical_visit_editable_status(text) TO authenticated, service_role;

-- Corrigir rpc_salvar_campo_visita: valores 'finalizada'/'arquivada' nunca casam
-- com o enum real, então a trava de imutabilidade estava desativada de fato.
CREATE OR REPLACE FUNCTION public.rpc_salvar_campo_visita(
  p_registro_consultor_id uuid,
  p_client_uuid uuid,
  p_payload jsonb,
  p_versao integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_consultor_id;
  IF v_registro.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := v_registro.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_registro.cliente_id, ARRAY['execute','manage']);

  IF NOT (v_is_admin OR v_registro.created_by = v_uid OR v_has_scope) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
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
$$;