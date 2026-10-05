CREATE SCHEMA IF NOT EXISTS platform_private;

CREATE OR REPLACE FUNCTION platform_private.current_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT p.organization_id
    INTO v_organization_id
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
     AND p.ativo = true
     AND p.organization_id IS NOT NULL;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização ativa não encontrada' USING ERRCODE = '42501';
  END IF;

  RETURN v_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION platform_private.current_user_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_private.current_user_organization_id() FROM anon;
REVOKE ALL ON FUNCTION platform_private.current_user_organization_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION platform_private.current_user_organization_id() TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_executivo_resumo_geral(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_tz text := 'America/Sao_Paulo';
  v_periodo text := COALESCE(p_filtros->>'periodo', '30_dias');
  v_data_inicio timestamptz;
  v_data_fim timestamptz := now();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_resumo jsonb := '{}'::jsonb;
  v_indisp text[] := ARRAY[
    'solicitacoes_abertas','solicitacoes_criticas','visitas_pendentes','visitas_atrasadas',
    'checkins_hoje','visitas_hoje','recomendacoes_pendentes','os_ativas','os_abertas',
    'os_atrasadas','lotes_em_producao','cq_pendente','envases_pendentes',
    'embalagens_em_estoque','embalagens_sem_etiqueta','entregas_pendentes',
    'entregas_sem_comprovante','entregas_nao_faturadas','alertas_operacionais',
    'receita_recebida','sla_vencidos'
  ]::text[];
  v_clientes_ativos integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_org := platform_private.current_user_organization_id();

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.role IN ('administrador'::public.app_role, 'gestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE = '42501';
  END IF;

  IF v_cliente IS NOT NULL THEN
    RAISE EXCEPTION 'Filtro de cliente sem vínculo organizacional comprovado' USING ERRCODE = '42501';
  END IF;
  IF v_fazenda IS NOT NULL THEN
    RAISE EXCEPTION 'Filtro de fazenda sem vínculo organizacional comprovado' USING ERRCODE = '42501';
  END IF;

  IF v_periodo = 'personalizado' THEN
    IF NULLIF(p_filtros->>'data_inicio','') IS NULL OR NULLIF(p_filtros->>'data_fim','') IS NULL THEN
      RAISE EXCEPTION 'Período personalizado exige data_inicio e data_fim' USING ERRCODE = '22023';
    END IF;
    v_data_inicio := (p_filtros->>'data_inicio')::timestamptz;
    v_data_fim := (p_filtros->>'data_fim')::timestamptz;
    IF v_data_inicio > v_data_fim THEN
      RAISE EXCEPTION 'data_inicio não pode ser maior que data_fim' USING ERRCODE = '22023';
    END IF;
  ELSIF v_periodo = 'hoje' THEN
    v_data_inicio := (v_hoje::timestamp) AT TIME ZONE v_tz;
  ELSIF v_periodo = '7_dias' THEN
    v_data_inicio := now() - interval '7 days';
  ELSIF v_periodo = '15_dias' THEN
    v_data_inicio := now() - interval '15 days';
  ELSIF v_periodo = 'safra_atual' THEN
    v_data_inicio := (date_trunc('year', v_hoje)::timestamp) AT TIME ZONE v_tz;
  ELSE
    v_data_inicio := now() - interval '30 days';
    v_periodo := '30_dias';
  END IF;

  -- Única fonte alcançável com organização comprovada nesta fase.
  SELECT count(*)
    INTO v_clientes_ativos
    FROM public.profiles p
   WHERE p.organization_id = v_org
     AND p.ativo = true
     AND p.cliente_id IS NOT NULL;

  v_resumo := jsonb_build_object('clientes_ativos', v_clientes_ativos);

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object(
      'data_inicio', v_data_inicio,
      'data_fim', v_data_fim,
      'periodo', v_periodo,
      'timezone', v_tz
    ),
    'resumo', v_resumo,
    'saude_operacional', jsonb_build_object(
      'score', 0,
      'classificacao', 'sem_dados',
      'motivos', jsonb_build_array('Fontes sem vínculo organizacional comprovado')
    ),
    'dados_indisponiveis', to_jsonb(v_indisp),
    'gerado_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_dashboard_geral_lab_resumo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_org := platform_private.current_user_organization_id();

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.role IN ('administrador'::public.app_role, 'gestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'resumo', '{}'::jsonb,
    'dados_indisponiveis', jsonb_build_array(
      'os_aguardando','lotes_producao','cq_pendente','envases_pendentes',
      'insumos_criticos','entregas_pendentes'
    ),
    'gerado_em', now(),
    'organization_scoped', v_org IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_dashboard_geral_lab_resumo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_dashboard_geral_lab_resumo() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_geral_lab_resumo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_geral_lab_resumo() TO service_role;

COMMENT ON FUNCTION platform_private.current_user_organization_id() IS
  'Deriva a organização exclusivamente da identidade autenticada e de um profile ativo; falha fechada sem vínculo.';
COMMENT ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) IS
  'Resumo da Visão Geral isolado por organização; fontes legadas sem vínculo tenant determinístico são indisponíveis.';
COMMENT ON FUNCTION public.rpc_dashboard_geral_lab_resumo() IS
  'Resumo laboratorial isolado por organização; fontes sem vínculo tenant determinístico são indisponíveis.';