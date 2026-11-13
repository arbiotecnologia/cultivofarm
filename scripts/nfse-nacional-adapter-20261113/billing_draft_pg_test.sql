-- Teste PostgreSQL efetivo (réplica local descartável do esquema de produção
-- swzpzcwiasxmjutrmvkm, lido em modo somente leitura). Tudo em uma transação
-- com ROLLBACK final. Dados 100% sintéticos. Nunca executar contra produção.
\set ON_ERROR_STOP on
begin;
\ir fixtures.sql
set local session_replication_role = origin;

create temp table qa_result(caso text primary key, ok boolean, detalhe text);
grant all on qa_result to authenticated;
create or replace function pg_temp.expect_error(p_caso text, p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into qa_result values (p_caso,false,'sem erro');
  exception when others then insert into qa_result values (p_caso, sqlstate = p_code or sqlerrm like p_code||'%', sqlstate||' '||sqlerrm); end;
end $$;

-- ator: administrador A (gatilhos e RPCs reais, papel authenticated)
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temp table qa_first as select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a01','00000000-0000-4000-8000-0000000e0a02']::uuid[],'qa-billing-key-0001') r;
insert into qa_result select 'cria_rascunho', (r->>'invoice_id') is not null and (r->>'replayed')::boolean = false, r::text from qa_first;
reset role;
insert into qa_result select 'nota_nfse_draft', count(*)=1, string_agg(invoice_type||'/'||document_model||'/'||normalized_status||'/'||environment||'/'||total_amount,';')
  from public.fiscal_invoices where id = (select (r->>'invoice_id')::uuid from qa_first) and invoice_type='NFSE' and document_model='NFSE' and normalized_status='DRAFT' and environment='HOMOLOGATION' and total_amount=450.00 and organization_id='00000000-0000-4000-8000-00000000000a' and company_settings_id='00000000-0000-4000-8000-0000000c0a01' and customer_id='00000000-0000-4000-8000-00000000c1a1';
insert into qa_result select 'itens_snapshot', count(*)=2 and bool_and(item_kind='SERVICE' and source_item_type='SERVICE' and source_item_id='00000000-0000-4000-8000-0000000005a1' and fiscal_profile_snapshot->>'national_tax_code'='170101' and (tax_snapshot->>'iss_rate')::numeric=2.5), string_agg(item_sequence||':'||net_value||':'||coalesce(commercial_unit,'-'),',')
  from public.fiscal_invoice_items where fiscal_invoice_id = (select (r->>'invoice_id')::uuid from qa_first);
insert into qa_result select 'prestacoes_faturadas', count(*)=2 and bool_and(status='BILLED' and fiscal_invoice_id=(select (r->>'invoice_id')::uuid from qa_first)), string_agg(status,',')
  from public.service_engagements where id in ('00000000-0000-4000-8000-0000000e0a01','00000000-0000-4000-8000-0000000e0a02');
insert into qa_result select 'sem_recebivel', count(*)=0, count(*)::text from public.accounts_receivable where organization_id='00000000-0000-4000-8000-00000000000a';
set local role authenticated;

create temp table qa_replay as select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a02','00000000-0000-4000-8000-0000000e0a01']::uuid[],'qa-billing-key-0001') r;
insert into qa_result select 'replay_mesma_nota', (q.r->>'replayed')::boolean and q.r->>'invoice_id' = f.r->>'invoice_id', q.r::text from qa_replay q, qa_first f;
reset role;
insert into qa_result select 'sem_duplicata', count(*)=1, count(*)::text from public.fiscal_invoices where organization_id='00000000-0000-4000-8000-00000000000a';
set local role authenticated;
select pg_temp.expect_error('chave_reusada_outro_conjunto', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a03']::uuid[],'qa-billing-key-0001')$q$, 'PT409');
select pg_temp.expect_error('ja_faturada_outra_chave', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a01']::uuid[],'qa-billing-key-0002')$q$, 'PT409');
select pg_temp.expect_error('clientes_misturados', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a03','00000000-0000-4000-8000-0000000e0a04']::uuid[],'qa-billing-key-0003')$q$, '22023');
select pg_temp.expect_error('sem_perfil_fiscal', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a04']::uuid[],'qa-billing-key-0004')$q$, 'P0002');
select pg_temp.expect_error('prestacao_outra_empresa', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0b01']::uuid[],'qa-billing-key-0005')$q$, 'P0002');
select pg_temp.expect_error('chave_invalida', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a03']::uuid[],'curta')$q$, '22023');
-- gestor não fatura
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a2',true);
select pg_temp.expect_error('gestor_negado', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a03']::uuid[],'qa-billing-key-0006')$q$, '42501');
-- sem sessão
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('sem_sessao', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a03']::uuid[],'qa-billing-key-0007')$q$, '28000');
-- empresa B fatura a própria prestação e não enxerga a de A
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b1',true);
select pg_temp.expect_error('b_nao_fatura_a', $q$select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a03']::uuid[],'qa-billing-key-0008')$q$, 'P0002');
create temp table qa_b as select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0b01']::uuid[],'qa-billing-key-0001') r;
reset role;
insert into qa_result select 'b_mesma_chave_isolada', (r->>'replayed')::boolean = false and exists(select 1 from public.fiscal_invoices i where i.id=(r->>'invoice_id')::uuid and i.organization_id='00000000-0000-4000-8000-00000000000b' and i.total_amount=80), r::text from qa_b;

select caso, case when ok then 'PASS' else 'FAIL' end resultado, left(detalhe,160) detalhe from qa_result order by caso;
select count(*) filter (where ok) passou, count(*) filter (where not ok) falhou from qa_result;
rollback;
