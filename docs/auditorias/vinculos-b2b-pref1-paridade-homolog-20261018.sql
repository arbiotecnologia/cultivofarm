-- ============================================================================
-- FASE PRÉ-F1 — SINCRONIZAÇÃO CONTROLADA DE ESQUEMA MÍNIMO EM HOMOLOG
-- Destino: SOMENTE homolog vrlcdwmlytukrjezrrnf. NUNCA executar em produção
-- (swzpzcwiasxmjutrmvkm) — lá a coluna já existe.
-- REVISÁVEL — NÃO APLICADA. Aplicar somente após auditoria independente.
--
-- Motivo (descoberta do auditor externo, 2026-10-18): homolog NÃO possui
-- partner_accounts.commercial_owner_organization_id (nem marca_nome,
-- marca_logo_url, marca_cor_primaria). Sem esta coluna predecessora, a
-- migration F1 falha em homolog.
--
-- Escopo deste script: APENAS a coluna predecessora estritamente necessária
-- à F1. As colunas marca_* NÃO são incluídas (não são pré-requisito da F1;
-- adicioná-las sem consumidor seria escopo não auditado).
--
-- Definição VERIFICADA em produção (read-only, 2026-10-18):
--   * commercial_owner_organization_id: uuid, NULLABLE, sem default;
--   * SEM constraint FK formal; SEM índice dedicado.
-- Portanto este script replica exatamente isso: coluna simples, sem FK e sem
-- índice inventados — criar FK/índice em homolog que não existem em produção
-- geraria divergência nova em vez de paridade.
--
-- NÃO copia dados: homolog fica com a coluna vazia; fixtures de teste são
-- criadas transacionalmente pelos próprios testes (BEGIN/ROLLBACK).
-- Não inclui dados pessoais, fiscais, certificados, usuários ou secrets.
--
-- PARIDADE TOTAL NÃO HOMOLOGADA: homolog tem 279 tabelas vs 286 em produção
-- e 0 vínculos vs 2. Este script fecha APENAS o gap bloqueador da F1.
-- Demais diferenças permanecem abertas e documentadas no relatório de
-- paridade (vinculos-b2b-pref1-paridade-20261018.review.md).
-- ============================================================================

BEGIN;

-- Preflight: aborta se a coluna já existir (idempotente na prática, mas
-- explícito para registrar intenção) ou se partner_accounts não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'partner_accounts'
  ) THEN
    RAISE EXCEPTION 'pref1_abort: tabela public.partner_accounts ausente em homolog';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_accounts'
      AND column_name = 'commercial_owner_organization_id'
  ) THEN
    RAISE EXCEPTION 'pref1_abort: coluna commercial_owner_organization_id já existe — nada a fazer';
  END IF;
END;
$$;

ALTER TABLE public.partner_accounts
  ADD COLUMN commercial_owner_organization_id uuid NULL;

-- Verificação pós-execução (dentro da mesma transação): tipo/nulabilidade
-- devem espelhar produção.
DO $$
DECLARE
  v_type text;
  v_null text;
BEGIN
  SELECT data_type, is_nullable INTO v_type, v_null
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'partner_accounts'
     AND column_name = 'commercial_owner_organization_id';

  IF v_type IS DISTINCT FROM 'uuid' OR v_null IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'pref1_abort: coluna criada divergente (tipo=%, nullable=%)', v_type, v_null;
  END IF;

  RAISE NOTICE 'pref1 OK: commercial_owner_organization_id uuid NULL criada em homolog';
END;
$$;

COMMIT;

-- ============================================================================
-- ROLLBACK PRÉ-F1 (seguro: coluna aditiva, sem dados dependentes):
--   BEGIN;
--   ALTER TABLE public.partner_accounts
--     DROP COLUMN IF EXISTS commercial_owner_organization_id;
--   COMMIT;
-- ============================================================================
