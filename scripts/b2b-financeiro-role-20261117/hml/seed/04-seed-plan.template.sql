-- GERADO por build_seed.py; não editar.
-- PASSO 04 — plano QA novo (HML vrlcdwmlytukrjezrrnf, postgres). Não existe RPC canônica de criação de plano; a linha
-- saas_plans é fixture nova com chave/nome QA, manifestada. Versão/publicação/assinatura seguem pelas RPCs canônicas
-- (seed_saas.py). Planos existentes (inclusive QA 78000000…0001 e 7e570000…00b1) não são lidos para escrita nem alterados.
BEGIN;
DO $$ BEGIN
 IF session_user <> 'postgres' THEN RAISE EXCEPTION 'QA_SEED_REFUSED: session_user'; END IF;
 IF to_regprocedure('platform_private.homolog_validation_block_receivable_insert()') IS NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: impressão digital HML ausente — alvo não é vrlcdwmlytukrjezrrnf'; END IF;
 IF to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: cadeia B4 presente — alvo parece produção'; END IF;
 IF to_regnamespace('qa_b2bfin') IS NOT NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: seed anterior existe — rodar 06 antes'; END IF;
 IF EXISTS (SELECT 1 FROM public.saas_plans WHERE key = 'qa_fin_20261117') THEN RAISE EXCEPTION 'QA_SEED_REFUSED: plano QA já existe fora do manifesto'; END IF;
END $$;
CREATE SCHEMA qa_b2bfin; REVOKE ALL ON SCHEMA qa_b2bfin FROM PUBLIC;
CREATE TABLE qa_b2bfin.manifest(kind text NOT NULL, label text, tbl regclass NOT NULL, id uuid NOT NULL, PRIMARY KEY (tbl, id));
REVOKE ALL ON qa_b2bfin.manifest FROM PUBLIC;
WITH p AS (INSERT INTO public.saas_plans (key, name, description, active, is_default)
  VALUES ('qa_fin_20261117', 'QA-FIN Financeiro B2B 20261117', 'QA-FIN fixture sintética; removida por 06', true, false) RETURNING id)
INSERT INTO qa_b2bfin.manifest SELECT 'qa_plan', 'qa_fin_20261117', 'public.saas_plans', id FROM p;
SELECT 'QA_PLAN' k, id FROM qa_b2bfin.manifest WHERE kind = 'qa_plan';
COMMIT;
