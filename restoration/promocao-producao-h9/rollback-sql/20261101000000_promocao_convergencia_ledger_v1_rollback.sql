-- Rollback forward-only da convergência de promoção (20261101000000).
-- A migration não insere linha própria: quem registra é o runner, após
-- postcheck. Logo, o rollback só é permitido com AMBAS as tabelas VAZIAS.
-- Havendo qualquer registro de promoção ou baseline capturado, PRESERVA tudo.
DO $rb$
BEGIN
  IF EXISTS (SELECT 1 FROM public.promocao_rollback_baseline) THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: promocao_rollback_baseline contem baselines capturados.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.promocao_execucao_registro) THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: existem registros de promocao; historico preservado.';
  END IF;

  DROP TABLE public.promocao_rollback_baseline;
  DROP TABLE public.promocao_execucao_registro;
END
$rb$;
