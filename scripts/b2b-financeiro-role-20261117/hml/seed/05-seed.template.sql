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
-- C11 (captura real HML 2026-11-18): todo gatilho das tabelas tocadas deve ter o corpo capturado (md5 de prosrc); qualquer
-- deriva ou gatilho não capturado recusa ANTES de escrever.
DO $$ DECLARE pins jsonb := '{{PINS}}'; k text; m text; f text; BEGIN
 FOR k IN SELECT jsonb_object_keys(pins) LOOP
  SELECT md5(prosrc) INTO m FROM pg_proc WHERE oid = to_regprocedure(k);
  IF m IS DISTINCT FROM pins->>k THEN RAISE EXCEPTION 'QA_SEED_REFUSED: deriva C11 em % (md5 %)', k, coalesce(m, 'ausente'); END IF;
 END LOOP;
 SELECT string_agg(DISTINCT t.tgrelid::regclass || ':' || t.tgfoid::regprocedure::text, ', ') INTO f FROM pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND t.tgrelid IN ('public.partner_orders'::regclass, 'public.accounts_receivable'::regclass,
   'public.accounts_receivable_installments'::regclass, 'public.partner_order_payment_terms'::regclass, 'public.partner_order_payment_schedule'::regclass,
   'public.partner_order_financial_links'::regclass, 'public.partner_financial_settings'::regclass, 'public.financial_audit_log'::regclass)
   AND t.tgfoid NOT IN (SELECT to_regprocedure(x)::oid FROM jsonb_object_keys(pins) x);
 IF f IS NOT NULL THEN RAISE EXCEPTION 'QA_SEED_REFUSED: gatilho não capturado em C11: %', f; END IF;
END $$;
{{LIB}}
{{LEGACY}}
INSERT INTO qa_b2bfin.ticket VALUES (txid_current(), 'seed');
-- Exceções (somente linhas manifestadas desta txid; demais linhas/sessões seguem o corpo original):
--  bloqueio homolog de títulos; guarda de origem interna (auth_required/emitente validado — não se inventa ator nem atestado
--  fiscal: o pedido fica com internal_origin_snapshot NULL, marcado QA-FIN); exigência de itens na aprovação (pedido fictício
--  sem itens/produto); cerca C2P1 de configurações financeiras (limite fictício sem ticket de writer).
SELECT qa_b2bfin.relax('platform_private.homolog_validation_block_receivable_insert()'::regprocedure);  -- gatilho FOR EACH STATEMENT no HML
CREATE TRIGGER zzz_qa_fin_row_fence BEFORE INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION qa_b2bfin.row_fence();
SELECT qa_b2bfin.relax('platform_private.b2b_internal_order_snapshot_guard()'::regprocedure);
SELECT qa_b2bfin.relax('public.tg_partner_orders_require_items()'::regprocedure);
SELECT qa_b2bfin.relax('platform_private.c2p1_settings_fence()'::regprocedure);
DO $$
DECLARE pmap jsonb := '{"A":["cdb78993-89e4-48db-956e-f40b014a8146","525fea87-e27e-43f7-af7b-a30064188332"],"B":["9d53f280-f828-4af8-a08c-3574263dc466","525fea87-e27e-43f7-af7b-a30064188332"],"C":["6100c3ac-ff5b-4596-a0e3-92665a5dcaab","85ba8b71-8514-4ec9-90d3-bfc7ab3ed214"]}'; k text; pid uuid; org uuid; cli uuid; cat uuid; oid_ uuid; rid uuid; sid uuid; hid uuid; hrid uuid; actor uuid; n int; orgs uuid[] := '{525fea87-e27e-43f7-af7b-a30064188332,85ba8b71-8514-4ec9-90d3-bfc7ab3ed214}';
BEGIN
 SELECT id INTO cat FROM public.financial_categories WHERE active AND upper(type) = 'RECEITA' ORDER BY created_at, id LIMIT 1;
 IF cat IS NULL THEN RAISE EXCEPTION 'QA_SEED_BLOCKED: nenhuma categoria RECEITA ativa (não criada pelo seed)'; END IF;
 FOR k IN SELECT unnest('{A,B,C}'::text[]) LOOP
  SELECT id, commercial_owner_organization_id, client_id INTO STRICT pid, org, cli FROM public.partner_accounts WHERE id = (pmap->k->>0)::uuid AND deleted_at IS NULL;
  IF org IS DISTINCT FROM (pmap->k->>1)::uuid THEN RAISE EXCEPTION 'QA_SEED_REFUSED: parceiro % fora do tenant QA esperado', k; END IF;
  INSERT INTO qa_b2bfin.manifest VALUES ('partner', k, 'public.partner_accounts', pid);
  INSERT INTO qa_b2bfin.manifest SELECT 'partner_user', k, 'public.partner_users', id FROM public.partner_users WHERE partner_id = pid;
  IF EXISTS (SELECT 1 FROM public.accounts_receivable WHERE partner_id = pid) OR EXISTS (SELECT 1 FROM public.partner_orders WHERE partner_id = pid) THEN RAISE EXCEPTION 'QA_SEED_REFUSED: parceiro % já tem pedidos/títulos', k; END IF;
  -- created_by (NOT NULL, FK auth.users): usuário QA manifestado do mesmo tenant — Gestor A (tenant A) / FIN C (tenant B). Fictício.
  actor := CASE WHEN org = '525fea87-e27e-43f7-af7b-a30064188332' THEN '1d0ea582-1d46-4152-8fbe-f425c74942c1'::uuid ELSE 'c3ed723f-1017-478e-99b2-25b48b3ab77e'::uuid END;
  oid_ := gen_random_uuid(); rid := gen_random_uuid();
  INSERT INTO qa_b2bfin.manifest VALUES ('order', k, 'public.partner_orders', oid_), ('receivable', k, 'public.accounts_receivable', rid);
  -- Status aprovado já na criação (vínculo financeiro exige pedido aprovado); sem itens, sem produção, sem NF.
  INSERT INTO public.partner_orders (id, numero, partner_id, cliente_id, status, subtotal, desconto_total, total, ready_for_production, observacoes)
   VALUES (oid_, 'QA-FIN-' || k || '-001', pid, cli, 'aprovado', 1000.00, 0, 1000.00, false, 'QA-FIN fixture sintética');
  IF (SELECT status::text FROM public.partner_orders WHERE id = oid_) <> 'aprovado' THEN RAISE EXCEPTION 'QA_SEED_INCOMPLETE: pedido % não ficou aprovado (guarda de crédito real)', k; END IF;
  PERFORM qa_b2bfin.permit_insert_receivable(rid, pid, org);
  INSERT INTO public.accounts_receivable (id, origin_type, origin_id, description, category_id, total_amount, issue_date, first_due_date, installment_count, partner_id, organization_id, notes, fiscal_invoice_required, created_by)
   VALUES (rid, 'B2B_ORDER', oid_, 'QA-FIN-' || k || ' título sentinela', cat, 1000.00, current_date, current_date + 30, 2, pid, org, 'QA-FIN fixture sintética sem NF/cobrança', false, actor);
  PERFORM qa_b2bfin.permit_close();
  SELECT count(*) INTO n FROM public.accounts_receivable_installments WHERE receivable_id = rid;
  IF n = 0 THEN
   INSERT INTO public.accounts_receivable_installments (receivable_id, installment_number, due_date, original_amount, received_amount, discount_amount, interest_amount, penalty_amount, net_amount, organization_id)
    VALUES (rid, 1, current_date + 30, 500.00, 0, 0, 0, 0, 500.00, org), (rid, 2, current_date + 60, 500.00, 0, 0, 0, 0, 500.00, org);
  END IF;
  INSERT INTO qa_b2bfin.manifest SELECT 'installment', k, 'public.accounts_receivable_installments', id FROM public.accounts_receivable_installments WHERE receivable_id = rid;
  INSERT INTO public.partner_order_financial_links (partner_order_id, partner_id, receivable_id) VALUES (oid_, pid, rid);
  PERFORM qa_b2bfin.seed_legacy_origin(oid_, rid, pid, org, k);
  INSERT INTO qa_b2bfin.manifest SELECT 'link', k, 'public.partner_order_financial_links', id FROM public.partner_order_financial_links WHERE receivable_id = rid;
  -- Histórico (só A): título fictício ENCERRADO (PAID por marcação, sem baixa/pagamento/recibo), vinculado e não aditivo ao crédito.
  IF k = 'A' THEN
   hid := gen_random_uuid(); hrid := gen_random_uuid();
   INSERT INTO qa_b2bfin.manifest VALUES ('order', 'A_HIST', 'public.partner_orders', hid), ('receivable_closed', 'A_HIST', 'public.accounts_receivable', hrid);
   INSERT INTO public.partner_orders (id, numero, partner_id, cliente_id, status, subtotal, desconto_total, total, ready_for_production, observacoes)
    VALUES (hid, 'QA-FIN-A-HIST', pid, cli, 'aprovado', 400.00, 0, 400.00, false, 'QA-FIN fixture sintética (histórico encerrado)');
   PERFORM qa_b2bfin.permit_insert_receivable(hrid, pid, org);
   INSERT INTO public.accounts_receivable (id, origin_type, origin_id, description, category_id, total_amount, issue_date, first_due_date, installment_count, partner_id, organization_id, notes, fiscal_invoice_required, created_by)
    VALUES (hrid, 'B2B_ORDER', hid, 'QA-FIN-A título encerrado (histórico)', cat, 400.00, current_date - 90, current_date - 60, 1, pid, org, 'QA-FIN fixture sintética encerrada sem pagamento real', false, actor);
   PERFORM qa_b2bfin.permit_close();
   IF (SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id = hrid) <> 1 THEN RAISE EXCEPTION 'QA_SEED_INCOMPLETE: histórico sem parcela'; END IF;
   INSERT INTO qa_b2bfin.manifest SELECT 'installment_closed', 'A_HIST', 'public.accounts_receivable_installments', id FROM public.accounts_receivable_installments WHERE receivable_id = hrid;
   UPDATE public.accounts_receivable_installments SET status = 'PAID', received_amount = original_amount WHERE receivable_id = hrid;
   UPDATE public.accounts_receivable SET status = 'PAID' WHERE id = hrid;
   INSERT INTO public.partner_order_financial_links (partner_order_id, partner_id, receivable_id, financial_status) VALUES (hid, pid, hrid, 'recebido');
   INSERT INTO qa_b2bfin.manifest SELECT 'link', 'A_HIST', 'public.partner_order_financial_links', id FROM public.partner_order_financial_links WHERE receivable_id = hrid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_financial_settings WHERE partner_id = pid) THEN
   sid := gen_random_uuid(); INSERT INTO qa_b2bfin.manifest VALUES ('credit_settings', k, 'public.partner_financial_settings', sid);
   INSERT INTO public.partner_financial_settings (id, partner_id, credit_limit) VALUES (sid, pid, CASE k WHEN 'A' THEN 5000 WHEN 'B' THEN 7000 ELSE 9000 END);
  END IF;
  INSERT INTO qa_b2bfin.manifest SELECT 'credit_settings', k, 'public.partner_financial_settings', id FROM public.partner_financial_settings WHERE partner_id = pid ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
DO $$ BEGIN IF (SELECT count(*) FROM qa_b2bfin.manifest WHERE kind='receivable') <> 3 OR (SELECT count(*) FROM qa_b2bfin.manifest WHERE kind='installment') < 3 THEN RAISE EXCEPTION 'QA_SEED_INCOMPLETE'; END IF; END $$;
DROP TRIGGER zzz_qa_fin_row_fence ON public.accounts_receivable;
DO $$ DECLARE r jsonb := qa_b2bfin.restore_all(); BEGIN IF jsonb_array_length(r) <> 4 THEN RAISE EXCEPTION 'QA_RESTORE_COUNT %', r; END IF; END $$;
DO $$ DECLARE pins jsonb := '{{PINS}}'; k text; BEGIN FOR k IN SELECT jsonb_object_keys(pins) LOOP
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(k)) IS DISTINCT FROM pins->>k THEN RAISE EXCEPTION 'QA_RESTORE_DRIFT %', k; END IF; END LOOP; END $$;
SELECT 'QA_SEED_RESTORED' k, 'C11 md5 conferidos' v;
DROP FUNCTION qa_b2bfin.seed_legacy_origin(uuid,uuid,uuid,uuid,text);
SELECT 'QA_TITLES_JSON' k, jsonb_object_agg(label, t) v FROM (
 SELECT m.label, jsonb_agg(jsonb_build_object('id', m.id, 'total', (SELECT total_amount FROM public.accounts_receivable WHERE id = m.id), 'order_id', (SELECT id FROM qa_b2bfin.manifest o WHERE o.kind='order' AND o.label=m.label),
   'installments', (SELECT jsonb_agg(i.id ORDER BY i.id) FROM qa_b2bfin.manifest i WHERE i.kind='installment' AND i.label=m.label))) t
 FROM qa_b2bfin.manifest m WHERE m.kind = 'receivable' GROUP BY m.label) x;
SELECT 'QA_HISTORY_JSON' k, jsonb_build_object('A', (SELECT jsonb_build_object('id', m.id, 'status', 'PAID', 'total', 400.00, 'credit_additive', false,
  'order_id', (SELECT id FROM qa_b2bfin.manifest o WHERE o.kind='order' AND o.label='A_HIST'),
  'installments', (SELECT jsonb_agg(i.id) FROM qa_b2bfin.manifest i WHERE i.kind='installment_closed')) FROM qa_b2bfin.manifest m WHERE m.kind='receivable_closed')) v;
COMMIT;
