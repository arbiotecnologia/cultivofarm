-- PREPARADO, NÃO APLICADO.
-- Alvo: Supabase CultivoFarm swzpzcwiasxmjutrmvkm.
-- Definir na mesma sessão: SET app.audit_target_ref = 'swzpzcwiasxmjutrmvkm';
-- Gate operacional: não comprova identidade do host, apenas exige confirmação explícita.
-- Sem CASCADE, sem TRUNCATE, sem DROP destrutivo, sem DML em dados existentes.
-- Reexecutável (CREATE OR REPLACE + REVOKE/GRANT idempotentes).

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
  IF current_setting('app.audit_target_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'lotes_target_not_confirmed';
  END IF;

  -- Pré-condições estruturais (não corrigimos nada automaticamente).
  IF to_regclass('public.lotes') IS NULL THEN
    RAISE EXCEPTION 'lotes_tabela_ausente';
  END IF;
  IF to_regclass('public.programacao_producao') IS NULL THEN
    RAISE EXCEPTION 'lotes_programacao_tabela_ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gerar_codigo_lote'
  ) THEN
    RAISE EXCEPTION 'lotes_funcao_codigo_ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_cockpit_gerar_lote_v1'
       AND pg_get_function_identity_arguments(p.oid) = 'p_programacao_id uuid, p_os_id uuid, p_origem text, p_lote jsonb'
  ) THEN
    RAISE EXCEPTION 'lotes_rpc_assinatura_divergente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_cockpit_assert_operador_origem'
  ) THEN
    RAISE EXCEPTION 'lotes_funcao_papel_ausente';
  END IF;
  -- Unicidade de codigo_lote é requisito do mecanismo; abortar se não existir.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE i.indrelid = 'public.lotes'::regclass
       AND i.indisunique
       AND pg_get_indexdef(i.indexrelid) LIKE '%(codigo_lote)%'
       AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'lotes_unique_codigo_ausente';
  END IF;
  -- Unicidade por programação sustenta a idempotência; abortar se não existir.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
     WHERE i.indrelid = 'public.lotes'::regclass
       AND i.indisunique
       AND pg_get_indexdef(i.indexrelid) LIKE '%(programacao_id)%'
  ) THEN
    RAISE EXCEPTION 'lotes_unique_programacao_ausente';
  END IF;
END $guard$;

-- 1) Sequenciamento seguro contra concorrência: advisory lock transacional por ano.
--    Padrão LT-YYYY-NNNN preservado. SECURITY DEFINER com search_path fixo.
CREATE OR REPLACE FUNCTION public.gerar_codigo_lote(_ano integer DEFAULT EXTRACT(YEAR FROM now())::int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix text := 'LT-' || _ano::text || '-';
  v_next int;
BEGIN
  IF _ano IS NULL THEN
    RAISE EXCEPTION 'LOTE_ANO_INVALIDO';
  END IF;

  -- Serializa o cálculo sequencial por ano dentro da transação chamadora.
  PERFORM pg_advisory_xact_lock(hashtext('gerar_codigo_lote:' || _ano::text));

  SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(codigo_lote, '-', 3), '\D', '', 'g'), '')::int), 0) + 1
    INTO v_next
    FROM public.lotes
   WHERE codigo_lote LIKE v_prefix || '%';

  RETURN v_prefix || lpad(v_next::text, 4, '0');
END;
$$;

-- Privilégio mínimo: função interna, chamada apenas pela RPC SECURITY DEFINER
-- (que executa como proprietária). Nenhum papel de aplicação recebe EXECUTE.
REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM anon;
REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM authenticated;

-- 2) RPC do Cockpit: assinatura inalterada. O navegador não define código,
--    produto nem microrganismo; tudo é derivado da programação bloqueada.
CREATE OR REPLACE FUNCTION public.rpc_cockpit_gerar_lote_v1(
  p_programacao_id uuid,
  p_os_id uuid,
  p_origem text,
  p_lote jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_prog record;
  v_existente record;
  v_id uuid;
  v_codigo text;
  v_volume numeric;
  v_tentativa int := 0;
  v_constraint text;
  v_indexdef text;
BEGIN
  -- (a) autenticação/papel e normalização da origem
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);
  IF p_programacao_id IS NULL OR p_os_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_PARAMS_INVALIDOS';
  END IF;

  -- (b) payload precisa ser objeto JSON e não pode trazer código do cliente
  IF p_lote IS NULL OR jsonb_typeof(p_lote) <> 'object' THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_PAYLOAD_INVALIDO';
  END IF;
  IF nullif(p_lote->>'codigo_lote', '') IS NOT NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_CODIGO_NAO_ACEITO';
  END IF;

  -- (c) lock por programação
  PERFORM pg_advisory_xact_lock(hashtext('cockpit_lote:' || p_programacao_id::text));

  -- (d) carrega a programação bloqueada
  SELECT id, ordem_servico_id, ordem_servico_onfarm_id, produto_id, microrganismo_id
    INTO v_prog
    FROM public.programacao_producao
   WHERE id = p_programacao_id
     FOR UPDATE;
  IF v_prog.id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_PROGRAMACAO_NAO_ENCONTRADA';
  END IF;

  -- (e) vínculo programação <-> OS, sem ambiguidade
  IF v_prog.ordem_servico_id IS NOT NULL AND v_prog.ordem_servico_onfarm_id IS NOT NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_AMBIGUO';
  END IF;
  IF v_origem = 'onfarm' THEN
    IF v_prog.ordem_servico_id IS NOT NULL THEN
      RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_AMBIGUO';
    END IF;
    IF v_prog.ordem_servico_onfarm_id IS DISTINCT FROM p_os_id THEN
      RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_INVALIDO';
    END IF;
  ELSE
    IF v_prog.ordem_servico_onfarm_id IS NOT NULL THEN
      RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_AMBIGUO';
    END IF;
    IF v_prog.ordem_servico_id IS DISTINCT FROM p_os_id THEN
      RAISE EXCEPTION 'COCKPIT_LOTE_VINCULO_INVALIDO';
    END IF;
  END IF;

  -- (f) replay idempotente por programação
  SELECT id, codigo_lote INTO v_existente
    FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
  IF v_existente.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true,
      'lote_id', v_existente.id, 'codigo_lote', v_existente.codigo_lote,
      'message', format('Lote %s ja existe para esta programacao.', v_existente.codigo_lote));
  END IF;

  -- (g) item canônico derivado apenas da programação
  IF v_prog.produto_id IS NULL AND v_prog.microrganismo_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_ITEM_CANONICO_AUSENTE';
  END IF;

  -- (h) volume obrigatório, numérico, finito e estritamente positivo.
  --     Divergência em relação ao planejado continua permitida.
  BEGIN
    v_volume := nullif(p_lote->>'volume_produzido','')::numeric;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_VOLUME_INVALIDO';
  END;
  IF v_volume IS NULL OR NOT (v_volume > 0) OR v_volume = 'NaN'::numeric THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_VOLUME_INVALIDO';
  END IF;

  -- (i) código interno + insert
  LOOP
    v_tentativa := v_tentativa + 1;
    v_codigo := public.gerar_codigo_lote(EXTRACT(YEAR FROM now())::int);
    BEGIN
      INSERT INTO public.lotes (
        programacao_id, codigo_lote, produto_id, microrganismo_id,
        volume_produzido, data_producao, responsavel_producao, tanque, observacoes_tecnicas
      ) VALUES (
        p_programacao_id, v_codigo,
        v_prog.produto_id,
        v_prog.microrganismo_id,
        v_volume,
        coalesce(nullif(p_lote->>'data_producao','')::date, CURRENT_DATE),
        nullif(p_lote->>'responsavel_producao',''),
        nullif(p_lote->>'tanque',''),
        nullif(p_lote->>'observacoes_tecnicas','')
      ) RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Nunca mascarar erro estrutural como conflito de código.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      SELECT pg_get_indexdef(c.oid) INTO v_indexdef
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v_constraint AND c.relkind = 'i';

      IF v_indexdef IS NOT NULL AND v_indexdef LIKE '%(programacao_id)%' THEN
        SELECT id, codigo_lote INTO v_existente
          FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
        IF v_existente.id IS NULL THEN
          RAISE;
        END IF;
        RETURN jsonb_build_object('success', true, 'replay', true,
          'lote_id', v_existente.id, 'codigo_lote', v_existente.codigo_lote,
          'message', format('Lote %s ja existe para esta programacao.', v_existente.codigo_lote));
      ELSIF v_indexdef IS NOT NULL AND v_indexdef LIKE '%(codigo_lote)%' THEN
        IF v_tentativa >= 3 THEN
          RAISE EXCEPTION 'COCKPIT_LOTE_CODIGO_CONFLITO';
        END IF;
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;

  -- (j) evento só depois de lote criado e vínculo validado
  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, programacao_id, lote_id, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, p_programacao_id, v_id, 'lote_gerado', 'gerar_lote', v_uid,
          format('Lote %s gerado (codigo canonico do servidor).', v_codigo));

  RETURN jsonb_build_object('success', true, 'replay', false,
    'lote_id', v_id, 'codigo_lote', v_codigo,
    'message', format('Lote %s gerado com sucesso.', v_codigo));
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) TO authenticated;

COMMIT;
