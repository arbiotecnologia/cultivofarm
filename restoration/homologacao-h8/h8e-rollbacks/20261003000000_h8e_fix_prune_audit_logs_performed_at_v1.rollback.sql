-- H8-E ROLLBACK nominal — restaura o command original do cron jobid=5.
-- Fora de supabase/migrations por desenho: nunca deve ser aplicado em lote.
-- Restaura exatamente o command auditado (md5 6fcccc17696cc2409fa5afba2a593e78),
-- preservando jobid, jobname, schedule, database, username e active.
-- Não executa DELETE nem invoca o job.
DO $h8er$
DECLARE
  v_new text;
  v_cur text;
  v_md5_old constant text := '6fcccc17696cc2409fa5afba2a593e78';
BEGIN
  SELECT command INTO v_cur FROM cron.job WHERE jobid = 5;
  IF v_cur IS NULL THEN RAISE EXCEPTION 'H8-E rollback: jobid=5 inexistente'; END IF;
  IF md5(v_cur) = v_md5_old THEN
    RAISE NOTICE 'H8-E rollback: command já é o original — nada a fazer';
    RETURN;
  END IF;

  v_new := replace(v_cur,
    'DELETE FROM public.financial_audit_log             WHERE performed_at <',
    'DELETE FROM public.financial_audit_log             WHERE created_at <');
  v_new := replace(v_new,
    'DELETE FROM public.clientes_audit_log              WHERE changed_at <',
    'DELETE FROM public.clientes_audit_log              WHERE created_at <');

  IF md5(v_new) <> v_md5_old THEN
    RAISE EXCEPTION 'H8-E rollback: reconstrução não bate com o md5 original (%)', md5(v_new);
  END IF;

  PERFORM cron.alter_job(job_id := 5, command := v_new);

  SELECT command INTO v_cur FROM cron.job WHERE jobid = 5;
  IF md5(v_cur) <> v_md5_old THEN RAISE EXCEPTION 'H8-E rollback: md5 pós-restauração divergente'; END IF;
  RAISE NOTICE 'H8-E rollback OK: md5 restaurado %', v_md5_old;
END
$h8er$;
