"""Real restored schema sentinels. Never connects outside the disposable socket."""
def seed(X):
 T=X.T
 X.sql(f"""BEGIN; SET LOCAL session_replication_role=replica;
 INSERT INTO public.financial_categories(id,name,type) VALUES('{T.u(701)}','LOCAL SENTINEL','RECEITA');
 INSERT INTO public.payment_methods(id,name) VALUES('{T.u(702)}','LOCAL SENTINEL');
 INSERT INTO public.accounts_receivable(id,organization_id,origin_type,customer_id,description,category_id,total_amount,first_due_date,created_by) VALUES('{T.u(703)}','{T.A}','MANUAL','{T.C}','LOCAL SENTINEL','{T.u(701)}',1,current_date,'{T.W}');
 INSERT INTO public.accounts_receivable_installments(id,organization_id,receivable_id,installment_number,due_date,original_amount,net_amount) VALUES('{T.u(704)}','{T.A}','{T.u(703)}',1,current_date,1,1);
 INSERT INTO public.receivable_payments(id,organization_id,installment_id,amount_received,payment_method_id,created_by) VALUES('{T.u(705)}','{T.A}','{T.u(704)}',1,'{T.u(702)}','{T.W}');
 INSERT INTO public.financial_receipts(id,organization_id,receipt_number,receipt_year,receipt_seq,payment_id,receivable_id,customer_id,amount,payment_date,authenticity_code,issued_by) VALUES('{T.u(706)}','{T.A}','LOCAL-SENTINEL-701',2026,701,'{T.u(705)}','{T.u(703)}','{T.C}',1,current_date,'LOCAL-SENTINEL-701','{T.W}');
 INSERT INTO public.company_fiscal_settings(id,organization_id) VALUES('{T.u(707)}','{T.A}');
 INSERT INTO public.fiscal_invoices(id,organization_id,invoice_type,created_by,company_settings_id,customer_id,receivable_id) VALUES('{T.u(708)}','{T.A}','NFE','{T.W}','{T.u(707)}','{T.C}','{T.u(703)}');
 INSERT INTO public.fiscal_invoice_items(id,fiscal_invoice_id,item_sequence,item_kind) VALUES('{T.u(709)}','{T.u(708)}',1,'OTHER');
 INSERT INTO public.fiscal_events(id,fiscal_invoice_id,event_type) VALUES('{T.u(710)}','{T.u(708)}','CREATED');
 INSERT INTO public.financial_documents(id,organization_id,owner_type,owner_id,document_type,file_name,storage_path,uploaded_by) VALUES('{T.u(711)}','{T.A}','RECEIVABLE','{T.u(703)}','OUTRO','local-sentinel.txt','local-fixture/sentinel-701.txt','{T.W}');
 INSERT INTO public.comunicacao_eventos(id,event_key,idempotency_key) VALUES('{T.u(712)}','local.sentinel','local-sentinel-event-701');
 INSERT INTO public.comunicacao_outbox(id,event_id,template_chave,template_versao,template_snapshot,canal,recipient_user_id,idempotency_key) VALUES('{T.u(713)}','{T.u(712)}','local.sentinel',1,'{{}}'::jsonb,'in_app','{T.W}','local-sentinel-outbox-701');
 INSERT INTO public.os_faturamento_base(id,origem_os_tipo,ordem_servico_id,cliente_id,produto_id,modelo_precificacao,created_by) VALUES('{T.u(714)}','TRADICIONAL','{T.O2}','{T.C}','{T.PROD}','LOCAL_SENTINEL','{T.W}');
 COMMIT;""")
 import json
 counts=json.loads(T.zero()); assert all(counts[t]>0 for t in T.TABLES),counts
 X.ok('all ten real downstream tables have EXISTING nonempty sentinels before envase')