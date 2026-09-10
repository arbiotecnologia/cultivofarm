-- Rollback forward-only da convergência de promoção (20261101000000).
-- Só remove as estruturas se NÃO houver histórico real além da linha de criação.
-- Se já existirem registros de promoção, PRESERVA tudo e aborta.
DO $rb$
BEGIN
  IF EXISTS (SELECT 1 FROM public.promocao_rollback_baseline) THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: promocao_rollback_baseline contem baselines capturados.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.promocao_execucao_registro WHERE version <> '20261101000000'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: existem registros de promoção; historico preservado.';
  END IF;

  DROP TABLE public.promocao_rollback_baseline;
  DROP TABLE public.promocao_execucao_registro;
END
$rb$;
