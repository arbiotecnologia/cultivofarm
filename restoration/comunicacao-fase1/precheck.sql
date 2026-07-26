-- Precheck Fase 1 (read-only)
-- Aborta se dependências mínimas não existem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    RAISE EXCEPTION 'precheck: enum app_role ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='has_role'
  ) THEN
    RAISE EXCEPTION 'precheck: função public.has_role ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='ordens_servico'
  ) THEN
    RAISE EXCEPTION 'precheck: tabela public.ordens_servico ausente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='comunicacao_templates'
  ) THEN
    RAISE NOTICE 'precheck: comunicacao_templates já existe — migration deve ser idempotente';
  END IF;
END$$;
