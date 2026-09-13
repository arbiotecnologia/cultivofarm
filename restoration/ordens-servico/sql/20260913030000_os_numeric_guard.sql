-- PREPARADO, NÃO APLICADO. O operador deve comprovar externamente o ref canônico.
-- Definir na mesma sessão: SET app.audit_target_ref = 'swzpzcwiasxmjutrmvkm';
-- Esta declaração é um gate operacional, não comprova identidade do host.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $guard$
BEGIN
  IF current_setting('app.audit_target_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'os_target_not_confirmed';
  END IF;
END $guard$;
LOCK TABLE public.ordens_servico, public.ordens_servico_onfarm IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE t text; c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ordens_servico', 'ordens_servico_onfarm'] LOOP
    -- Nulos são preservados: B2B pode não ter área agronômica.
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE
      (volume_total_ml IS NOT NULL AND (volume_total_ml <= 0 OR volume_total_ml::text IN (''NaN'',''Infinity'',''-Infinity''))) OR
      (area_hectares IS NOT NULL AND (area_hectares <= 0 OR area_hectares::text IN (''NaN'',''Infinity'',''-Infinity''))))', t) INTO STRICT c;
    IF c::boolean THEN RAISE EXCEPTION 'os_invalid_history_%', t; END IF;
    c := t || '_audit_positive_numbers_v1';
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I',t)::regclass AND conname = c) THEN
      RAISE EXCEPTION 'os_guard_already_exists_%: verify definition before proceeding', t;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
      (volume_total_ml IS NULL OR (volume_total_ml > 0 AND volume_total_ml::text NOT IN (''NaN'',''Infinity'',''-Infinity''))) AND
      (area_hectares IS NULL OR (area_hectares > 0 AND area_hectares::text NOT IN (''NaN'',''Infinity'',''-Infinity''))))', t, c);
  END LOOP;
END $migration$;
COMMIT;
