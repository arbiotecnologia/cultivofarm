-- Teste PostgreSQL efetivo (réplica local descartável do esquema de produção
-- swzpzcwiasxmjutrmvkm, lido em modo somente leitura). Tudo em uma transação
-- com ROLLBACK final. Dados 100% sintéticos. Nunca executar contra produção.
\set ON_ERROR_STOP on
begin;
-- Fixtures inseridas com gatilhos desativados (apenas a preparação); o caminho
-- testado roda depois com gatilhos ativos (session_replication_role=origin).
set local session_replication_role = replica;
-- fixtures sintéticas
insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000000a1','qa-a@example.invalid'),('00000000-0000-4000-8000-0000000000b1','qa-b@example.invalid'),('00000000-0000-4000-8000-0000000000a2','qa-gestor@example.invalid');
insert into public.organizations(id,nome,ativo,status) values ('00000000-0000-4000-8000-00000000000a','QA ORG A',true,'ativa'),('00000000-0000-4000-8000-00000000000b','QA ORG B',true,'ativa');
insert into public.profiles(user_id,organization_id,ativo) values ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-00000000000a',true),('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-00000000000b',true),('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-00000000000a',true);
insert into public.user_roles(user_id,role) values ('00000000-0000-4000-8000-0000000000a1','administrador'),('00000000-0000-4000-8000-0000000000b1','administrador'),('00000000-0000-4000-8000-0000000000a2','gestor');
insert into public.company_fiscal_settings(id,organization_id,is_active,state,fiscal_environment,municipality_ibge_code,cnpj,legal_name)
  values ('00000000-0000-4000-8000-0000000c0a01','00000000-0000-4000-8000-00000000000a',true,'MG','HOMOLOGATION','3147006','11222333000181','QA PRESTADORA A'),
         ('00000000-0000-4000-8000-0000000c0b01','00000000-0000-4000-8000-00000000000b',true,'SP','HOMOLOGATION','3550308','44555666000181','QA PRESTADORA B');
insert into public.clientes(id,codigo_cliente,nome,organization_id) values
  ('00000000-0000-4000-8000-00000000c1a1','QA-C-A1','QA Tomador A1','00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-00000000c1a2','QA-C-A2','QA Tomador A2','00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-00000000c1b1','QA-C-B1','QA Tomador B1','00000000-0000-4000-8000-00000000000b');
insert into public.catalog_services(id,organization_id,name,unit,is_active) values
  ('00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000000a','QA Consultoria','H',true),
  ('00000000-0000-4000-8000-0000000005a2','00000000-0000-4000-8000-00000000000a','QA Sem perfil','UN',true),
  ('00000000-0000-4000-8000-0000000005b1','00000000-0000-4000-8000-00000000000b','QA Serv B','UN',true);
insert into public.service_fiscal_profiles(organization_id,service_id,source_reference,service_name,is_active,lc116_item,national_taxation_code,incidence_municipality_ibge_code,iss_rate,iss_withheld_default)
  values ('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','qa-consultoria','QA Consultoria',true,'17.01','170101','3147006',2.5,false),
         ('00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000005b1','qa-serv-b','QA Serv B',true,'17.01','170101','3550308',3,false);
insert into public.service_engagements(id,organization_id,service_id,customer_id,performed_on,quantity,unit_price,status) values
  ('00000000-0000-4000-8000-0000000e0a01','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a1','2026-11-10',2,150,'READY'),
  ('00000000-0000-4000-8000-0000000e0a02','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a1','2026-11-11',1.5,100,'READY'),
  ('00000000-0000-4000-8000-0000000e0a03','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a2','2026-11-11',1,90,'READY'),
  ('00000000-0000-4000-8000-0000000e0a04','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a2','00000000-0000-4000-8000-00000000c1a1','2026-11-12',1,50,'READY'),
  ('00000000-0000-4000-8000-0000000e0b01','00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000005b1','00000000-0000-4000-8000-00000000c1b1','2026-11-12',1,80,'READY');
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
