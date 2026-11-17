-- GERADO por build_seed.py; não editar.
-- DRY-RUN da limpeza QA (HML vrlcdwmlytukrjezrrnf, postgres). Lista tabela/ID/hash/coluna/origem de TODAS as linhas que seriam
-- excluídas, as recusas e o DIGEST. Grava só em tabelas temporárias e termina em ROLLBACK: nada muda.
BEGIN;
DO $$ BEGIN IF session_user <> 'postgres' OR to_regprocedure('platform_private.homolog_validation_block_receivable_insert()') IS NULL
  OR to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'QA_CLEAN_REFUSED: alvo/sessão'; END IF; END $$;
{{DISCOVER}}
ROLLBACK;
