-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — CRON DE RETENÇÃO DE AUDITORIA
-- Origem: supabase/migrations/20261003000000_h8e_fix_prune_audit_logs_performed_at_v1.sql
-- Alvo  : PRODUÇÃO (baseline lido em leitura autorizada somente-leitura)
--
-- Diferença essencial em relação à origem: o baseline de `md5(command)` da
-- origem é o de HOMOLOGAÇÃO e abortaria em produção por desenho. Este artefato
-- usa o baseline REAL de produção:
--     jobid = 5, jobname = 'prune-old-audit-logs', schedule = '15 3 * * *',
--     database = 'postgres', username = 'postgres', active = true,
--     md5(command) = 'e14782b8984dd461684fdbdc2c4008ff'
--
-- Catálogo de produção comprovado:
--     public.financial_audit_log  -> performed_at (sem created_at)
--     public.clientes_audit_log   -> changed_at   (sem created_at)
--
-- Efeito: troca SOMENTE o nome da coluna nas duas sentenças defeituosas.
-- Nenhum DELETE é executado. Nenhum job é criado, removido ou reagendado.
-- Metadados do job (jobid, jobname, schedule, database, username, active) são
-- preservados e verificados antes e depois.
--
-- PRÉ-REQUISITO: a migration de convergência 20261101000000 já aplicada, pois
-- o `command` anterior é persistido em public.promocao_rollback_baseline
-- DENTRO desta transação, viabilizando rollback real.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

DO $cron_promo$
DECLARE
  v_job           record;
  v_old           text;
  v_new           text;
  v_lines_changed int;
  v_md5_prod      constant text := 'e14782b8984dd461684fdbdc2c4008ff';
BEGIN
  -- 0) infraestrutura de rollback obrigatória
  IF to_regclass('public.promocao_rollback_baseline') IS NULL THEN
    RAISE EXCEPTION 'CRON_PROMO: aplique 20261101000000 (convergência) antes deste artefato.';
  END IF;

  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '60s';

  -- 1) baseline exato do job em produção
  SELECT * INTO v_job FROM cron.job WHERE jobid = 5;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRON_PROMO: jobid=5 inexistente'; END IF;
  IF v_job.jobname  <> 'prune-old-audit-logs' THEN RAISE EXCEPTION 'CRON_PROMO: jobname divergente (%)', v_job.jobname; END IF;
  IF v_job.schedule <> '15 3 * * *'           THEN RAISE EXCEPTION 'CRON_PROMO: schedule divergente (%)', v_job.schedule; END IF;
  IF v_job.database <> 'postgres'             THEN RAISE EXCEPTION 'CRON_PROMO: database divergente (%)', v_job.database; END IF;
  IF v_job.username <> 'postgres'             THEN RAISE EXCEPTION 'CRON_PROMO: username divergente (%)', v_job.username; END IF;
  IF v_job.active IS NOT TRUE                 THEN RAISE EXCEPTION 'CRON_PROMO: job inativo'; END IF;

  v_old := v_job.command;
  IF md5(v_old) <> v_md5_prod THEN
    RAISE EXCEPTION 'CRON_PROMO: md5 do command diverge do baseline de produção (% <> %)', md5(v_old), v_md5_prod;
  END IF;

  -- 2) catálogo: colunas corretas presentes e colunas erradas ausentes
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_audit_log' AND column_name='performed_at';
  IF NOT FOUND THEN RAISE EXCEPTION 'CRON_PROMO: financial_audit_log.performed_at ausente'; END IF;
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_audit_log' AND column_name='created_at';
  IF FOUND THEN RAISE EXCEPTION 'CRON_PROMO: financial_audit_log.created_at existe — premissa inválida'; END IF;
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clientes_audit_log' AND column_name='changed_at';
  IF NOT FOUND THEN RAISE EXCEPTION 'CRON_PROMO: clientes_audit_log.changed_at ausente'; END IF;
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clientes_audit_log' AND column_name='created_at';
  IF FOUND THEN RAISE EXCEPTION 'CRON_PROMO: clientes_audit_log.created_at existe — premissa inválida'; END IF;

  -- 3) captura do baseline para rollback real, na MESMA transação
  INSERT INTO public.promocao_rollback_baseline (chave, conteudo, md5_conteudo)
  VALUES ('cron.job:5:prune-old-audit-logs:command', v_old, md5(v_old))
  ON CONFLICT (chave) DO NOTHING;

  -- 4) substituição cirúrgica por regex ancorada na tabela alvo
  v_new := regexp_replace(v_old,
             '(DELETE\s+FROM\s+public\.financial_audit_log\s+WHERE\s+)created_at(\s*<)',
             '\1performed_at\2', 'g');
  v_new := regexp_replace(v_new,
             '(DELETE\s+FROM\s+public\.clientes_audit_log\s+WHERE\s+)created_at(\s*<)',
             '\1changed_at\2', 'g');

  -- 5) provas de escopo: exatamente 2 linhas alteradas, nada mais
  IF v_new = v_old THEN RAISE EXCEPTION 'CRON_PROMO: nenhuma substituição aplicada'; END IF;
  IF length(v_new) <> length(v_old) + 2 THEN
    RAISE EXCEPTION 'CRON_PROMO: delta de comprimento inesperado (% -> %)', length(v_old), length(v_new);
  END IF;

  SELECT count(*) INTO v_lines_changed
  FROM unnest(string_to_array(v_old, E'\n')) WITH ORDINALITY AS o(l, i)
  JOIN unnest(string_to_array(v_new, E'\n')) WITH ORDINALITY AS n(l, i) USING (i)
  WHERE o.l IS DISTINCT FROM n.l;
  IF v_lines_changed <> 2 THEN
    RAISE EXCEPTION 'CRON_PROMO: % linhas alteradas (esperado 2)', v_lines_changed;
  END IF;

  IF (length(v_new) - length(replace(v_new, 'DELETE FROM public.', '')))
     <> (length(v_old) - length(replace(v_old, 'DELETE FROM public.', ''))) THEN
    RAISE EXCEPTION 'CRON_PROMO: quantidade de sentenças DELETE alterada';
  END IF;

  -- 6) aplicação: apenas o command, via API suportada
  PERFORM cron.alter_job(job_id := 5, command := v_new);

  -- 7) pós-checks
  SELECT * INTO v_job FROM cron.job WHERE jobid = 5;
  IF v_job.jobname <> 'prune-old-audit-logs'
     OR v_job.schedule <> '15 3 * * *'
     OR v_job.database <> 'postgres'
     OR v_job.username <> 'postgres'
     OR v_job.active IS NOT TRUE THEN
    RAISE EXCEPTION 'CRON_PROMO: metadados do job não preservados';
  END IF;
  IF v_job.command <> v_new THEN RAISE EXCEPTION 'CRON_PROMO: command não persistido'; END IF;
  IF v_job.command !~ 'public\.financial_audit_log\s+WHERE performed_at <' THEN
    RAISE EXCEPTION 'CRON_PROMO: sentença financial_audit_log não corrigida';
  END IF;
  IF v_job.command ~ 'public\.financial_audit_log\s+WHERE created_at' THEN
    RAISE EXCEPTION 'CRON_PROMO: created_at persiste em financial_audit_log';
  END IF;
  IF v_job.command !~ 'public\.clientes_audit_log\s+WHERE changed_at <' THEN
    RAISE EXCEPTION 'CRON_PROMO: sentença clientes_audit_log não corrigida';
  END IF;
  IF v_job.command ~ 'public\.clientes_audit_log\s+WHERE created_at' THEN
    RAISE EXCEPTION 'CRON_PROMO: created_at persiste em clientes_audit_log';
  END IF;

  -- 8) registro de convergência
  INSERT INTO public.promocao_execucao_registro
    (version, origem, sha256_origem, artefato, sha256_artefato, status, onda, observacao)
  VALUES ('20261003000000',
          'supabase/migrations/20261003000000_h8e_fix_prune_audit_logs_performed_at_v1.sql',
          'ver 10-manifesto-artefatos-promocao.csv',
          'restoration/promocao-producao-h9/promotion-sql/20261003000000__promocao_cron.sql',
          'ver 10-manifesto-artefatos-promocao.csv',
          'APLICADA', 'P2',
          'Baseline de produção md5=e14782b8984dd461684fdbdc2c4008ff; 2 linhas alteradas; nenhum DELETE executado.')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'CRON_PROMO OK: command md5 % -> %', v_md5_prod, md5(v_job.command);
END
$cron_promo$;
