-- GERADO por build_seed.py; não editar.
-- PASSO 04 — registra no manifesto a massa SaaS QA JÁ criada pelo root no HML vrlcdwmlytukrjezrrnf (2 assinaturas TRIAL no
-- plano gratuito publicado 7e570000…b1 e 4 overrides GRANT de 1 dia). Não cria nem altera nada de negócio; plano/versão
-- existentes nunca entram no manifesto e ficam protegidos na limpeza.
BEGIN;
DO $$ BEGIN
 IF session_user <> 'postgres' THEN RAISE EXCEPTION 'QA_SEED_REFUSED: session_user'; END IF;
 IF to_regprocedure('platform_private.homolog_validation_block_receivable_insert()') IS NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: impressão digital HML ausente — alvo não é vrlcdwmlytukrjezrrnf'; END IF;
 IF to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: cadeia B4 presente — alvo parece produção'; END IF;
 IF to_regnamespace('qa_b2bfin') IS NOT NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: seed anterior existe — rodar 06 antes'; END IF;
 IF (SELECT count(*) FROM public.organization_subscriptions WHERE id IN ('fcb4c72d-2040-4bbc-98fd-145f1463ec04','2624ff4a-c4dd-4885-af23-beb8463d2209') AND organization_id IN ('525fea87-e27e-43f7-af7b-a30064188332','85ba8b71-8514-4ec9-90d3-bfc7ab3ed214')) <> 2
  THEN RAISE EXCEPTION 'QA_SEED_REFUSED: assinaturas QA ausentes/fora dos tenants'; END IF;
 IF EXISTS (SELECT 1 FROM public.organization_subscription_history h WHERE h.subscription_id IN ('fcb4c72d-2040-4bbc-98fd-145f1463ec04','2624ff4a-c4dd-4885-af23-beb8463d2209') AND h.reason NOT LIKE 'QA-FIN-20261117%')
  THEN RAISE EXCEPTION 'QA_SEED_REFUSED: histórico não-QA nas assinaturas'; END IF;
 IF (SELECT count(*) FROM public.organization_feature_overrides WHERE id IN ('019fe16e-4a05-4ca1-8480-c2727b92dfa2','d69bf60a-faa2-4cc0-80df-fd8dc913e9e9','1aca4276-7043-4616-8dd5-839d2e4e86de','1eac8c31-6b09-43fd-bbec-e523a812e6ba') AND organization_id IN ('525fea87-e27e-43f7-af7b-a30064188332','85ba8b71-8514-4ec9-90d3-bfc7ab3ed214') AND reason LIKE 'QA-FIN-20261117%') <> 4
  THEN RAISE EXCEPTION 'QA_SEED_REFUSED: overrides QA ausentes/sem motivo QA'; END IF;
END $$;
CREATE SCHEMA qa_b2bfin; REVOKE ALL ON SCHEMA qa_b2bfin FROM PUBLIC;
CREATE TABLE qa_b2bfin.manifest(kind text NOT NULL, label text, tbl regclass NOT NULL, id uuid NOT NULL, PRIMARY KEY (tbl, id));
REVOKE ALL ON qa_b2bfin.manifest FROM PUBLIC;
INSERT INTO qa_b2bfin.manifest SELECT 'subscription', organization_id::text, 'public.organization_subscriptions', id FROM public.organization_subscriptions WHERE id IN ('fcb4c72d-2040-4bbc-98fd-145f1463ec04','2624ff4a-c4dd-4885-af23-beb8463d2209');
INSERT INTO qa_b2bfin.manifest SELECT 'override', organization_id::text, 'public.organization_feature_overrides', id FROM public.organization_feature_overrides WHERE id IN ('019fe16e-4a05-4ca1-8480-c2727b92dfa2','d69bf60a-faa2-4cc0-80df-fd8dc913e9e9','1aca4276-7043-4616-8dd5-839d2e4e86de','1eac8c31-6b09-43fd-bbec-e523a812e6ba');
SELECT 'QA_SAAS_REGISTERED' k, count(*) FROM qa_b2bfin.manifest;
COMMIT;
