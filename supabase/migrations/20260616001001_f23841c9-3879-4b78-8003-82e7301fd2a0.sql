
-- =========================================================
-- FASE 13.5 — Relatórios Executivos (AR Bio)
-- =========================================================

-- 1) Tabela executivo_relatorios
CREATE TABLE IF NOT EXISTS public.executivo_relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'gerado',
  periodo_inicio date,
  periodo_fim date,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  indicadores jsonb NOT NULL DEFAULT '{}'::jsonb,
  gargalos jsonb NOT NULL DEFAULT '[]'::jsonb,
  plano_acao jsonb NOT NULL DEFAULT '[]'::jsonb,
  ranking_clientes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ranking_fazendas jsonb NOT NULL DEFAULT '[]'::jsonb,
  alertas jsonb NOT NULL DEFAULT '[]'::jsonb,
  gerado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  observacoes text,
  hash_conteudo text,
  versao integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT executivo_relatorios_tipo_chk CHECK (tipo IN (
    'resumo_geral','operacional','financeiro','clientes_fazendas',
    'alertas_acoes','completo','diretoria','reuniao_semanal','reuniao_mensal'
  )),
  CONSTRAINT executivo_relatorios_status_chk CHECK (status IN (
    'gerado','arquivado','cancelado'
  ))
);

GRANT SELECT, INSERT, UPDATE ON public.executivo_relatorios TO authenticated;
GRANT ALL ON public.executivo_relatorios TO service_role;

ALTER TABLE public.executivo_relatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executivos podem ver relatórios"
  ON public.executivo_relatorios FOR SELECT
  TO authenticated
  USING (public.is_executivo(auth.uid()));

CREATE POLICY "Executivos podem inserir relatórios"
  ON public.executivo_relatorios FOR INSERT
  TO authenticated
  WITH CHECK (public.is_executivo(auth.uid()));

CREATE POLICY "Executivos podem atualizar relatórios"
  ON public.executivo_relatorios FOR UPDATE
  TO authenticated
  USING (public.is_executivo(auth.uid()))
  WITH CHECK (public.is_executivo(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_exec_relatorios_tipo ON public.executivo_relatorios(tipo);
CREATE INDEX IF NOT EXISTS idx_exec_relatorios_status ON public.executivo_relatorios(status);
CREATE INDEX IF NOT EXISTS idx_exec_relatorios_gerado_por ON public.executivo_relatorios(gerado_por);
CREATE INDEX IF NOT EXISTS idx_exec_relatorios_gerado_em ON public.executivo_relatorios(gerado_em DESC);
CREATE INDEX IF NOT EXISTS idx_exec_relatorios_periodo ON public.executivo_relatorios(periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_exec_relatorios_ativo ON public.executivo_relatorios(ativo);

-- 2) Tabela executivo_relatorio_eventos
CREATE TABLE IF NOT EXISTS public.executivo_relatorio_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relatorio_id uuid NOT NULL REFERENCES public.executivo_relatorios(id) ON DELETE CASCADE,
  evento text NOT NULL,
  descricao text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exec_relatorio_eventos_evento_chk CHECK (evento IN (
    'gerado','visualizado','exportado_pdf','exportado_csv',
    'arquivado','cancelado','erro_exportacao'
  ))
);

GRANT SELECT, INSERT ON public.executivo_relatorio_eventos TO authenticated;
GRANT ALL ON public.executivo_relatorio_eventos TO service_role;

ALTER TABLE public.executivo_relatorio_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executivos podem ver eventos de relatório"
  ON public.executivo_relatorio_eventos FOR SELECT
  TO authenticated
  USING (public.is_executivo(auth.uid()));

CREATE POLICY "Executivos podem inserir eventos de relatório"
  ON public.executivo_relatorio_eventos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_executivo(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_exec_rel_eventos_relatorio ON public.executivo_relatorio_eventos(relatorio_id);
CREATE INDEX IF NOT EXISTS idx_exec_rel_eventos_created ON public.executivo_relatorio_eventos(created_at DESC);

-- 3) Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.exec_relatorios_set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exec_relatorios_atualizado_em ON public.executivo_relatorios;
CREATE TRIGGER trg_exec_relatorios_atualizado_em
  BEFORE UPDATE ON public.executivo_relatorios
  FOR EACH ROW EXECUTE FUNCTION public.exec_relatorios_set_atualizado_em();

-- =========================================================
-- RPCs
-- =========================================================

-- 4) Gerar relatório
CREATE OR REPLACE FUNCTION public.rpc_executivo_gerar_relatorio(
  p_tipo text,
  p_filtros jsonb DEFAULT '{}'::jsonb,
  p_titulo text DEFAULT NULL
)
RETURNS public.executivo_relatorios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_periodo text;
  v_dias int;
  v_periodo_inicio date;
  v_periodo_fim date := CURRENT_DATE;
  v_resumo jsonb := '{}'::jsonb;
  v_indicadores jsonb := '{}'::jsonb;
  v_gargalos jsonb := '[]'::jsonb;
  v_plano jsonb := '[]'::jsonb;
  v_rank_clientes jsonb := '[]'::jsonb;
  v_rank_fazendas jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_titulo text;
  v_hash text;
  v_rec public.executivo_relatorios;
  v_incluir_plano boolean := COALESCE((v_filtros->>'incluir_plano_acao')::boolean, true);
  v_incluir_rankings boolean := COALESCE((v_filtros->>'incluir_rankings')::boolean, true);
  v_incluir_alertas boolean := COALESCE((v_filtros->>'incluir_alertas_criticos')::boolean, true);
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

  -- período default por tipo
  v_periodo := v_filtros->>'periodo';
  IF p_tipo = 'reuniao_semanal' AND v_periodo IS NULL THEN
    v_dias := 7;
  ELSIF p_tipo = 'reuniao_mensal' AND v_periodo IS NULL THEN
    v_dias := 30;
  ELSE
    v_dias := CASE COALESCE(v_periodo,'30_dias')
      WHEN '7_dias' THEN 7
      WHEN '30_dias' THEN 30
      WHEN '90_dias' THEN 90
      WHEN '180_dias' THEN 180
      WHEN '365_dias' THEN 365
      ELSE 30
    END;
  END IF;
  v_periodo_inicio := CURRENT_DATE - (v_dias || ' days')::interval;

  -- garantir filtros tem período coerente
  v_filtros := v_filtros || jsonb_build_object(
    'periodo', COALESCE(v_periodo, CASE v_dias WHEN 7 THEN '7_dias' WHEN 30 THEN '30_dias' WHEN 90 THEN '90_dias' WHEN 180 THEN '180_dias' WHEN 365 THEN '365_dias' ELSE '30_dias' END)
  );

  -- coletar seções conforme tipo
  IF p_tipo IN ('resumo_geral','operacional','completo','diretoria','reuniao_semanal','reuniao_mensal') THEN
    BEGIN v_resumo := COALESCE(public.rpc_executivo_resumo_geral(v_filtros), '{}'::jsonb); EXCEPTION WHEN OTHERS THEN v_resumo := jsonb_build_object('erro', SQLERRM); END;
    BEGIN v_gargalos := COALESCE(public.rpc_executivo_gargalos(v_filtros, 20), '[]'::jsonb); EXCEPTION WHEN OTHERS THEN v_gargalos := '[]'::jsonb; END;
  END IF;

  IF p_tipo IN ('financeiro','completo','diretoria','reuniao_mensal') THEN
    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'financeiro', COALESCE(public.rpc_executivo_financeiro_resumo(v_filtros), '{}'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN v_indicadores := v_indicadores || jsonb_build_object('financeiro_erro', SQLERRM); END;
    BEGIN
      v_gargalos := v_gargalos || COALESCE(public.rpc_executivo_financeiro_gargalos(v_filtros, 20), '[]'::jsonb);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    IF v_incluir_rankings THEN
      BEGIN
        v_rank_clientes := COALESCE(public.rpc_executivo_financeiro_ranking_clientes(v_filtros, 10), '[]'::jsonb);
      EXCEPTION WHEN OTHERS THEN v_rank_clientes := '[]'::jsonb; END;
    END IF;
  END IF;

  IF p_tipo IN ('clientes_fazendas','completo','diretoria','reuniao_mensal') THEN
    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'clientes', COALESCE(public.rpc_executivo_clientes_resumo(v_filtros), '{}'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN v_indicadores := v_indicadores || jsonb_build_object('clientes_erro', SQLERRM); END;
    IF v_incluir_rankings THEN
      BEGIN
        DECLARE v_ranks jsonb;
        BEGIN
          v_ranks := COALESCE(public.rpc_executivo_clientes_ranking(v_filtros, 10), '{}'::jsonb);
          IF jsonb_typeof(v_ranks) = 'object' THEN
            v_rank_clientes := COALESCE(v_ranks->'clientes', v_rank_clientes);
            v_rank_fazendas := COALESCE(v_ranks->'fazendas', v_rank_fazendas);
          END IF;
        END;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  IF p_tipo IN ('alertas_acoes','completo','diretoria','resumo_geral','reuniao_semanal','reuniao_mensal') THEN
    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'alertas', COALESCE(public.rpc_executivo_alertas_resumo(v_filtros), '{}'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN v_indicadores := v_indicadores || jsonb_build_object('alertas_erro', SQLERRM); END;
    IF v_incluir_alertas THEN
      BEGIN
        v_alertas := COALESCE(public.rpc_executivo_alertas_prioridades(v_filtros, 20), '[]'::jsonb);
      EXCEPTION WHEN OTHERS THEN v_alertas := '[]'::jsonb; END;
    END IF;
    IF v_incluir_plano THEN
      BEGIN
        v_plano := COALESCE(public.rpc_executivo_plano_acao(v_filtros, 20), '[]'::jsonb);
      EXCEPTION WHEN OTHERS THEN v_plano := '[]'::jsonb; END;
    END IF;
    BEGIN
      v_indicadores := v_indicadores || jsonb_build_object(
        'responsaveis_pendencias', COALESCE(public.rpc_executivo_responsaveis_pendencias(v_filtros, 20), '[]'::jsonb)
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- título default
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
    gerado_por, observacoes, hash_conteudo, versao, ativo
  ) VALUES (
    v_titulo, p_tipo, 'gerado', v_periodo_inicio, v_periodo_fim,
    v_filtros, v_resumo, v_indicadores, v_gargalos, v_plano,
    v_rank_clientes, v_rank_fazendas, v_alertas,
    v_uid, NULLIF(TRIM(v_filtros->>'observacoes'),''), v_hash, 1, true
  )
  RETURNING * INTO v_rec;

  INSERT INTO public.executivo_relatorio_eventos (relatorio_id, evento, descricao, user_id, metadata)
  VALUES (v_rec.id, 'gerado', 'Relatório gerado', v_uid, jsonb_build_object('tipo', p_tipo));

  RETURN v_rec;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_executivo_gerar_relatorio(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_gerar_relatorio(text, jsonb, text) TO authenticated;

-- 5) Listar relatórios
CREATE OR REPLACE FUNCTION public.rpc_executivo_listar_relatorios(
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid, titulo text, tipo text, status text,
  periodo_inicio date, periodo_fim date,
  gerado_por uuid, gerado_por_nome text, gerado_em timestamptz,
  observacoes text, versao integer, ativo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_f jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_ativo boolean := COALESCE((v_f->>'ativo')::boolean, true);
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.titulo, r.tipo, r.status,
    r.periodo_inicio, r.periodo_fim,
    r.gerado_por,
    COALESCE(p.nome_completo, p.email, 'Usuário')::text AS gerado_por_nome,
    r.gerado_em, r.observacoes, r.versao, r.ativo
  FROM public.executivo_relatorios r
  LEFT JOIN public.profiles p ON p.user_id = r.gerado_por
  WHERE r.ativo = v_ativo
    AND (v_f->>'tipo' IS NULL OR r.tipo = v_f->>'tipo')
    AND (v_f->>'status' IS NULL OR r.status = v_f->>'status')
    AND (v_f->>'data_inicio' IS NULL OR r.gerado_em::date >= (v_f->>'data_inicio')::date)
    AND (v_f->>'data_fim' IS NULL OR r.gerado_em::date <= (v_f->>'data_fim')::date)
    AND (v_f->>'gerado_por' IS NULL OR r.gerado_por = (v_f->>'gerado_por')::uuid)
    AND (v_f->>'texto' IS NULL OR r.titulo ILIKE '%' || (v_f->>'texto') || '%')
  ORDER BY r.gerado_em DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_executivo_listar_relatorios(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_listar_relatorios(jsonb) TO authenticated;

-- 6) Obter relatório
CREATE OR REPLACE FUNCTION public.rpc_executivo_obter_relatorio(p_relatorio_id uuid)
RETURNS public.executivo_relatorios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.executivo_relatorios;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT * INTO v_rec FROM public.executivo_relatorios WHERE id = p_relatorio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;
  INSERT INTO public.executivo_relatorio_eventos (relatorio_id, evento, descricao, user_id)
  VALUES (p_relatorio_id, 'visualizado', 'Relatório visualizado', v_uid);
  RETURN v_rec;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_executivo_obter_relatorio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_obter_relatorio(uuid) TO authenticated;

-- 7) Arquivar relatório
CREATE OR REPLACE FUNCTION public.rpc_executivo_arquivar_relatorio(
  p_relatorio_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS public.executivo_relatorios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec public.executivo_relatorios;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  UPDATE public.executivo_relatorios
  SET status = 'arquivado', ativo = false
  WHERE id = p_relatorio_id
  RETURNING * INTO v_rec;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;
  INSERT INTO public.executivo_relatorio_eventos (relatorio_id, evento, descricao, user_id, metadata)
  VALUES (p_relatorio_id, 'arquivado', COALESCE(p_motivo,'Arquivado'), v_uid, jsonb_build_object('motivo', p_motivo));
  RETURN v_rec;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_executivo_arquivar_relatorio(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_arquivar_relatorio(uuid, text) TO authenticated;

-- 8) Registrar evento de exportação
CREATE OR REPLACE FUNCTION public.rpc_executivo_exportar_relatorio_evento(
  p_relatorio_id uuid,
  p_tipo_exportacao text
)
RETURNS public.executivo_relatorio_eventos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_evento text;
  v_rec public.executivo_relatorio_eventos;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  v_evento := CASE lower(COALESCE(p_tipo_exportacao,''))
    WHEN 'pdf' THEN 'exportado_pdf'
    WHEN 'print' THEN 'exportado_pdf'
    WHEN 'csv' THEN 'exportado_csv'
    ELSE NULL
  END;
  IF v_evento IS NULL THEN
    RAISE EXCEPTION 'Tipo de exportação inválido: %', p_tipo_exportacao;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.executivo_relatorios WHERE id = p_relatorio_id) THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;
  INSERT INTO public.executivo_relatorio_eventos (relatorio_id, evento, descricao, user_id, metadata)
  VALUES (p_relatorio_id, v_evento, 'Exportação registrada', v_uid, jsonb_build_object('tipo', p_tipo_exportacao))
  RETURNING * INTO v_rec;
  RETURN v_rec;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_executivo_exportar_relatorio_evento(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_exportar_relatorio_evento(uuid, text) TO authenticated;
