-- H6e — ROLLBACK: restaura EXECUTE herdado (estado pre-H6e). Somente staging.
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
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END IF;
  END LOOP;
END $do$;
COMMIT;
