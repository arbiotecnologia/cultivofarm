-- ============================================================================
-- FASE H6e — MENOR PRIVILEGIO DAS TRIGGER FUNCTIONS FINANCEIRAS
-- Staging autorizado: ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
--
-- Achado da auditoria independente: as trigger functions de guard/append-only do
-- H6/H6d permaneciam com EXECUTE herdado de PUBLIC (=X/postgres), logo alcancaveis
-- por anon e authenticated. Sao funcoes RETURNS trigger: nenhum papel DML precisa
-- de EXECUTE para o trigger disparar (o trigger executa com o dono da funcao).
--
-- NAO altera logica, NAO recria triggers, NAO toca RPCs financeiras/fiscais.
-- Idempotente.
-- ============================================================================

BEGIN;

DO $do$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_h6_guard_ar_installment_snapshot()',
    'public.fn_h6_guard_ap_installment_snapshot()',
    'public.fn_h6_guard_title_snapshot()',
    'public.fn_h6_payments_append_only()',
    'public.fn_h6d_block_hard_delete()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
      -- service_role preservado para manutencao server-side controlada.
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $do$;

-- Reafirma o estado ja correto da escotilha de manutencao (idempotente).
DO $do$
BEGIN
  IF to_regprocedure('public.fn_h6d_hard_delete_allowed()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fn_h6d_hard_delete_allowed() FROM PUBLIC, anon, authenticated;
  END IF;
END $do$;

COMMIT;
