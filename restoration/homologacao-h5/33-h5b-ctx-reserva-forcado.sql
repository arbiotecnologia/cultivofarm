-- =====================================================================
-- H5b — Contexto de ledger determinístico na reserva de estoque
--
-- Achado (H5-002, P1): `fn_estoque_ctx_open` dá precedência ao contexto já
-- aberto na transação. Motores que abrem contexto e não o fecham (ex.:
-- `rpc_cockpit_registrar_envase_v1`) fazem a reserva subsequente herdar
-- `acao='entrada'`, `origem` errada e — crítico — `idempotency_key = NULL`.
-- Sem a chave no ledger, o replay de `rpc_estoque_reservar_v1` não é
-- detectado e a mesma operação pode reservar duas vezes.
--
-- Correção: contexto forçado para a operação principal + fechamento
-- garantido nos motores que o abrem.
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ENV_ABORT: marcador ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'ENV_ABORT: PRODUCAO PROIBIDA'; END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ENV_ABORT: ambiente nao autorizado';
  END IF;
END
$guard$;

-- 1) Contexto forçado: usado só pela operação principal do motor.
CREATE OR REPLACE FUNCTION public.fn_estoque_ctx_force(p_ctx jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.estoque_mov_ctx', COALESCE(p_ctx, '{}'::jsonb)::text, true);
END; $function$;

REVOKE ALL ON FUNCTION public.fn_estoque_ctx_force(jsonb) FROM PUBLIC, anon;

-- 2) Reserva em lote passa a impor o próprio contexto (e a fechá-lo).
CREATE OR REPLACE FUNCTION public.rpc_estoque_reservar_v1(
  p_os_id uuid, p_origem text, p_itens jsonb, p_idempotency_key text, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_new uuid;
  v_qtd numeric;
  v_ref_tipo text;
  v_ref_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.fn_estoque_pode_operar(v_uid, 'reserva') THEN
    RAISE EXCEPTION 'ESTQ_SEM_PERMISSAO: perfil sem permissão para reservar estoque'
      USING ERRCODE = '42501';
  END IF;
  IF p_os_id IS NULL THEN
    RAISE EXCEPTION 'ESTQ_OS_OBRIGATORIA: reserva requer uma OS vinculada'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_OBRIGATORIA: informe uma chave de idempotência'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'ESTQ_ITENS_VAZIOS: selecione ao menos uma embalagem'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('estoque_reserva:' || p_idempotency_key));

  -- Replay determinístico: a mesma chave nunca gera segunda movimentação.
  SELECT array_agg(DISTINCT estoque_produto_id) INTO v_ids
    FROM public.estoque_movimentacoes
   WHERE idempotency_key = p_idempotency_key
      OR idempotency_key LIKE p_idempotency_key || '#%';
  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'itens', to_jsonb(v_ids));
  END IF;
  v_ids := ARRAY[]::uuid[];

  PERFORM pg_advisory_xact_lock(hashtext('estoque_reserva_os:' || p_os_id::text));

  IF p_origem = 'b2b' THEN
    v_ref_tipo := 'partner_order';
    v_ref_id := NULLIF(p_dados->>'partner_order_id','')::uuid;
  ELSIF p_origem = 'onfarm' THEN
    v_ref_tipo := 'ordem_servico_onfarm';
    v_ref_id := p_os_id;
  ELSE
    v_ref_tipo := 'ordem_servico';
    v_ref_id := p_os_id;
  END IF;

  -- Contexto FORÇADO: esta é a operação principal; contexto residual de
  -- outro motor na mesma transação não pode sequestrar acao/chave/origem.
  PERFORM public.fn_estoque_ctx_force(jsonb_build_object(
    'acao','reserva',
    'origem','rpc_estoque_reservar_v1',
    'usuario_id', v_uid::text,
    'idempotency_key', p_idempotency_key,
    'referencia_tipo', v_ref_tipo,
    'referencia_id', v_ref_id,
    'motivo', NULLIF(p_dados->>'observacao',''),
    'metadata', jsonb_build_object('os_id', p_os_id, 'origem_os', p_origem)
  ));

  BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
      v_qtd := (v_item->>'quantidade')::numeric;
      v_new := public.reservar_estoque_item(
        (v_item->>'item_id')::uuid,
        v_qtd,
        p_os_id,
        p_origem,
        NULLIF(p_dados->>'cliente_id','')::uuid,
        NULLIF(p_dados->>'partner_id','')::uuid,
        NULLIF(p_dados->>'partner_order_id','')::uuid,
        NULLIF(p_dados->>'observacao','')
      );
      v_ids := v_ids || v_new;
    END LOOP;
  EXCEPTION WHEN others THEN
    PERFORM public.fn_estoque_ctx_close();
    RAISE;
  END;

  PERFORM public.fn_estoque_ctx_close();

  RETURN jsonb_build_object('ok', true, 'replay', false, 'itens', to_jsonb(v_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb) TO authenticated;

-- 3) Envase deixa de vazar contexto para as operações seguintes da transação.
DO $envase$
DECLARE v_src text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_cockpit_registrar_envase_v1';
  IF v_src IS NULL THEN RAISE EXCEPTION 'H5B_ENVASE_AUSENTE'; END IF;

  IF position('fn_estoque_ctx_close' in v_src) > 0 THEN
    RAISE NOTICE 'H5B: envase ja fecha o contexto; nada a fazer';
    RETURN;
  END IF;

  IF position('fn_estoque_ctx_open' in v_src) = 0 THEN
    RAISE NOTICE 'H5B: envase nao abre contexto; nada a fazer';
    RETURN;
  END IF;

  -- Fecha o contexto imediatamente antes de cada RETURN da função.
  v_new := regexp_replace(v_src,
    '(\n\s*)RETURN ', E'\\1PERFORM public.fn_estoque_ctx_close();\\1RETURN ', 'g');
  EXECUTE v_new;
  RAISE NOTICE 'H5B: envase ajustado para fechar o contexto do ledger';
END
$envase$;

COMMIT;
