
CREATE OR REPLACE FUNCTION public.rpc_executivo_gerar_relatorio(
  p_tipo text,
  p_filtros jsonb DEFAULT '{}'::jsonb,
  p_titulo text DEFAULT NULL::text
)
RETURNS public.executivo_relatorios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_periodo text;
  v_dias int;
  v_periodo_inicio date;
  v_periodo_fim date := CURRENT_DATE;
  v_data_inicio text;
  v_data_fim text;
  v_resumo jsonb := '{}'::jsonb;
  v_indicadores jsonb := '{}'::jsonb;
  v_gargalos jsonb := '[]'::jsonb;
  v_gargalos_fin jsonb := '[]'::jsonb;
  v_plano jsonb := '[]'::jsonb;
  v_rank_clientes jsonb := '[]'::jsonb;
  v_rank_fazendas jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_titulo text;
  v_hash text;
  v_rec public.executivo_relatorios;
  v_payload jsonb;
  v_incluir_plano boolean := COALESCE((v_filtros->>'incluir_plano_acao')::boolean, true);
  v_incluir_rankings boolean := COALESCE((v_filtros->>'incluir_rankings')::boolean, true);
  v_incluir_alertas boolean := COALESCE((v_filtros->>'incluir_alertas_criticos')::boolean, true);
  v_obs_internas text := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores e gestores';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN (
    'resumo_geral','operacional','financeiro','clientes_fazendas',
    'alertas_acoes','completo','diretoria','reuniao_semanal','reuniao_mensal'
  ) THEN
    RAISE EXCEPTION 'Tipo de relatório inválido: %', p_tipo;
  END IF;

  v_periodo := NULLIF(v_filtros->>'periodo', '');
  v_data_inicio := NULLIF(v_filtros->>'data_inicio', '');
  v_data_fim := NULLIF(v_filtros->>'data_fim', '');

  IF v_periodo = 'personalizado' OR v_data_inicio IS NOT NULL OR v_data_fim IS NOT NULL THEN
    IF v_data_inicio IS NOT NULL AND v_data_fim IS NOT NULL THEN
      BEGIN
        v_periodo_inicio := v_data_inicio::date;
        v_periodo_fim := v_data_fim::date;
        v_periodo := 'personalizado';
      EXCEPTION WHEN OTHERS THEN
        v_periodo_inicio := CURRENT_DATE - INTERVAL '30 days';
        v_periodo_fim := CURRENT_DATE;
        v_periodo := '30_dias';
        v_obs_internas := 'datas personalizadas inválidas, fallback 30 dias';
      END;
    ELSE
      v_periodo_inicio := CURRENT_DATE - INTERVAL '30 days';
      v_periodo_fim := CURRENT_DATE;
      v_periodo := '30_dias';
      v_obs_internas := 'período personalizado sem datas, fallback 30 dias';
    END IF;
  ELSE
    IF p_tipo = 'reuniao_semanal' AND v_periodo IS NULL THEN
      v_dias := 7;
    ELSIF p_tipo = 'reuniao_mensal' AND v_periodo IS NULL THEN
      v_dias := 30;
    ELSE
      v_dias := CASE COALESCE(v_periodo,'30_dias')
        WHEN 'hoje' THEN 0
        WHEN '7_dias' THEN 7
        WHEN '15_dias' THEN 15
        WHEN '30_dias' THEN 30
        WHEN '90_dias' THEN 90
        WHEN '180_dias' THEN 180
        WHEN '365_dias' THEN 365
        WHEN 'safra_atual' THEN 180
        ELSE 30
      END;
    END IF;
    v_periodo_inicio := CURRENT_DATE - (v_dias || ' days')::interval;
    IF v_periodo IS NULL THEN
      v_periodo := CASE v_dias
        WHEN 0 THEN 'hoje' WHEN 7 THEN '7_dias' WHEN 15 THEN '15_dias'
        WHEN 30 THEN '30_dias' WHEN 90 THEN '90_dias'
        WHEN 180 THEN '180_dias' WHEN 365 THEN '365_dias' ELSE '30_dias' END;
    END IF;
  END IF;

  v_filtros := v_filtros || jsonb_build_object(
    'periodo', v_periodo,
    'data_inicio', to_char(v_periodo_inicio, 'YYYY-MM-DD'),
    'data_fim', to_char(v_periodo_fim, 'YYYY-MM-DD')
  );

  IF p_tipo IN ('resumo_geral','operacional','completo','diretoria','reuniao_semanal','reuniao_mensal') THEN
    BEGIN v_resumo := COALESCE(public.rpc_executivo_resumo_geral(v_filtros), '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN v_resumo := jsonb_build_object('erro', SQLERRM); END;

    BEGIN
      v_payload := public.rpc_executivo_gargalos(v_filtros, 20);
      v_gargalos := public.jsonb_get_array_safe(v_payload, 'gargalos');
    EXCEPTION WHEN OTHERS THEN v_gargalos := '[]'::jsonb; END;
  END IF;

  IF p_tipo IN ('financeiro','completo','diretoria','reuniao_mensal') THEN
    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'financeiro', COALESCE(public.rpc_executivo_financeiro_resumo(v_filtros), '{}'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN
      v_indicadores := v_indicadores || jsonb_build_object('financeiro_erro', SQLERRM);
    END;

    BEGIN
      v_payload := public.rpc_executivo_financeiro_gargalos(v_filtros, 20);
      v_gargalos_fin := public.jsonb_get_array_safe(v_payload, 'gargalos');
      v_gargalos := COALESCE(v_gargalos, '[]'::jsonb) || COALESCE(v_gargalos_fin, '[]'::jsonb);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    IF v_incluir_rankings THEN
      BEGIN
        v_payload := public.rpc_executivo_financeiro_ranking_clientes(v_filtros, 10);
        v_rank_clientes := public.jsonb_get_array_safe(v_payload, 'ranking');
      EXCEPTION WHEN OTHERS THEN v_rank_clientes := '[]'::jsonb; END;
    END IF;
  END IF;

  IF p_tipo IN ('clientes_fazendas','completo','diretoria','reuniao_mensal') THEN
    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'clientes', COALESCE(public.rpc_executivo_clientes_resumo(v_filtros), '{}'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN
      v_indicadores := v_indicadores || jsonb_build_object('clientes_erro', SQLERRM);
    END;

    IF v_incluir_rankings THEN
      BEGIN
        v_payload := public.rpc_executivo_clientes_ranking(v_filtros, 10);
        v_rank_clientes := public.jsonb_get_array_safe(v_payload, 'ranking_clientes');
        v_rank_fazendas := public.jsonb_get_array_safe(v_payload, 'ranking_fazendas');
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  IF p_tipo IN ('alertas_acoes','completo','diretoria','resumo_geral','reuniao_semanal','reuniao_mensal') THEN
    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'alertas', COALESCE(public.rpc_executivo_alertas_resumo(v_filtros), '{}'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN
      v_indicadores := v_indicadores || jsonb_build_object('alertas_erro', SQLERRM);
    END;

    IF v_incluir_alertas THEN
      BEGIN
        v_payload := public.rpc_executivo_alertas_prioridades(v_filtros, 20);
        v_alertas := public.jsonb_get_array_safe(v_payload, 'prioridades');
      EXCEPTION WHEN OTHERS THEN v_alertas := '[]'::jsonb; END;
    END IF;

    IF v_incluir_plano THEN
      BEGIN
        v_payload := public.rpc_executivo_plano_acao(v_filtros, 20);
        v_plano := public.jsonb_get_array_safe(v_payload, 'acoes');
      EXCEPTION WHEN OTHERS THEN v_plano := '[]'::jsonb; END;
    END IF;

    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'responsaveis_pendencias',
        COALESCE(public.rpc_executivo_responsaveis_pendencias(v_filtros, 20), '{}'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  v_titulo := COALESCE(NULLIF(TRIM(p_titulo), ''),
    CASE p_tipo
      WHEN 'resumo_geral' THEN 'Resumo Geral'
      WHEN 'operacional' THEN 'Relatório Operacional'
      WHEN 'financeiro' THEN 'Relatório Financeiro'
      WHEN 'clientes_fazendas' THEN 'Clientes & Fazendas'
      WHEN 'alertas_acoes' THEN 'Alertas & Ações'
      WHEN 'completo' THEN 'Relatório Completo'
      WHEN 'diretoria' THEN 'Relatório de Diretoria'
      WHEN 'reuniao_semanal' THEN 'Reunião Semanal'
      WHEN 'reuniao_mensal' THEN 'Reunião Mensal'
    END || ' — ' || to_char(CURRENT_DATE, 'DD/MM/YYYY')
  );

  v_hash := md5(jsonb_build_object(
    'tipo', p_tipo, 'filtros', v_filtros, 'resumo', v_resumo,
    'indicadores', v_indicadores, 'gargalos', v_gargalos,
    'plano', v_plano, 'rank_c', v_rank_clientes, 'rank_f', v_rank_fazendas,
    'alertas', v_alertas
  )::text);

  INSERT INTO public.executivo_relatorios (
    titulo, tipo, status, periodo_inicio, periodo_fim,
    filtros, resumo, indicadores, gargalos, plano_acao,
    ranking_clientes, ranking_fazendas, alertas,
    gerado_por, observacoes, hash_conteudo, versao, ativo, metadata
  ) VALUES (
    v_titulo, p_tipo, 'gerado', v_periodo_inicio, v_periodo_fim,
    v_filtros, v_resumo, v_indicadores, v_gargalos, v_plano,
    v_rank_clientes, v_rank_fazendas, v_alertas,
    v_uid, NULLIF(TRIM(v_filtros->>'observacoes'),''), v_hash, 1, true,
    CASE WHEN v_obs_internas IS NOT NULL
      THEN jsonb_build_object('obs_internas', v_obs_internas)
      ELSE '{}'::jsonb END
  )
  RETURNING * INTO v_rec;

  -- Evento gerado (usa colunas reais: descricao + metadata)
  INSERT INTO public.executivo_relatorio_eventos (relatorio_id, evento, descricao, user_id, metadata)
  VALUES (v_rec.id, 'gerado', 'Relatório gerado', v_uid, jsonb_build_object('tipo', p_tipo));

  RETURN v_rec;
END;
$function$;
