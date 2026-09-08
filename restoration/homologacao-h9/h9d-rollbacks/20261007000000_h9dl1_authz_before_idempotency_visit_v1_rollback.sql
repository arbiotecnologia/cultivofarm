CREATE OR REPLACE FUNCTION public.create_technical_visit_secure(p_cliente_id uuid, p_fazenda_id uuid, p_talhao_id uuid DEFAULT NULL::uuid, p_solicitacao_origem_id uuid DEFAULT NULL::uuid, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_visit_type tipo_visita DEFAULT 'vistoria_inicial'::tipo_visita, p_priority urgencia_consultor DEFAULT 'media'::urgencia_consultor, p_initial_notes text DEFAULT NULL::text, p_client_uuid uuid DEFAULT NULL::uuid)
 RETURNS TABLE(registro_id uuid, is_new boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_existing uuid;
  v_vinculo record;
  v_new_id uuid;
BEGIN
  -- 1) Auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- 2) Idempotência por client_uuid
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_existing
      FROM public.registros_consultor
     WHERE client_uuid = p_client_uuid
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_existing, false;
      RETURN;
    END IF;
  END IF;

  -- 3) Admin bypass
  SELECT public.has_role(v_uid, 'administrador'::app_role) INTO v_is_admin;

  -- 4) Vínculo técnico
  IF NOT v_is_admin THEN
    SELECT * INTO v_vinculo
      FROM public.user_clientes
     WHERE user_id = v_uid
       AND cliente_id = p_cliente_id
       AND is_active = true
       AND (valid_from IS NULL OR valid_from <= now())
       AND (valid_until IS NULL OR valid_until >= now())
       AND access_level IN ('execute','manage')
     LIMIT 1;

    IF v_vinculo.id IS NULL THEN
      RAISE EXCEPTION 'no_active_binding_or_insufficient_access' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 5) Cliente ativo
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id) THEN
    RAISE EXCEPTION 'cliente_not_found' USING ERRCODE = '22023';
  END IF;

  -- 6) Fazenda pertence ao cliente
  IF NOT EXISTS (
    SELECT 1 FROM public.fazendas
     WHERE id = p_fazenda_id AND cliente_id = p_cliente_id
  ) THEN
    RAISE EXCEPTION 'fazenda_does_not_belong_to_cliente' USING ERRCODE = '22023';
  END IF;

  -- 7) Talhão pertence à fazenda
  IF p_talhao_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.talhoes
       WHERE id = p_talhao_id AND fazenda_id = p_fazenda_id
    ) THEN
      RAISE EXCEPTION 'talhao_does_not_belong_to_fazenda' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 8) Solicitação pertence ao mesmo cliente
  IF p_solicitacao_origem_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_solicitacoes
       WHERE id = p_solicitacao_origem_id AND cliente_id = p_cliente_id
    ) THEN
      RAISE EXCEPTION 'solicitacao_mismatch_cliente' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 9) Insert
  INSERT INTO public.registros_consultor(
    cliente_id, fazenda_id, talhao_id,
    consultor_responsavel, created_by,
    solicitacao_id, tipo_visita, urgencia,
    natureza_registro, status,
    observacoes_tecnicas, data_vistoria,
    client_uuid
  ) VALUES (
    p_cliente_id, p_fazenda_id, p_talhao_id,
    v_uid, v_uid,
    p_solicitacao_origem_id, p_visit_type, p_priority,
    'visita', 'rascunho',
    p_initial_notes, COALESCE(p_scheduled_at::date, CURRENT_DATE),
    p_client_uuid
  )
  RETURNING id INTO v_new_id;

  -- 10) Log de auditoria
  INSERT INTO public.visitas_logs(registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES (
    v_new_id, p_solicitacao_origem_id, 'visita_criada',
    'Visita técnica criada via create_technical_visit_secure',
    v_uid,
    jsonb_build_object(
      'tipo_visita', p_visit_type,
      'urgencia', p_priority,
      'admin_bypass', v_is_admin
    )
  );

  RETURN QUERY SELECT v_new_id, true;
END;
$function$

;
REVOKE ALL ON FUNCTION public.create_technical_visit_secure(uuid,uuid,uuid,uuid,timestamptz,public.tipo_visita,public.urgencia_consultor,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_technical_visit_secure(uuid,uuid,uuid,uuid,timestamptz,public.tipo_visita,public.urgencia_consultor,text,uuid) TO authenticated, service_role;
