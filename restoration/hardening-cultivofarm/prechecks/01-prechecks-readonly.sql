-- ============================================================================
-- HARDENING CULTIVOFARM — PRECHECKS (SOMENTE LEITURA)
-- Rodar imediatamente antes de qualquer onda de hardening, no CultivoFarm.
-- Alvo permitido: swzpzcwiasxmjutrmvkm. Nenhuma escrita é emitida.
-- ============================================================================

SET default_transaction_read_only = on;

-- 0) Guarda de alvo — fail-closed.
DO $$
DECLARE v_ref text := current_setting('hardening.target_ref', true);
BEGIN
  IF v_ref IS NULL OR v_ref <> 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'ABORT: defina SET hardening.target_ref = ''swzpzcwiasxmjutrmvkm'' e confirme o projeto.';
  END IF;
  RAISE NOTICE 'ALVO OK: db=% user=% em %', current_database(), current_user, now();
END $$;

-- 1) Backup/PITR: evidência é declarada pelo operador; registre por escrito.
SELECT 'CONFIRME MANUALMENTE: backup/PITR ativo e restore point anotado' AS lembrete;

-- 2) Estado de RLS antes da onda.
SELECT count(*) FILTER (WHERE NOT c.relrowsecurity) AS tabelas_sem_rls,
       count(*)                                     AS tabelas_total
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p');

-- 3) Exposição a anon antes da onda.
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema IN ('public','private')
ORDER BY 1, 2, 3;

-- 4) Views sem security_invoker antes da onda.
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','private') AND c.relkind = 'v'
  AND coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                WHERE option_name = 'security_invoker'), 'false') <> 'true'
ORDER BY 1, 2;

-- 5) SECURITY DEFINER sem search_path fixo antes da onda.
SELECT count(*) AS secdef_sem_search_path
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','private') AND p.prosecdef AND p.proconfig IS NULL;

-- 6) Preservação do administrador.
SELECT count(*) AS admins_registrados
FROM public.user_roles WHERE role::text IN ('administrador','admin');

-- 7) Emissão fiscal deve permanecer desativada.
SELECT to_regclass('public.company_fiscal_settings') AS tabela_fiscal_presente;

-- FIM — nenhuma escrita foi emitida por este arquivo.
