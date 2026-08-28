-- H6c (ACL) ROLLBACK — restaura a exposicao anterior dos helpers financeiros.
-- Uso apenas emergencial: reintroduz o finding H6-005 (P1).
BEGIN;

DO $do$
BEGIN
  IF to_regprocedure('public.fn_entrega_valor_faturavel_v1(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.fn_entrega_valor_faturavel_v1(uuid) TO authenticated;
  END IF;
  IF to_regprocedure('public.fn_entrega_guard_faturamento_v1(uuid,numeric)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid,numeric) TO authenticated;
  END IF;
  IF to_regprocedure('public.fn_h6b_reconciliacao_valor_faturavel()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.fn_h6b_reconciliacao_valor_faturavel() TO PUBLIC;
  END IF;
END $do$;

COMMIT;
