
-- 1) Coluna pdf_status
ALTER TABLE public.registros_consultor
  ADD COLUMN IF NOT EXISTS pdf_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registros_consultor_pdf_status_check'
  ) THEN
    ALTER TABLE public.registros_consultor
      ADD CONSTRAINT registros_consultor_pdf_status_check
      CHECK (pdf_status IS NULL OR pdf_status IN ('pending','generating','generated','error'));
  END IF;
END $$;

-- Backfill seguro: histórico finalizado com PDF assumido gerado; demais ficam pending
UPDATE public.registros_consultor
  SET pdf_status = CASE
    WHEN finalized_at IS NOT NULL THEN 'generated'
    ELSE 'pending'
  END
  WHERE pdf_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_registros_consultor_pdf_status
  ON public.registros_consultor (pdf_status)
  WHERE pdf_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registros_consultor_version
  ON public.registros_consultor (version);

-- 2) RPC idempotente de criação de rascunho de visita
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

  -- Idempotência: se já existe registro para este client_uuid, retorna sem criar
  SELECT * INTO v_existing
    FROM public.registros_consultor
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

  IF FOUND THEN
    -- Só pode reobter se for o próprio técnico dono do rascunho
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

  -- Validação: técnico deve ter vínculo ativo com o cliente
  IF NOT public.has_active_user_cliente_access(v_uid, p_cliente_id, ARRAY['execute','manage']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'technical_access_required');
  END IF;

  -- Fazenda pertence ao cliente
  SELECT cliente_id INTO v_fazenda_cliente
    FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_fazenda_cliente IS NULL OR v_fazenda_cliente <> p_cliente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_farm');
  END IF;

  -- Talhão pertence à fazenda
  SELECT fazenda_id INTO v_talhao_fazenda
    FROM public.talhoes WHERE id = p_talhao_id;
  IF v_talhao_fazenda IS NULL OR v_talhao_fazenda <> p_fazenda_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_plot');
  END IF;

  -- Cultura válida
  IF NOT EXISTS (SELECT 1 FROM public.culturas WHERE id = p_cultura_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_crop');
  END IF;

  -- Solicitação (quando informada) deve existir e pertencer ao cliente
  IF p_solicitacao_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_solicitacoes
        WHERE id = p_solicitacao_id AND cliente_id = p_cliente_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
    END IF;
  END IF;

  -- Inserção — todos os campos sensíveis são resolvidos pelo servidor
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
    -- Corrida: outro insert com o mesmo client_uuid ganhou. Rebusca.
    SELECT * INTO v_existing
      FROM public.registros_consultor
      WHERE client_uuid = p_client_uuid
      LIMIT 1;
    IF FOUND THEN
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
