-- PREPARADO, NÃO APLICADO.
-- Alvo: Supabase CultivoFarm swzpzcwiasxmjutrmvkm.
-- Definir na mesma sessão: SET app.audit_target_ref = 'swzpzcwiasxmjutrmvkm';
-- Gate operacional: não comprova identidade do host, apenas exige confirmação explícita.
-- Sem CASCADE, sem TRUNCATE, sem DROP destrutivo, sem DML em dados existentes.

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

REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_codigo_lote(integer) TO authenticated;

-- 2) RPC do Cockpit: assinatura inalterada, mas o código do cliente é rejeitado
--    e o código canônico passa a ser gerado internamente. Trava por programação,
--    idempotência, validações de origem/OS e checagem de papel preservadas.
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
  v_existente record;
  v_id uuid;
  v_codigo text;
  v_tentativa int := 0;
BEGIN
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);
  IF p_programacao_id IS NULL OR p_os_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_PARAMS_INVALIDOS';
  END IF;

  -- O navegador não define códigos: envio explícito é rejeitado.
  IF nullif(p_lote->>'codigo_lote', '') IS NOT NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_CODIGO_NAO_ACEITO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_lote:' || p_programacao_id::text));

  SELECT id, codigo_lote INTO v_existente
    FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
  IF v_existente.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true,
      'lote_id', v_existente.id, 'codigo_lote', v_existente.codigo_lote,
      'message', format('Lote %s ja existe para esta programacao.', v_existente.codigo_lote));
  END IF;

  LOOP
    v_tentativa := v_tentativa + 1;
    v_codigo := public.gerar_codigo_lote(EXTRACT(YEAR FROM now())::int);
    BEGIN
      INSERT INTO public.lotes (
        programacao_id, codigo_lote, produto_id, microrganismo_id,
        volume_produzido, data_producao, responsavel_producao, tanque, observacoes_tecnicas
      ) VALUES (
        p_programacao_id, v_codigo,
        nullif(p_lote->>'produto_id','')::uuid,
        nullif(p_lote->>'microrganismo_id','')::uuid,
        nullif(p_lote->>'volume_produzido','')::numeric,
        coalesce(nullif(p_lote->>'data_producao','')::date, CURRENT_DATE),
        nullif(p_lote->>'responsavel_producao',''),
        nullif(p_lote->>'tanque',''),
        nullif(p_lote->>'observacoes_tecnicas','')
      ) RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_tentativa >= 3 THEN
        RAISE EXCEPTION 'COCKPIT_LOTE_CODIGO_CONFLITO';
      END IF;
    END;
  END LOOP;

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
