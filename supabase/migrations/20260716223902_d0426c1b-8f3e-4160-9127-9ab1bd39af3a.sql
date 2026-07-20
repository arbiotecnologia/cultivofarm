CREATE TABLE public.visitas_campo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_consultor_id uuid NOT NULL UNIQUE REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  talhao_id uuid NULL REFERENCES public.talhoes(id) ON DELETE SET NULL,
  cultura_id uuid NULL REFERENCES public.culturas(id) ON DELETE SET NULL,
  area_avaliada_ha numeric(10,2) NULL,
  fase_fenologica text NULL,
  estande_plantas_ha integer NULL,
  uniformidade text NULL,
  observacoes_campo text NULL,
  dados_extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_uuid uuid NULL,
  versao integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visitas_campo_uniformidade_check CHECK (
    uniformidade IS NULL OR uniformidade IN ('baixa','media','alta')
  )
);

CREATE INDEX idx_visitas_campo_cliente_id ON public.visitas_campo(cliente_id);
CREATE INDEX idx_visitas_campo_client_uuid ON public.visitas_campo(client_uuid) WHERE client_uuid IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas_campo TO authenticated;
GRANT ALL ON public.visitas_campo TO service_role;

ALTER TABLE public.visitas_campo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visitas_campo_select"
ON public.visitas_campo FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = visitas_campo.registro_consultor_id
      AND r.created_by = auth.uid()
  )
  OR public.has_active_user_cliente_access(auth.uid(), visitas_campo.cliente_id, ARRAY['read','execute','manage'])
);

CREATE POLICY "visitas_campo_insert"
ON public.visitas_campo FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.registros_consultor r
      WHERE r.id = registro_consultor_id
        AND r.created_by = auth.uid()
    )
    OR public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['execute','manage'])
  )
);

CREATE POLICY "visitas_campo_update"
ON public.visitas_campo FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = visitas_campo.registro_consultor_id
      AND r.created_by = auth.uid()
  )
  OR public.has_active_user_cliente_access(auth.uid(), visitas_campo.cliente_id, ARRAY['execute','manage'])
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = visitas_campo.registro_consultor_id
      AND r.created_by = auth.uid()
  )
  OR public.has_active_user_cliente_access(auth.uid(), visitas_campo.cliente_id, ARRAY['execute','manage'])
);

CREATE POLICY "visitas_campo_delete_admin"
ON public.visitas_campo FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER trg_visitas_campo_updated_at
BEFORE UPDATE ON public.visitas_campo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

  IF v_registro.status::text IN ('finalizada','arquivada') THEN
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
      NULLIF(p_payload->>'talhao_id','')::uuid,
      NULLIF(p_payload->>'cultura_id','')::uuid,
      NULLIF(p_payload->>'area_avaliada_ha','')::numeric,
      NULLIF(p_payload->>'fase_fenologica',''),
      NULLIF(p_payload->>'estande_plantas_ha','')::integer,
      NULLIF(p_payload->>'uniformidade',''),
      NULLIF(p_payload->>'observacoes_campo',''),
      COALESCE(p_payload->'dados_extras','{}'::jsonb),
      p_client_uuid,
      1,
      v_uid
    )
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.visitas_campo SET
      talhao_id = NULLIF(p_payload->>'talhao_id','')::uuid,
      cultura_id = NULLIF(p_payload->>'cultura_id','')::uuid,
      area_avaliada_ha = NULLIF(p_payload->>'area_avaliada_ha','')::numeric,
      fase_fenologica = NULLIF(p_payload->>'fase_fenologica',''),
      estande_plantas_ha = NULLIF(p_payload->>'estande_plantas_ha','')::integer,
      uniformidade = NULLIF(p_payload->>'uniformidade',''),
      observacoes_campo = NULLIF(p_payload->>'observacoes_campo',''),
      dados_extras = COALESCE(p_payload->'dados_extras', dados_extras),
      client_uuid = COALESCE(p_client_uuid, client_uuid),
      versao = v_existing.versao + 1
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  END IF;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'versao', v_result.versao,
    'updated_at', v_result.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_salvar_campo_visita(uuid, uuid, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_salvar_campo_visita(uuid, uuid, jsonb, integer) TO authenticated;