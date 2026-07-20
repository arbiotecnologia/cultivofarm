
-- Fix 1: Corrigir backfill de pdf_status — remover 'generated' de históricos sem evidência real
UPDATE public.registros_consultor r
   SET pdf_status = NULL
 WHERE pdf_status = 'generated'
   AND NOT EXISTS (
     SELECT 1 FROM public.registros_consultor_pdf_versions v
      WHERE v.registro_consultor_id = r.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.registros_consultor_arquivos a
      WHERE a.registro_consultor_id = r.id
        AND (a.tipo_arquivo ILIKE '%pdf%' OR a.arquivo_path ILIKE '%.pdf')
   );

-- Regra para novas visitas: default pending apenas quando natureza_registro='visita'
ALTER TABLE public.registros_consultor
  ALTER COLUMN pdf_status DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.set_pdf_status_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pdf_status IS NULL AND NEW.natureza_registro = 'visita' THEN
    NEW.pdf_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registros_consultor_pdf_status_default ON public.registros_consultor;
CREATE TRIGGER trg_registros_consultor_pdf_status_default
  BEFORE INSERT ON public.registros_consultor
  FOR EACH ROW EXECUTE FUNCTION public.set_pdf_status_default();

-- Fix 2: Reforçar a segurança do bloco unique_violation na RPC idempotente
CREATE OR REPLACE FUNCTION public.rpc_criar_visita_idempotente(
  p_client_uuid uuid,
  p_cliente_id uuid,
  p_fazenda_id uuid,
  p_talhao_id uuid,
  p_cultura_id uuid,
  p_data_vistoria date,
  p_tipo_visita tipo_visita,
  p_objetivo_visita text DEFAULT NULL,
  p_safra text DEFAULT NULL,
  p_fase_fenologica text DEFAULT NULL,
  p_solicitacao_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.registros_consultor%ROWTYPE;
  v_new_id uuid;
  v_fazenda_cliente uuid;
  v_talhao_fazenda uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_client_uuid IS NULL
     OR p_cliente_id IS NULL
     OR p_fazenda_id IS NULL
     OR p_talhao_id IS NULL
     OR p_cultura_id IS NULL
     OR p_data_vistoria IS NULL
     OR p_tipo_visita IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  SELECT * INTO v_existing
    FROM public.registros_consultor
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

  IF FOUND THEN
    IF v_existing.consultor_responsavel <> v_uid
       AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'registro_id', v_existing.id,
      'client_uuid', v_existing.client_uuid,
      'status', v_existing.status::text,
      'version', v_existing.version,
      'pdf_status', v_existing.pdf_status
    );
  END IF;

  IF NOT public.has_active_user_cliente_access(v_uid, p_cliente_id, ARRAY['execute','manage']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'technical_access_required');
  END IF;

  SELECT cliente_id INTO v_fazenda_cliente
    FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_fazenda_cliente IS NULL OR v_fazenda_cliente <> p_cliente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_farm');
  END IF;

  SELECT fazenda_id INTO v_talhao_fazenda
    FROM public.talhoes WHERE id = p_talhao_id;
  IF v_talhao_fazenda IS NULL OR v_talhao_fazenda <> p_fazenda_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_plot');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.culturas WHERE id = p_cultura_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_crop');
  END IF;

  IF p_solicitacao_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_solicitacoes
        WHERE id = p_solicitacao_id AND cliente_id = p_cliente_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
    END IF;
  END IF;

  INSERT INTO public.registros_consultor (
    client_uuid,
    cliente_id, fazenda_id, talhao_id, cultura_id,
    data_vistoria, tipo_visita, objetivo_visita, safra, fase_fenologica,
    solicitacao_id,
    consultor_responsavel, created_by,
    natureza_registro, status, version, pdf_status
  ) VALUES (
    p_client_uuid,
    p_cliente_id, p_fazenda_id, p_talhao_id, p_cultura_id,
    p_data_vistoria, p_tipo_visita, p_objetivo_visita, p_safra, p_fase_fenologica,
    p_solicitacao_id,
    v_uid, v_uid,
    'visita', 'rascunho', 1, 'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'registro_id', v_new_id,
    'client_uuid', p_client_uuid,
    'status', 'rascunho',
    'version', 1,
    'pdf_status', 'pending'
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM public.registros_consultor
      WHERE client_uuid = p_client_uuid
      LIMIT 1;
    IF FOUND THEN
      -- Reafirma autorização: nunca vazar registro alheio
      IF v_existing.consultor_responsavel <> v_uid
         AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'registro_id', v_existing.id,
        'client_uuid', v_existing.client_uuid,
        'status', v_existing.status::text,
        'version', v_existing.version,
        'pdf_status', v_existing.pdf_status
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid) TO authenticated;
