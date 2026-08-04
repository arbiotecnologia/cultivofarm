-- ============================================================
-- HML temporário: expurgo controlado de fixtures do módulo Movimentações
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND COALESCE(current_setting('app.estoque_purge_fixture', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Livro de movimentações é append-only: % não é permitido em %. Use estorno/cancelamento formal.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_produto_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ctx jsonb := public.fn_estoque_ctx_read();
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(current_setting('app.estoque_purge_fixture', true), '') = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'ESTQ_DELETE_BLOQUEADO: itens de estoque não podem ser excluídos; use descarte/perda.'
      USING ERRCODE='insufficient_privilege';
  END IF;
  IF v_ctx IS NOT NULL THEN RETURN NEW; END IF;
  IF (OLD.status IS DISTINCT FROM NEW.status)
     OR (COALESCE(OLD.quantidade,0) IS DISTINCT FROM COALESCE(NEW.quantidade,0))
     OR (COALESCE(OLD.quantidade_reservada,0) IS DISTINCT FROM COALESCE(NEW.quantidade_reservada,0))
     OR (COALESCE(OLD.volume_total,0) IS DISTINCT FROM COALESCE(NEW.volume_total,0)) THEN
    RAISE EXCEPTION 'ESTQ_UPDATE_DIRETO_BLOQUEADO: saldo/reserva/situação só podem ser alterados pelas RPCs canônicas de estoque.'
      USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

-- Expurgo de fixture: somente service_role, somente registros marcados HML MOV
CREATE OR REPLACE FUNCTION public.fn_hml_purge_movimentacoes_fixture(p_marker text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    '');
  v_items uuid[];
  v_movs int := 0;
  v_itens int := 0;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'HML_PURGE_NEGADO: operação restrita ao processo interno de homologação.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_marker IS NULL OR p_marker !~ '^HML MOV ' THEN
    RAISE EXCEPTION 'HML_PURGE_MARCADOR_INVALIDO: expurgo permitido apenas em fixtures HML MOV.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(ep.id), '{}'::uuid[]) INTO v_items
  FROM public.estoque_produto ep
  JOIN public.produtos p ON p.id = ep.produto_id
  WHERE p.nome LIKE p_marker || '%';

  PERFORM set_config('app.estoque_purge_fixture', 'on', true);

  DELETE FROM public.estoque_movimentacoes WHERE estoque_produto_id = ANY(v_items);
  GET DIAGNOSTICS v_movs = ROW_COUNT;
  DELETE FROM public.estoque_produto WHERE id = ANY(v_items);
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  PERFORM set_config('app.estoque_purge_fixture', '', true);

  RETURN jsonb_build_object('movimentacoes_removidas', v_movs, 'itens_removidos', v_itens);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hml_purge_movimentacoes_fixture(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hml_purge_movimentacoes_fixture(text) TO service_role;