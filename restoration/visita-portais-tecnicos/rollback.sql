-- ============================================================================
-- ROLLBACK LÓGICO NÃO DESTRUTIVO — Fluxo unificado de atendimento técnico
-- Ambiente: staging ikaauvsflpmamgxmkhoq (produção navfzbwgwzruipouyfnk PROIBIDA)
--
-- Estratégia (P0-5): rollback COMPATÍVEL.
--   * NÃO remove `registros_consultor.origem_atendimento` — os atendimentos
--     criados após a fase perderiam a origem. A coluna é aditiva e inofensiva.
--   * NÃO remove a assinatura evoluída de `rpc_criar_visita_idempotente`;
--     restaura o COMPORTAMENTO anterior (cultura obrigatória fora de
--     `ocorrencia_campo`) mantendo a assinatura e os grants, de modo que
--     nenhum chamador — online, offline ou externo — quebre.
--   * Remove apenas os objetos novos que não têm dependentes: as RPCs de
--     aceite/listagem/resumo.
--
-- Executável de ponta a ponta, sem instrução manual pendente.
-- Verificação: `verify-restoration.sql` (checksum incluso).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- GUARD FAIL-CLOSED DE STAGING — antes de qualquer DDL/DML.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_marker text;
  v_ref    text;
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging inexistente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref
    FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v_marker IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: nenhuma linha marker=STAGING';
  END IF;
  IF v_ref = c_prod THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente de PRODUCAO (%) — proibido', c_prod;
  END IF;
  IF v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: project_ref % != staging autorizado %', coalesce(v_ref,'<null>'), c_expected;
  END IF;
  IF EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE project_ref = c_prod) THEN
    RAISE EXCEPTION 'GUARD_ABORT: marker contem ref de PRODUCAO';
  END IF;
  RAISE NOTICE 'GUARD_OK: staging % autorizado', c_expected;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1) RPCs introduzidas pela fase (sem dependentes no banco).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_resumo_atendimentos_tecnicos_v1();
DROP FUNCTION IF EXISTS public.rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer);
DROP FUNCTION IF EXISTS public.rpc_iniciar_atendimento_solicitacao_v1(uuid,uuid);

-- ---------------------------------------------------------------------------
-- 2) Motor único: restaura o COMPORTAMENTO anterior preservando a assinatura,
--    grants, owner, comment e search_path. Sem DROP → sem quebra de chamadores.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_criar_visita_idempotente(
  p_client_uuid uuid,
  p_cliente_id uuid,
  p_fazenda_id uuid,
  p_talhao_id uuid,
  p_cultura_id uuid DEFAULT NULL::uuid,
  p_data_vistoria date DEFAULT CURRENT_DATE,
  p_tipo_visita tipo_visita DEFAULT 'vistoria_inicial'::tipo_visita,
  p_objetivo_visita text DEFAULT NULL::text,
  p_safra text DEFAULT NULL::text,
  p_fase_fenologica text DEFAULT NULL::text,
  p_solicitacao_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT 'visita_avulsa'::text,
  p_categoria_problema categoria_problema_consultor DEFAULT NULL::categoria_problema_consultor,
  p_nivel_pressao nivel_pressao DEFAULT NULL::nivel_pressao,
  p_percentual_area_afetada numeric DEFAULT NULL::numeric,
  p_urgencia urgencia_consultor DEFAULT NULL::urgencia_consultor,
  p_localizacao_na_area text DEFAULT NULL::text,
  p_observacoes_tecnicas text DEFAULT NULL::text,
  p_problema_principal text DEFAULT NULL::text,
  p_area_hectares numeric DEFAULT NULL::numeric,
  p_latitude numeric DEFAULT NULL::numeric,
  p_longitude numeric DEFAULT NULL::numeric,
  p_registro_origem_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.registros_consultor%ROWTYPE;
  v_new_id uuid;
  v_fazenda_cliente uuid;
  v_talhao_fazenda uuid;
  v_origem text := COALESCE(NULLIF(p_origem,''), 'visita_avulsa');
  v_natureza natureza_registro_consultor;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF v_origem NOT IN ('ocorrencia_campo','solicitacao_produtor','agenda','retorno_monitoramento','visita_avulsa') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_origin');
  END IF;

  v_natureza := CASE WHEN v_origem = 'ocorrencia_campo' THEN 'ocorrencia'::natureza_registro_consultor
                     ELSE 'visita'::natureza_registro_consultor END;

  IF p_client_uuid IS NULL OR p_cliente_id IS NULL OR p_fazenda_id IS NULL
     OR p_talhao_id IS NULL OR p_data_vistoria IS NULL OR p_tipo_visita IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  -- COMPORTAMENTO ANTERIOR restaurado
  IF p_cultura_id IS NULL AND v_origem <> 'ocorrencia_campo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  SELECT * INTO v_existing FROM public.registros_consultor
   WHERE client_uuid = p_client_uuid LIMIT 1;

  IF FOUND THEN
    IF v_existing.consultor_responsavel <> v_uid
       AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'created', false, 'idempotent', true,
      'registro_id', v_existing.id, 'client_uuid', v_existing.client_uuid,
      'status', v_existing.status::text, 'origem', v_existing.origem_atendimento,
      'version', v_existing.version,
      'can_edit', v_existing.status IN ('rascunho','em_andamento','reprovado'),
      'next_route', '/app/visita/' || v_existing.id::text,
      'pdf_status', v_existing.pdf_status);
  END IF;

  IF NOT public.has_active_user_cliente_access(v_uid, p_cliente_id, ARRAY['execute','manage']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'technical_access_required');
  END IF;

  SELECT cliente_id INTO v_fazenda_cliente FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_fazenda_cliente IS NULL OR v_fazenda_cliente <> p_cliente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_farm');
  END IF;

  SELECT fazenda_id INTO v_talhao_fazenda FROM public.talhoes WHERE id = p_talhao_id;
  IF v_talhao_fazenda IS NULL OR v_talhao_fazenda <> p_fazenda_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_plot');
  END IF;

  IF p_cultura_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.culturas WHERE id = p_cultura_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_crop');
  END IF;

  IF p_solicitacao_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.portal_solicitacoes
                    WHERE id = p_solicitacao_id AND cliente_id = p_cliente_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
    END IF;
  END IF;

  INSERT INTO public.registros_consultor (
    client_uuid, cliente_id, fazenda_id, talhao_id, cultura_id,
    data_vistoria, tipo_visita, objetivo_visita, safra, fase_fenologica,
    solicitacao_id, registro_origem_id, origem_atendimento,
    categoria_problema, nivel_pressao, percentual_area_afetada, urgencia,
    localizacao_na_area, observacoes_tecnicas, problema_principal,
    area_hectares, latitude, longitude, consultor_responsavel, created_by,
    natureza_registro, status, version, pdf_status
  ) VALUES (
    p_client_uuid, p_cliente_id, p_fazenda_id, p_talhao_id, p_cultura_id,
    p_data_vistoria, p_tipo_visita, p_objetivo_visita, p_safra, p_fase_fenologica,
    p_solicitacao_id, p_registro_origem_id, v_origem,
    p_categoria_problema, COALESCE(p_nivel_pressao,'medio'), p_percentual_area_afetada,
    COALESCE(p_urgencia,'media'), p_localizacao_na_area, p_observacoes_tecnicas,
    p_problema_principal, p_area_hectares, p_latitude, p_longitude,
    v_uid, v_uid, v_natureza, 'rascunho', 1, 'pending')
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true, 'created', true, 'idempotent', false,
    'registro_id', v_new_id, 'client_uuid', p_client_uuid,
    'status', 'rascunho', 'origem', v_origem, 'version', 1,
    'can_edit', true, 'next_route', '/app/visita/' || v_new_id::text,
    'pdf_status', 'pending');

EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.registros_consultor
     WHERE client_uuid = p_client_uuid LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true, 'created', false, 'idempotent', true,
        'registro_id', v_existing.id, 'status', v_existing.status::text,
        'version', v_existing.version,
        'next_route', '/app/visita/' || v_existing.id::text);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
END;
$function$;

-- Grants/owner/comment explícitos por assinatura (idempotentes).
ALTER FUNCTION public.rpc_criar_visita_idempotente(
  uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,
  text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,
  text,text,text,numeric,numeric,numeric,uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rpc_criar_visita_idempotente(
  uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,
  text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,
  text,text,text,numeric,numeric,numeric,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_criar_visita_idempotente(
  uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,
  text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,
  text,text,text,numeric,numeric,numeric,uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_criar_visita_idempotente(
  uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,
  text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,
  text,text,text,numeric,numeric,numeric,uuid)
IS 'ROLLBACK aplicado: comportamento pre-fase (cultura obrigatoria fora de ocorrencia_campo). Assinatura e grants preservados.';

-- ---------------------------------------------------------------------------
-- 3) is_visit_responsible — restaura EXATAMENTE a definição pré-fase
--    (origem: migration 20260717223135). Owner/grants/search_path explícitos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_visit_responsible(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registros_consultor
    WHERE id = p_registro_id AND consultor_profile_id = p_user_id
  )
$$;

ALTER FUNCTION public.is_visit_responsible(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_visit_responsible(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_visit_responsible(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_visit_responsible(uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.is_visit_responsible(uuid,uuid)
IS 'ROLLBACK aplicado: definicao pre-fase (comparacao direta com consultor_profile_id).';

-- ---------------------------------------------------------------------------
-- 4) PRESERVAÇÃO DE DADOS
--    A coluna `origem_atendimento`, seu CHECK e os índices permanecem.
--    Nenhum DROP COLUMN / DELETE é executado.
-- ---------------------------------------------------------------------------

COMMIT;

