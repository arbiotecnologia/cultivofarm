-- =====================================================================
-- ROLLBACK — H7n-PROD onda A1 (version 20261103000000)
-- Alvo EXCLUSIVO: produção navfzbwgwzruipouyfnk
--
-- AVISO DE SEGURANÇA
--   Reverter security_invoker REINTRODUZ a vulnerabilidade `security_definer_view`
--   apontada pelo Security Advisor. Só execute com autorização humana explícita
--   e registro do motivo. Por isso o rollback é fail-closed por padrão: exige
--   SET promocao.rollback_autorizado = 'SIM' além da guarda de alvo.
--
--   A onda A1 reafirmou security_invoker em vw_esteira_laboratorio e
--   vw_fluxo_visita_tecnica, que JÁ estavam endurecidas pela P1 parcial.
--   Portanto o rollback semanticamente correto reverte SOMENTE
--   vw_os_integridade_esteira. As outras duas são deixadas como estão.
-- =====================================================================

BEGIN;

DO $guard$
DECLARE
  v_ref text := current_setting('promocao.target_ref', true);
  v_ok  text := current_setting('promocao.rollback_autorizado', true);
BEGIN
  IF v_ref IS DISTINCT FROM 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ENV_ABORT: alvo % nao autorizado', coalesce(v_ref, '<ausente>');
  END IF;
  IF v_ok IS DISTINCT FROM 'SIM' THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: autorizacao humana explicita ausente';
  END IF;
  IF to_regclass('public.vw_os_integridade_esteira') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: view alvo inexistente';
  END IF;
END
$guard$;

ALTER VIEW public.vw_os_integridade_esteira RESET (security_invoker);

DO $post$
DECLARE v_still boolean;
BEGIN
  SELECT c.reloptions @> ARRAY['security_invoker=true']
    INTO v_still
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'vw_os_integridade_esteira';

  IF coalesce(v_still, false) THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: security_invoker persiste apos RESET';
  END IF;
END
$post$;

COMMIT;

-- Após o rollback, remover a version 20261103000000 do ledger e marcar o
-- registro correspondente em public.promocao_execucao_registro como REVERTIDA.
-- Reexecutar o Security Advisor: o ERROR security_definer_view voltará a
-- aparecer para vw_os_integridade_esteira — comportamento esperado.
