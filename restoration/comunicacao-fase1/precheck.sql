-- Precheck Fase 1 v3 (read-only). Aborta se dependências mínimas ausentes.
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
  -- profiles.user_id é a coluna correta para link a auth.users (v3).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='user_id'
  ) THEN
    RAISE EXCEPTION 'precheck: profiles.user_id ausente (v3 exige coluna user_id)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='cliente_id'
  ) THEN
    RAISE EXCEPTION 'precheck: profiles.cliente_id ausente (necessário p/ escopo por cliente)';
  END IF;
  -- get_cliente_ids_for_user usada nas policies de preferências.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='get_cliente_ids_for_user'
  ) THEN
    RAISE EXCEPTION 'precheck: get_cliente_ids_for_user ausente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='comunicacao_templates'
  ) THEN
    RAISE NOTICE 'precheck: comunicacao_templates já existe — migration é idempotente';
  END IF;
END$$;
