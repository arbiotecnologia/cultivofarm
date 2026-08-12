-- =====================================================================
-- ROLLBACK INCREMENTAL — 20260903020000 (tipo canonico 'comprovante_entrega')
-- Restaura a definicao anterior de entrega_comprovantes_tipo_chk.
-- PRESERVACOES DELIBERADAS:
--   * Nenhum snapshot historico e apagado.
--   * Se ja existir documento emitido com tipo 'comprovante_entrega', a
--     constraint NAO e revertida (reverter invalidaria auditoria existente).
--   * A sequence public.comprovante_entrega_seq nao e tocada aqui: numeros
--     CE-YYYY-NNNNNN jamais sao reciclados.
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  PERFORM public.fn_os_assert_staging_exato();
END
$guard$;

DO $tipo$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.entrega_comprovantes
   WHERE tipo = 'comprovante_entrega';

  IF v_n = 0 THEN
    ALTER TABLE public.entrega_comprovantes DROP CONSTRAINT IF EXISTS entrega_comprovantes_tipo_chk;
    ALTER TABLE public.entrega_comprovantes
      ADD CONSTRAINT entrega_comprovantes_tipo_chk
      CHECK (tipo = ANY (ARRAY[
        'formulario_entrega'::text,
        'termo_recebimento'::text,
        'comprovante_assinado'::text,
        'assinatura_digital'::text,
        'foto_recebimento'::text,
        'outro'::text
      ]));
    RAISE NOTICE 'ROLLBACK 020000: constraint restaurada a definicao anterior.';
  ELSE
    RAISE NOTICE 'ROLLBACK 020000: % documento(s) com tipo comprovante_entrega — constraint PRESERVADA.', v_n;
  END IF;
END
$tipo$;
