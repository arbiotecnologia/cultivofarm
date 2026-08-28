-- ============================================================================
-- FASE H6c (ACL) — MENOR PRIVILEGIO NOS HELPERS FINANCEIROS SECURITY DEFINER
-- Staging autorizado: ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
--
-- Finding H6-005 (P1): public.fn_entrega_valor_faturavel_v1(uuid) e
-- public.fn_entrega_guard_faturamento_v1(uuid,numeric) sao SECURITY DEFINER,
-- nao validam escopo/role do chamador e tinham EXECUTE para authenticated.
-- Um usuario autenticado qualquer podia inferir valores/snapshots financeiros
-- de QUALQUER entrega passando um UUID arbitrario.
--
-- Finding H6-006 (P2): public.fn_h6b_reconciliacao_valor_faturavel() (helper de
-- homologacao) estava exposta a PUBLIC/anon.
--
-- Callers auditados (repo + banco): apenas
--   fn_generate_receivable_from_entrega  -> fn_entrega_guard_faturamento_v1
--   fn_entrega_guard_faturamento_v1      -> fn_entrega_valor_faturavel_v1
--   fn_h6b_reconciliacao_valor_faturavel -> fn_entrega_valor_faturavel_v1
-- Nenhum caller no frontend (src/) e nenhuma chamada .rpc() direta.
-- Owner=postgres + SECURITY DEFINER: chamadas internas seguem funcionando.
--
-- NAO altera logica, calculo economico, snapshots, idempotencia ou estornos.
-- Idempotente.
-- ============================================================================

BEGIN;

DO $do$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_entrega_valor_faturavel_v1(uuid)',
    'public.fn_entrega_guard_faturamento_v1(uuid,numeric)',
    'public.fn_h6b_reconciliacao_valor_faturavel()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
    END IF;
  END LOOP;
END $do$;

COMMIT;
