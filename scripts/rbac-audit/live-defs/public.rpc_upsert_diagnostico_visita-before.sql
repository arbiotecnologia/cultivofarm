CREATE OR REPLACE FUNCTION public.rpc_upsert_diagnostico_visita(p_registro_id uuid, p_client_uuid uuid, p_payload jsonb, p_expected_versao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.visita_diagnosticos;
  v_new public.visita_diagnosticos;
  v_registro_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- H9-D-L6: autorizacao de escopo ANTES de qualquer leitura da visita.
  -- Inexistente e alheio (editavel ou nao) retornam o MESMO erro.
  IF NOT public._visita_scope_ok(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  PERFORM public._assert_visita_editavel(p_registro_id);
  IF NOT public.can_manage_technical_visit(v_uid, p_registro_id)
     AND NOT public.is_active_visit_participant(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;
  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO v_existing
    FROM public.visita_diagnosticos
   WHERE registro_id = p_registro_id
     AND client_uuid = p_client_uuid
   FOR UPDATE;

  IF v_existing.id IS NOT NULL
     AND COALESCE(p_expected_versao, -1) < v_existing.versao THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.visita_diagnosticos (
      registro_id, client_uuid, categoria, problema, descricao, severidade,
      incidencia, urgencia, risco, intervencao, localizacao, versao, created_by
    ) VALUES (
      p_registro_id, p_client_uuid,
      NULLIF(COALESCE(p_payload->>'categoria', p_payload->>'categoria_problema'),''), NULLIF(COALESCE(p_payload->>'problema', p_payload->>'problema_principal'),''),
      NULLIF(COALESCE(p_payload->>'descricao', p_payload->>'observacoes_tecnicas'),''), NULLIF(COALESCE(p_payload->>'severidade', p_payload->>'nivel_pressao'),''),
      NULLIF(COALESCE(p_payload->>'incidencia', p_payload->>'percentual_area_afetada'),'')::numeric,
      NULLIF(p_payload->>'urgencia',''), NULLIF(p_payload->>'risco',''),
      NULLIF(p_payload->>'intervencao',''), NULLIF(p_payload->>'localizacao',''),
      GREATEST(1, COALESCE(p_expected_versao, 1)), v_uid
    ) RETURNING * INTO v_new;
  ELSE
    UPDATE public.visita_diagnosticos SET
      categoria = NULLIF(COALESCE(p_payload->>'categoria', p_payload->>'categoria_problema'),''),
      problema = NULLIF(COALESCE(p_payload->>'problema', p_payload->>'problema_principal'),''),
      descricao = NULLIF(COALESCE(p_payload->>'descricao', p_payload->>'observacoes_tecnicas'),''),
      severidade = NULLIF(COALESCE(p_payload->>'severidade', p_payload->>'nivel_pressao'),''),
      incidencia = NULLIF(COALESCE(p_payload->>'incidencia', p_payload->>'percentual_area_afetada'),'')::numeric,
      urgencia = NULLIF(p_payload->>'urgencia',''),
      risco = NULLIF(p_payload->>'risco',''),
      intervencao = NULLIF(p_payload->>'intervencao',''),
      localizacao = NULLIF(p_payload->>'localizacao',''),
      versao = v_existing.versao + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
  END IF;

  UPDATE public.registros_consultor
     SET problema_principal = COALESCE(NULLIF(COALESCE(p_payload->>'problema_principal', p_payload->>'problema'),''), problema_principal),
         categoria_problema = COALESCE(NULLIF(COALESCE(p_payload->>'categoria_problema', p_payload->>'categoria'),'')::public.categoria_problema_consultor, categoria_problema),
         nivel_pressao = COALESCE(NULLIF(COALESCE(p_payload->>'nivel_pressao', p_payload->>'severidade'),'')::public.nivel_pressao, nivel_pressao),
         percentual_area_afetada = COALESCE(NULLIF(COALESCE(p_payload->>'percentual_area_afetada', p_payload->>'incidencia'),'')::numeric, percentual_area_afetada),
         observacoes_tecnicas = COALESCE(NULLIF(COALESCE(p_payload->>'observacoes_tecnicas', p_payload->>'descricao'),''), observacoes_tecnicas),
         urgencia = COALESCE(NULLIF(p_payload->>'urgencia','')::public.urgencia_consultor, urgencia),
         version = COALESCE(version,1) + 1,
         updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_registro_version;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'versao', v_new.versao,
    'registro_version', v_registro_version,
    'client_uuid', v_new.client_uuid
  );
END
$function$
