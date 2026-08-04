DROP FUNCTION IF EXISTS public.fn_hml_purge_movimentacoes_fixture(text);

CREATE OR REPLACE FUNCTION public.fn_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'estoque_movimentacoes e append-only: % nao permitido', TG_OP
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_produto_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx jsonb := public.fn_estoque_ctx_read();
BEGIN
  IF v_ctx IS NULL OR v_ctx->>'origem' IS NULL THEN
    RAISE EXCEPTION 'estoque_produto so pode ser alterado pelo motor canonico (rpc_estoque_operar_v1)'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;