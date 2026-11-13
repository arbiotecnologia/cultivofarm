-- Teste PostgreSQL efetivo da migração CANDIDATA do ledger NFS-e na réplica
-- local descartável. Transação única com ROLLBACK. Nunca executar em produção.
\set ON_ERROR_STOP on
begin;
\ir fixtures.sql
insert into public.fiscal_environment_marker(id, project_ref, environment_label, production_emission_allowed) values (true, 'swzpzcwiasxmjutrmvkm', 'PRODUCTION', false) on conflict (id) do update set production_emission_allowed = false;
set local session_replication_role = origin;
\ir migration/20261113170000_nfse_nacional_transmission_ledger.sql
create temp table qa_result(caso text primary key, ok boolean, detalhe text);
grant all on qa_result to authenticated, service_role;
create or replace function pg_temp.expect_error(p_caso text, p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into qa_result values (p_caso,false,'sem erro');
  exception when others then insert into qa_result values (p_caso, sqlstate = p_code or sqlerrm like p_code||'%', sqlstate||' '||sqlerrm); end;
end $$;
grant execute on function pg_temp.expect_error(text,text,text) to authenticated, service_role;

-- rascunho canônico real pela prestação (admin A)
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
create temp table qa_inv as select (public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a01']::uuid[],'qa-billing-key-0101')->>'invoice_id')::uuid id;
select pg_temp.expect_error('authenticated_sem_execute', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br')$q$, '42501');
reset role;

-- edge (service_role) — empresa ainda sem NFS-e habilitada
set local role service_role;
select pg_temp.expect_error('nao_configurada', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br')$q$, 'PT409');
reset role;
set local session_replication_role = replica;
update public.company_fiscal_settings set nfse_enabled = true, nfse_provider = 'NFSE_NACIONAL', nfse_credential_ref = 'cert:qa', nfse_series = '1', crt = '3' where id = '00000000-0000-4000-8000-0000000c0a01';
set local session_replication_role = origin;
set local role service_role;
select pg_temp.expect_error('ator_outra_empresa', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000b1',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br')$q$, '42501');
select pg_temp.expect_error('gestor_nao_emite', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a2',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br')$q$, '42501');
select pg_temp.expect_error('producao_divergente', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'PRODUCTION','sefin.nfse.gov.br')$q$, '22023');
select pg_temp.expect_error('host_errado', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'HOMOLOGATION','evil.example.com')$q$, '23514');
create temp table qa_b1 as select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br') r;
insert into qa_result select 'begin_aloca_numero', r->>'state'='PENDING' and (r->>'dps_number')::int=1 and r->>'dps_series'='1' and not (r->>'idempotent_replay')::boolean, r->>'dps_number' from qa_b1;
insert into qa_result select 'begin_replay', (x->>'idempotent_replay')::boolean and x->>'id' = (select r->>'id' from qa_b1), x->>'id'
  from (select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000001',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br') x) s;
select pg_temp.expect_error('chave_outro_conteudo', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000001',repeat('b',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br')$q$, 'PT409');
select pg_temp.expect_error('segunda_transmissao_ativa', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000002',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br')$q$, 'PT409');
select pg_temp.expect_error('autorizar_sem_envio', $q$select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b1),'SUCCEEDED','AUTHORIZED','{}')$q$, 'PT409');
select pg_temp.expect_error('sent_numero_divergente', $q$select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b1),'SENT','PENDING',jsonb_build_object('dpsId','DPS3147006211222333000181'||'00001'||'000000000000009','dpsXmlSha256',repeat('c',64)))$q$, '22023');
select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b1),'SENT','PENDING',jsonb_build_object('dpsId','DPS3147006211222333000181'||'00001'||'000000000000001','dpsXmlSha256',repeat('c',64)));
select pg_temp.expect_error('autorizar_sem_chave', $q$select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b1),'SUCCEEDED','AUTHORIZED',jsonb_build_object('nfseXmlSha256',repeat('d',64)))$q$, '23514');
reset role;
insert into qa_result select 'nota_segue_rascunho_enquanto_enviada', normalized_status='DRAFT' and access_key is null, normalized_status from public.fiscal_invoices where id=(select id from qa_inv);
set local role service_role;
select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b1),'SUCCEEDED','AUTHORIZED',jsonb_build_object('accessKey',repeat('3',50),'nfseNumber','17','nfseXmlSha256',repeat('d',64)));
reset role;
insert into qa_result select 'nota_autorizada', normalized_status='AUTHORIZED' and access_key=repeat('3',50) and provider_reference=access_key and invoice_number='17' and authorized_at is not null, normalized_status||'/'||coalesce(invoice_number,'-') from public.fiscal_invoices where id=(select id from qa_inv);
insert into qa_result select 'sem_recebivel_automatico', count(*)=0, count(*)::text from public.accounts_receivable where organization_id='00000000-0000-4000-8000-00000000000a';
set local role service_role;
select pg_temp.expect_error('autorizada_terminal', $q$select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b1),'FAILED','REJECTED','{}')$q$, 'PT409');
select pg_temp.expect_error('nota_autorizada_nao_reenvia', $q$select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv),'qa-nfse-key-000003',repeat('a',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br')$q$, 'PT409');
reset role;
-- rejeição mantém rascunho e permite nova tentativa com próximo número
set local role authenticated;
create temp table qa_inv2 as select (public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a02']::uuid[],'qa-billing-key-0102')->>'invoice_id')::uuid id;
reset role; set local role service_role;
create temp table qa_b2 as select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv2),'qa-nfse-key-000004',repeat('e',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br') r;
select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b2),'SENT','PENDING',jsonb_build_object('dpsId','DPS3147006211222333000181'||'00001'||'000000000000002','dpsXmlSha256',repeat('c',64)));
select public.rpc_nfse_transmit_record_v1((select (r->>'id')::uuid from qa_b2),'FAILED','REJECTED',jsonb_build_object('httpStatus',400,'errors',jsonb_build_array(jsonb_build_object('code','E0312','description','sintético'))));
create temp table qa_b3 as select public.rpc_nfse_transmit_begin_v1('00000000-0000-4000-8000-0000000000a1',(select id from qa_inv2),'qa-nfse-key-000005',repeat('e',64),'HOMOLOGATION','sefin.producaorestrita.nfse.gov.br') r;
insert into qa_result select 'rejeicao_permite_nova_tentativa', (r->>'dps_number')::int = 3, r->>'dps_number' from qa_b3;
reset role;
insert into qa_result select 'rejeitada_segue_rascunho', normalized_status='DRAFT', normalized_status from public.fiscal_invoices where id=(select id from qa_inv2);
-- leitura por RLS: A vê, B não vê
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
insert into qa_result select 'rls_a_ve_proprias', count(*)=3, count(*)::text from public.nfse_transmissions;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b1',true);
insert into qa_result select 'rls_b_nao_ve_a', count(*)=0, count(*)::text from public.nfse_transmissions;
select pg_temp.expect_error('authenticated_sem_escrita', $q$update public.nfse_transmissions set outcome='AUTHORIZED'$q$, '42501');
reset role;
select caso, case when ok then 'PASS' else 'FAIL' end resultado, left(detalhe,140) detalhe from qa_result order by caso;
select count(*) filter (where ok) passou, count(*) filter (where not ok) falhou from qa_result;
rollback;
