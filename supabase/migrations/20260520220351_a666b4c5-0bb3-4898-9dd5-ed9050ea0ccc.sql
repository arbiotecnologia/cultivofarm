-- Habilitar extensões necessárias se não estiverem
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar a execução diária da rotina de recorrências
-- Executa todos os dias às 06:00 UTC
SELECT cron.schedule(
  'recurring-financial-daily',
  '0 6 * * *',
  $$ SELECT public.fn_run_recurring_generation(); $$
);

-- Garantir que o esquema cron seja acessível
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
