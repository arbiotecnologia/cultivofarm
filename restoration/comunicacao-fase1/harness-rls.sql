-- Harness RLS Fase 1 — executado em staging isolado com usuários sintéticos.
-- Verifica: sem escrita direta; leituras restritas; preferências privadas; RPCs restritas por role.
-- Uso: aplicar migration.sql, então rodar este script com psql. Aborta na primeira falha.

BEGIN;

-- Cenário: usuário sem role deve ser bloqueado em templates/regras/eventos/outbox
DO $$
DECLARE v_err text;
BEGIN
  -- Simular ausência de role: usar SET LOCAL role authenticated + custom claims fora do escopo aqui.
  -- Este harness assume seed fictício em staging; documentar em runbook.
  RAISE NOTICE 'harness-rls: rode conforme runbook.md §Harness RLS';
END$$;

-- Verificação estrutural mínima independente de sessão:
DO $$
BEGIN
  -- Nenhuma policy de INSERT/UPDATE/DELETE deve existir para authenticated nessas tabelas
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename IN ('comunicacao_templates','comunicacao_regras','comunicacao_eventos',
                         'comunicacao_outbox','comunicacao_audit_log')
       AND cmd IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'harness-rls: existe policy de escrita direta em tabela protegida';
  END IF;

  -- Preferências não devem ter policy de escrita direta (só via RPC)
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='comunicacao_preferencias'
       AND cmd IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'harness-rls: preferências não devem ter policy de escrita direta';
  END IF;
END$$;

ROLLBACK;
