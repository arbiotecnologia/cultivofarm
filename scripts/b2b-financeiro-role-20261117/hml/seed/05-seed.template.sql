-- GERADO por build_seed.py a partir de 05-seed.template.sql + _lib.sql; não editar.
-- SEED QA Financeiro B2B — SOMENTE HML vrlcdwmlytukrjezrrnf, como postgres, numa única transação (SQL editor do HML).
-- Pré-requisito: 04 (registro das assinaturas/overrides QA já criados pelo root). Parceiros e usuários QA já existem e são
-- identificados por IDs fixos (não recriados). Cria por parceiro 1 pedido + 1 título B2B_ORDER + parcelas + vínculo, com IDs
-- manifestados em qa_b2bfin.manifest. Única exceção: o bloqueio homolog de inserção de títulos, relaxado só para
-- postgres + ticket desta txid + IDs manifestados com descrição QA-FIN-, e restaurado (def/md5 idênticos) ANTES do COMMIT.
-- Nenhum gatilho é desativado; todas as demais guardas executam normalmente e qualquer recusa aborta tudo. Sem NF/cobrança.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF session_user <> 'postgres' THEN RAISE EXCEPTION 'QA_SEED_REFUSED: session_user'; END IF;
 IF to_regprocedure('platform_private.homolog_validation_block_receivable_insert()') IS NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: impressão digital HML ausente — alvo não é vrlcdwmlytukrjezrrnf'; END IF;
 IF to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: cadeia B4 presente — alvo parece produção'; END IF;
 IF (SELECT count(*) FROM public.organizations WHERE id IN ('525fea87-e27e-43f7-af7b-a30064188332','85ba8b71-8514-4ec9-90d3-bfc7ab3ed214')) <> 2 THEN RAISE EXCEPTION 'QA_SEED_REFUSED: tenants QA ausentes'; END IF;
 IF to_regclass('qa_b2bfin.manifest') IS NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: rodar 04 e seed_saas.py antes'; END IF;
 IF NOT EXISTS (SELECT 1 FROM qa_b2bfin.manifest WHERE kind='subscription') THEN RAISE EXCEPTION 'QA_SEED_REFUSED: rodar 04 antes'; END IF;
 IF EXISTS (SELECT 1 FROM qa_b2bfin.manifest WHERE kind='receivable') THEN RAISE EXCEPTION 'QA_SEED_REFUSED: seed anterior existe — rodar 06 antes'; END IF;
END $$;
{{LIB}}
INSERT INTO qa_b2bfin.ticket VALUES (txid_current(), 'seed');
SELECT qa_b2bfin.relax('platform_private.homolog_validation_block_receivable_insert()'::regprocedure);
DO $$
DECLARE pmap jsonb := '{"A":["cdb78993-89e4-48db-956e-f40b014a8146","525fea87-e27e-43f7-af7b-a30064188332"],"B":["9d53f280-f828-4af8-a08c-3574263dc466","525fea87-e27e-43f7-af7b-a30064188332"],"C":["6100c3ac-ff5b-4596-a0e3-92665a5dcaab","85ba8b71-8514-4ec9-90d3-bfc7ab3ed214"]}'; k text; pid uuid; org uuid; cat uuid; oid_ uuid; rid uuid; n int; orgs uuid[] := '{525fea87-e27e-43f7-af7b-a30064188332,85ba8b71-8514-4ec9-90d3-bfc7ab3ed214}';
BEGIN
 SELECT id INTO cat FROM public.financial_categories WHERE active AND upper(type) = 'RECEITA' ORDER BY created_at, id LIMIT 1;
 IF cat IS NULL THEN RAISE EXCEPTION 'QA_SEED_BLOCKED: nenhuma categoria RECEITA ativa (não criada pelo seed)'; END IF;
 FOR k IN SELECT unnest('{A,B,C}'::text[]) LOOP
  SELECT id, commercial_owner_organization_id INTO STRICT pid, org FROM public.partner_accounts WHERE id = (pmap->k->>0)::uuid AND deleted_at IS NULL;
  IF org IS DISTINCT FROM (pmap->k->>1)::uuid THEN RAISE EXCEPTION 'QA_SEED_REFUSED: parceiro % fora do tenant QA esperado', k; END IF;
  INSERT INTO qa_b2bfin.manifest VALUES ('partner', k, 'public.partner_accounts', pid);
  INSERT INTO qa_b2bfin.manifest SELECT 'partner_user', k, 'public.partner_users', id FROM public.partner_users WHERE partner_id = pid;
  IF EXISTS (SELECT 1 FROM public.accounts_receivable WHERE partner_id = pid) OR EXISTS (SELECT 1 FROM public.partner_orders WHERE partner_id = pid) THEN RAISE EXCEPTION 'QA_SEED_REFUSED: parceiro % já tem pedidos/títulos', k; END IF;
  oid_ := gen_random_uuid(); rid := gen_random_uuid();
  INSERT INTO qa_b2bfin.manifest VALUES ('order', k, 'public.partner_orders', oid_), ('receivable', k, 'public.accounts_receivable', rid);
  INSERT INTO public.partner_orders (id, numero, partner_id, subtotal, total, observacoes) VALUES (oid_, 'QA-FIN-' || k || '-001', pid, 1000.00, 1000.00, 'QA-FIN fixture sintética');
  INSERT INTO public.accounts_receivable (id, origin_type, origin_id, description, category_id, total_amount, issue_date, first_due_date, installment_count, partner_id, organization_id, notes, fiscal_invoice_required)
   VALUES (rid, 'B2B_ORDER', oid_, 'QA-FIN-' || k || ' título sentinela', cat, 1000.00, current_date, current_date + 30, 2, pid, org, 'QA-FIN fixture sintética sem NF/cobrança', false);
  SELECT count(*) INTO n FROM public.accounts_receivable_installments WHERE receivable_id = rid;
  IF n = 0 THEN
   INSERT INTO public.accounts_receivable_installments (receivable_id, installment_number, due_date, original_amount, received_amount, net_amount, organization_id)
    VALUES (rid, 1, current_date + 30, 500.00, 0, 500.00, org), (rid, 2, current_date + 60, 500.00, 0, 500.00, org);
  END IF;
  INSERT INTO qa_b2bfin.manifest SELECT 'installment', k, 'public.accounts_receivable_installments', id FROM public.accounts_receivable_installments WHERE receivable_id = rid;
  INSERT INTO public.partner_order_financial_links (partner_order_id, partner_id, receivable_id) VALUES (oid_, pid, rid);
  INSERT INTO qa_b2bfin.manifest SELECT 'link', k, 'public.partner_order_financial_links', id FROM public.partner_order_financial_links WHERE receivable_id = rid;
  IF NOT EXISTS (SELECT 1 FROM public.partner_financial_settings WHERE partner_id = pid) THEN
   INSERT INTO public.partner_financial_settings (partner_id, credit_limit) VALUES (pid, CASE k WHEN 'A' THEN 5000 WHEN 'B' THEN 7000 ELSE 9000 END);
  END IF;
  INSERT INTO qa_b2bfin.manifest SELECT 'credit_settings', k, 'public.partner_financial_settings', id FROM public.partner_financial_settings WHERE partner_id = pid ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
DO $$ BEGIN IF (SELECT count(*) FROM qa_b2bfin.manifest WHERE kind='receivable') <> 3 OR (SELECT count(*) FROM qa_b2bfin.manifest WHERE kind='installment') < 3 THEN RAISE EXCEPTION 'QA_SEED_INCOMPLETE'; END IF; END $$;
SELECT 'QA_SEED_RESTORED' k, qa_b2bfin.restore_all() v;
SELECT 'QA_TITLES_JSON' k, jsonb_object_agg(label, t) v FROM (
 SELECT m.label, jsonb_agg(jsonb_build_object('id', m.id, 'order_id', (SELECT id FROM qa_b2bfin.manifest o WHERE o.kind='order' AND o.label=m.label),
   'installments', (SELECT jsonb_agg(i.id ORDER BY i.id) FROM qa_b2bfin.manifest i WHERE i.kind='installment' AND i.label=m.label))) t
 FROM qa_b2bfin.manifest m WHERE m.kind = 'receivable' GROUP BY m.label) x;
COMMIT;
