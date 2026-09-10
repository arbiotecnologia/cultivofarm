-- Rollback real do artefato de cron 20261003000000__promocao_cron.sql.
-- Restaura o `command` anterior capturado na mesma transação da aplicação.
-- Não cria, remove nem reagenda job; não executa DELETE.
DO $rb$
DECLARE
  v_base record;
  v_job  record;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '60s';

  SELECT * INTO v_base FROM public.promocao_rollback_baseline
   WHERE chave = 'cron.job:5:prune-old-audit-logs:command';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROLLBACK_CRON: baseline ausente — nada a restaurar com segurança.';
  END IF;
  IF md5(v_base.conteudo) <> v_base.md5_conteudo THEN
    RAISE EXCEPTION 'ROLLBACK_CRON: baseline corrompido.';
  END IF;

  SELECT * INTO v_job FROM cron.job WHERE jobid = 5;
  IF NOT FOUND OR v_job.jobname <> 'prune-old-audit-logs' THEN
    RAISE EXCEPTION 'ROLLBACK_CRON: job alvo divergente.';
  END IF;

  PERFORM cron.alter_job(job_id := 5, command := v_base.conteudo);

  SELECT * INTO v_job FROM cron.job WHERE jobid = 5;
  IF md5(v_job.command) <> v_base.md5_conteudo THEN
    RAISE EXCEPTION 'ROLLBACK_CRON: restauração não confirmada.';
  END IF;

  INSERT INTO public.promocao_execucao_registro
    (version, origem, sha256_origem, artefato, sha256_artefato, status, onda, observacao)
  VALUES ('20261003000000',
          'restoration/promocao-producao-h9/rollback-sql/20261003000000__promocao_cron_rollback.sql',
          'rollback', NULL, NULL, 'ABORTADA', 'P2',
          'Rollback aplicado: command restaurado ao baseline de produção.')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'ROLLBACK_CRON OK: command restaurado (md5 %)', v_base.md5_conteudo;
END
$rb$;
