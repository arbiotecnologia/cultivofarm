-- Rollback do hardening preventivo de views (20261102000000).
-- ATENÇÃO: reverter reintroduz a vulnerabilidade `security_definer_view` e
-- exige autorização humana explícita. Restaura exatamente o baseline capturado
-- em transação por 20261102000000; recusa se o baseline não existir.
BEGIN;

DO $rb$
DECLARE
  v_baseline text;
  v_linha     text;
  v_view      text;
  v_valor     text;
BEGIN
  SELECT conteudo INTO v_baseline
  FROM public.promocao_rollback_baseline
  WHERE chave = 'views_security_invoker_20261102000000';

  IF v_baseline IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: baseline de reloptions das views nao foi capturado.';
  END IF;

  FOREACH v_linha IN ARRAY string_to_array(v_baseline, E'\n') LOOP
    CONTINUE WHEN coalesce(v_linha, '') = '';
    v_view  := split_part(v_linha, '=', 1);
    v_valor := split_part(v_linha, '=', 2);

    IF v_valor = 'unset' THEN
      EXECUTE format('ALTER VIEW public.%I RESET (security_invoker)', v_view);
    ELSE
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = %s)', v_view, v_valor);
    END IF;
  END LOOP;
END
$rb$;

COMMIT;
