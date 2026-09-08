-- H8-E — Correção mínima do cron de retenção de auditoria (staging ikaauvsflpmamgxmkhoq).
--
-- Defeito: o job jobid=5 'prune-old-audit-logs' aborta transacionalmente porque duas
-- sentenças DELETE referenciam colunas inexistentes:
--   * public.financial_audit_log  -> possui performed_at (não created_at)
--   * public.clientes_audit_log   -> possui changed_at   (não created_at)
-- Como o bloco é uma única transação, nenhuma das 13 podas ocorre.
--
-- Correção: substituir SOMENTE o nome da coluna nessas duas sentenças, preservando
-- integralmente as outras 11, a atomicidade do bloco, o jobid, jobname, schedule,
-- database, username e active. Alteração exclusivamente via cron.alter_job.
-- Nenhum DELETE é executado por esta migration.
DO $h8e$
DECLARE
  v_old   text;
  v_new   text;
  v_md5_old constant text := '6fcccc17696cc2409fa5afba2a593e78';
  v_job   record;
  v_lines_changed int;
BEGIN
  SELECT * INTO v_job FROM cron.job WHERE jobid = 5;
  IF NOT FOUND THEN RAISE EXCEPTION 'H8-E: jobid=5 inexistente'; END IF;
  IF v_job.jobname <> 'prune-old-audit-logs' THEN RAISE EXCEPTION 'H8-E: jobname divergente'; END IF;
  IF v_job.schedule <> '15 3 * * *' THEN RAISE EXCEPTION 'H8-E: schedule divergente'; END IF;
  IF v_job.active IS NOT TRUE THEN RAISE EXCEPTION 'H8-E: job inativo'; END IF;

  v_old := v_job.command;
  IF md5(v_old) <> v_md5_old THEN
    RAISE EXCEPTION 'H8-E: md5 do command diverge do baseline auditado (%).', md5(v_old);
  END IF;

  -- precondições de catálogo
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_audit_log' AND column_name='performed_at';
  IF NOT FOUND THEN RAISE EXCEPTION 'H8-E: financial_audit_log.performed_at ausente'; END IF;
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_audit_log' AND column_name='created_at';
  IF FOUND THEN RAISE EXCEPTION 'H8-E: financial_audit_log.created_at existe — premissa inválida'; END IF;
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clientes_audit_log' AND column_name='changed_at';
  IF NOT FOUND THEN RAISE EXCEPTION 'H8-E: clientes_audit_log.changed_at ausente'; END IF;
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clientes_audit_log' AND column_name='created_at';
  IF FOUND THEN RAISE EXCEPTION 'H8-E: clientes_audit_log.created_at existe — premissa inválida'; END IF;

  -- substituição cirúrgica: apenas a sentença de cada tabela alvo
  v_new := replace(
             v_old,
             'DELETE FROM public.financial_audit_log             WHERE created_at <',
             'DELETE FROM public.financial_audit_log             WHERE performed_at <');
  v_new := replace(
             v_new,
             'DELETE FROM public.clientes_audit_log              WHERE created_at <',
             'DELETE FROM public.clientes_audit_log              WHERE changed_at <');

  -- provas de escopo
  IF v_new = v_old THEN RAISE EXCEPTION 'H8-E: nenhuma substituição aplicada'; END IF;
  IF length(v_new) <> length(v_old) + 2 + 0 THEN
    -- performed_at(12) - created_at(10) = +2 ; changed_at(10) - created_at(10) = 0
    RAISE EXCEPTION 'H8-E: delta de comprimento inesperado (% -> %)', length(v_old), length(v_new);
  END IF;

  SELECT count(*) INTO v_lines_changed
  FROM unnest(string_to_array(v_old, E'\n')) WITH ORDINALITY AS o(l, i)
  JOIN unnest(string_to_array(v_new, E'\n')) WITH ORDINALITY AS n(l, i) USING (i)
  WHERE o.l IS DISTINCT FROM n.l;
  IF v_lines_changed <> 2 THEN
    RAISE EXCEPTION 'H8-E: % linhas alteradas (esperado 2)', v_lines_changed;
  END IF;

  IF array_length(string_to_array(v_new, 'DELETE FROM public.'), 1) <> 14 THEN
    RAISE EXCEPTION 'H8-E: quantidade de sentenças DELETE alterada';
  END IF;
  IF (length(v_new) - length(replace(v_new, 'created_at', ''))) / 10 <> 11 THEN
    RAISE EXCEPTION 'H8-E: número de ocorrências restantes de created_at inesperado';
  END IF;

  PERFORM cron.alter_job(job_id := 5, command := v_new);

  -- pós-condições
  SELECT * INTO v_job FROM cron.job WHERE jobid = 5;
  IF v_job.jobname <> 'prune-old-audit-logs'
     OR v_job.schedule <> '15 3 * * *'
     OR v_job.database <> 'postgres'
     OR v_job.username <> 'postgres'
     OR v_job.active IS NOT TRUE THEN
    RAISE EXCEPTION 'H8-E: metadados do job não preservados';
  END IF;
  IF v_job.command <> v_new THEN RAISE EXCEPTION 'H8-E: command não persistido'; END IF;
  IF v_job.command !~ 'public\.financial_audit_log\s+WHERE performed_at <' THEN
    RAISE EXCEPTION 'H8-E: sentença financial_audit_log não corrigida';
  END IF;
  IF v_job.command ~ 'public\.financial_audit_log\s+WHERE created_at' THEN
    RAISE EXCEPTION 'H8-E: created_at persiste em financial_audit_log';
  END IF;
  IF v_job.command !~ 'public\.clientes_audit_log\s+WHERE changed_at <' THEN
    RAISE EXCEPTION 'H8-E: sentença clientes_audit_log não corrigida';
  END IF;

  RAISE NOTICE 'H8-E OK: command md5 % -> %', v_md5_old, md5(v_job.command);
END
$h8e$;
