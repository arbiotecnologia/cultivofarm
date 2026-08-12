-- =====================================================================
-- ROLLBACK COMPLETO — Fase 2 do comprovante de entrega
-- Cobre 20260903000000 / 010000 / 020000 / 030000.
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- Rehearsal: envolver em BEGIN ... ROLLBACK antes de qualquer aplicacao real.
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  PERFORM public.fn_os_assert_staging_exato();
END
$guard$;

-- 1) Motor documental e helper
DROP FUNCTION IF EXISTS public.rpc_get_comprovante_entrega_data(uuid, boolean);
DROP FUNCTION IF EXISTS public.fn_comprovante_entrega_montar_v1(uuid);

-- 2) Constraint de tipo documental: so volta ao conjunto anterior se nenhum
--    documento ja emitido usar 'comprovante_entrega' (nao apagamos historico).
DO $tipo$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.entrega_comprovantes WHERE tipo = 'comprovante_entrega';
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
    RAISE NOTICE 'ROLLBACK: constraint de tipo restaurada ao conjunto anterior.';
  ELSE
    RAISE NOTICE 'ROLLBACK: % documentos com tipo comprovante_entrega — constraint PRESERVADA por auditoria.', v_n;
  END IF;
END
$tipo$;

-- 3) Sequence de numeracao: PRESERVADA deliberadamente.
--    Politica: numeros ja emitidos (CE-YYYY-NNNNNN) nunca sao reciclados;
--    remover a sequence permitiria reemitir o mesmo numero em um reapply.
--    Mantida com ACL minima (sem PUBLIC/anon).
REVOKE ALL ON SEQUENCE public.comprovante_entrega_seq FROM PUBLIC, anon;

-- 4) Revogacoes de ACL de anon sobre entrega_comprovantes/entrega_termos
--    NAO sao revertidas: reconceder acesso a anon seria regressao de seguranca.
--    Snapshots ja congelados em entrega_comprovantes.metadata sao preservados.
