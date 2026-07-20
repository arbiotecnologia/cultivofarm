
-- ============================================================================
-- Seed / fixtures de cenários de borda para o Cockpit do Laboratório
-- ----------------------------------------------------------------------------
-- Cenários gerados (numero_os começa com o prefixo, default 'FIXT'):
--   FIXT-001  demanda > produção   → status esperado: FALTA
--   FIXT-002  múltiplos lotes/micro → status esperado: OK
--   FIXT-003  vencimento parcial    → status esperado: FALTA (vencido > 0)
--   FIXT-004  excedente             → status esperado: EXCEDENTE
--   FIXT-005  aguardando envase     → status esperado: AGUARDANDO_ENVASE
-- Idempotente: apaga tudo com esse prefixo antes de recriar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_cockpit_fixtures(p_prefix text DEFAULT 'FIXT')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_fazenda_id uuid;
  v_talhao_id  uuid;
  v_micro_a    uuid;
  v_micro_b    uuid;

  v_os_id      uuid;
  v_prog_id    uuid;
  v_lote_id    uuid;

  v_os_ids     uuid[] := ARRAY[]::uuid[];
  v_lote_ct    int := 0;
  v_env_ct     int := 0;
  v_est_ct     int := 0;
BEGIN
  -- Somente administradores podem semear
  IF NOT public.has_role(auth.uid(), 'administrador'::app_role) THEN
    RAISE EXCEPTION 'apenas administradores podem executar seed_cockpit_fixtures';
  END IF;

  ---------------------------------------------------------------------------
  -- 1) Limpar fixtures anteriores (cascata manual: os → prog → lote → env/est)
  ---------------------------------------------------------------------------
  SELECT array_agg(id) INTO v_os_ids
    FROM public.ordens_servico
   WHERE numero_os LIKE p_prefix || '-%';

  IF v_os_ids IS NOT NULL AND array_length(v_os_ids, 1) > 0 THEN
    DELETE FROM public.estoque_produto
     WHERE lote_id IN (
       SELECT l.id FROM public.lotes l
        JOIN public.programacao_producao pp ON pp.id = l.programacao_id
       WHERE pp.ordem_servico_id = ANY(v_os_ids)
     );
    DELETE FROM public.envase
     WHERE lote_id IN (
       SELECT l.id FROM public.lotes l
        JOIN public.programacao_producao pp ON pp.id = l.programacao_id
       WHERE pp.ordem_servico_id = ANY(v_os_ids)
     );
    DELETE FROM public.lotes
     WHERE programacao_id IN (
       SELECT id FROM public.programacao_producao
        WHERE ordem_servico_id = ANY(v_os_ids)
     );
    DELETE FROM public.programacao_producao WHERE ordem_servico_id = ANY(v_os_ids);
    DELETE FROM public.ordens_servico WHERE id = ANY(v_os_ids);
  END IF;

  ---------------------------------------------------------------------------
  -- 2) Referências reutilizadas (cliente / fazenda / talhão / micros)
  ---------------------------------------------------------------------------
  SELECT c.id, f.id, t.id
    INTO v_cliente_id, v_fazenda_id, v_talhao_id
    FROM public.clientes c
    JOIN public.fazendas f ON f.cliente_id = c.id
    JOIN public.talhoes  t ON t.fazenda_id = f.id
   ORDER BY c.created_at
   LIMIT 1;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'seed_cockpit_fixtures: nenhum cliente/fazenda/talhão cadastrado para reutilizar';
  END IF;

  SELECT id INTO v_micro_a FROM public.microrganismos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_micro_b FROM public.microrganismos
    WHERE id <> v_micro_a ORDER BY created_at LIMIT 1;
  IF v_micro_b IS NULL THEN v_micro_b := v_micro_a; END IF;

  ---------------------------------------------------------------------------
  -- Helper local (via inline blocks): cada cenário cria OS + lê programacao
  -- auto-criada pelo trigger + insere lotes/envase/estoque.
  ---------------------------------------------------------------------------

  -- FIXT-001 · Demanda > produção (planejado 100 L, envasado 60 L)
  INSERT INTO public.ordens_servico
    (numero_os, origem, tipo_item, cliente_id, fazenda_id, talhao_id,
     microrganismo_id, volume_total_ml, area_hectares, data_programada,
     prioridade, status)
  VALUES
    (p_prefix || '-001', 'agronomica', 'microrganismo', v_cliente_id, v_fazenda_id, v_talhao_id,
     v_micro_a, 100000, 10, CURRENT_DATE, 'alta', 'aprovada')
  RETURNING id INTO v_os_id;

  SELECT id INTO v_prog_id FROM public.programacao_producao WHERE ordem_servico_id = v_os_id;

  INSERT INTO public.lotes
    (codigo_lote, programacao_id, microrganismo_id, volume_produzido, data_producao, status)
  VALUES
    (p_prefix || '-001-L1', v_prog_id, v_micro_a, 60, CURRENT_DATE, 'aprovado')
  RETURNING id INTO v_lote_id;
  v_lote_ct := v_lote_ct + 1;

  INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase)
  VALUES (v_lote_id, 'bombona_20L', 20000, 3, CURRENT_DATE);
  v_env_ct := v_env_ct + 1;

  INSERT INTO public.estoque_produto
    (lote_id, microrganismo_id, quantidade, volume_total, validade, status)
  VALUES
    (v_lote_id, v_micro_a, 3, 60, CURRENT_DATE + INTERVAL '180 days', 'disponivel');
  v_est_ct := v_est_ct + 1;

  -- FIXT-002 · Múltiplos lotes do mesmo micro (3 × 30 L = 90 L; planejado 90 L)
  INSERT INTO public.ordens_servico
    (numero_os, origem, tipo_item, cliente_id, fazenda_id, talhao_id,
     microrganismo_id, volume_total_ml, area_hectares, data_programada,
     prioridade, status)
  VALUES
    (p_prefix || '-002', 'agronomica', 'microrganismo', v_cliente_id, v_fazenda_id, v_talhao_id,
     v_micro_a, 90000, 9, CURRENT_DATE, 'media', 'aprovada')
  RETURNING id INTO v_os_id;

  SELECT id INTO v_prog_id FROM public.programacao_producao WHERE ordem_servico_id = v_os_id;

  FOR i IN 1..3 LOOP
    INSERT INTO public.lotes
      (codigo_lote, programacao_id, microrganismo_id, volume_produzido, data_producao, status)
    VALUES
      (p_prefix || '-002-L' || i, v_prog_id, v_micro_a, 30, CURRENT_DATE, 'aprovado')
    RETURNING id INTO v_lote_id;
    v_lote_ct := v_lote_ct + 1;

    INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase)
    VALUES (v_lote_id, 'bombona_20L', 20000, 1, CURRENT_DATE),
           (v_lote_id, 'bombona_5L',   5000, 2, CURRENT_DATE);
    v_env_ct := v_env_ct + 2;

    INSERT INTO public.estoque_produto
      (lote_id, microrganismo_id, quantidade, volume_total, validade, status)
    VALUES
      (v_lote_id, v_micro_a, 3, 30, CURRENT_DATE + INTERVAL '180 days', 'disponivel');
    v_est_ct := v_est_ct + 1;
  END LOOP;

  -- FIXT-003 · Vencimento parcial (envasado 100 L, 70 disponível + 30 vencido)
  INSERT INTO public.ordens_servico
    (numero_os, origem, tipo_item, cliente_id, fazenda_id, talhao_id,
     microrganismo_id, volume_total_ml, area_hectares, data_programada,
     prioridade, status)
  VALUES
    (p_prefix || '-003', 'agronomica', 'microrganismo', v_cliente_id, v_fazenda_id, v_talhao_id,
     v_micro_b, 100000, 10, CURRENT_DATE, 'alta', 'aprovada')
  RETURNING id INTO v_os_id;

  SELECT id INTO v_prog_id FROM public.programacao_producao WHERE ordem_servico_id = v_os_id;

  INSERT INTO public.lotes
    (codigo_lote, programacao_id, microrganismo_id, volume_produzido, data_producao, status)
  VALUES
    (p_prefix || '-003-L1', v_prog_id, v_micro_b, 100, CURRENT_DATE - INTERVAL '200 days', 'aprovado')
  RETURNING id INTO v_lote_id;
  v_lote_ct := v_lote_ct + 1;

  INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase)
  VALUES (v_lote_id, 'bombona_20L', 20000, 5, CURRENT_DATE - INTERVAL '200 days');
  v_env_ct := v_env_ct + 1;

  -- 70 L disponíveis (validade futura)
  INSERT INTO public.estoque_produto
    (lote_id, microrganismo_id, quantidade, volume_total, validade, status)
  VALUES
    (v_lote_id, v_micro_b, 3, 70, CURRENT_DATE + INTERVAL '30 days', 'disponivel');
  v_est_ct := v_est_ct + 1;

  -- 30 L vencidos (validade no passado → contam como "vencido" no hook)
  INSERT INTO public.estoque_produto
    (lote_id, microrganismo_id, quantidade, volume_total, validade, status)
  VALUES
    (v_lote_id, v_micro_b, 2, 30, CURRENT_DATE - INTERVAL '1 day', 'disponivel');
  v_est_ct := v_est_ct + 1;

  -- FIXT-004 · Excedente (planejado 50 L, envasado/disponível 100 L)
  INSERT INTO public.ordens_servico
    (numero_os, origem, tipo_item, cliente_id, fazenda_id, talhao_id,
     microrganismo_id, volume_total_ml, area_hectares, data_programada,
     prioridade, status)
  VALUES
    (p_prefix || '-004', 'agronomica', 'microrganismo', v_cliente_id, v_fazenda_id, v_talhao_id,
     v_micro_b, 50000, 5, CURRENT_DATE, 'baixa', 'aprovada')
  RETURNING id INTO v_os_id;

  SELECT id INTO v_prog_id FROM public.programacao_producao WHERE ordem_servico_id = v_os_id;

  INSERT INTO public.lotes
    (codigo_lote, programacao_id, microrganismo_id, volume_produzido, data_producao, status)
  VALUES
    (p_prefix || '-004-L1', v_prog_id, v_micro_b, 100, CURRENT_DATE, 'aprovado')
  RETURNING id INTO v_lote_id;
  v_lote_ct := v_lote_ct + 1;

  INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase)
  VALUES (v_lote_id, 'bombona_20L', 20000, 5, CURRENT_DATE);
  v_env_ct := v_env_ct + 1;

  INSERT INTO public.estoque_produto
    (lote_id, microrganismo_id, quantidade, volume_total, validade, status)
  VALUES
    (v_lote_id, v_micro_b, 5, 100, CURRENT_DATE + INTERVAL '180 days', 'disponivel');
  v_est_ct := v_est_ct + 1;

  -- FIXT-005 · Aguardando envase (lote produzido, sem envase)
  INSERT INTO public.ordens_servico
    (numero_os, origem, tipo_item, cliente_id, fazenda_id, talhao_id,
     microrganismo_id, volume_total_ml, area_hectares, data_programada,
     prioridade, status)
  VALUES
    (p_prefix || '-005', 'agronomica', 'microrganismo', v_cliente_id, v_fazenda_id, v_talhao_id,
     v_micro_a, 80000, 8, CURRENT_DATE, 'media', 'aprovada')
  RETURNING id INTO v_os_id;

  SELECT id INTO v_prog_id FROM public.programacao_producao WHERE ordem_servico_id = v_os_id;

  INSERT INTO public.lotes
    (codigo_lote, programacao_id, microrganismo_id, volume_produzido, data_producao, status)
  VALUES
    (p_prefix || '-005-L1', v_prog_id, v_micro_a, 80, CURRENT_DATE, 'em_producao');
  v_lote_ct := v_lote_ct + 1;

  RETURN jsonb_build_object(
    'os',      5,
    'lotes',   v_lote_ct,
    'envase',  v_env_ct,
    'estoque', v_est_ct,
    'prefix',  p_prefix
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_cockpit_fixtures(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.seed_cockpit_fixtures(text) TO authenticated;
