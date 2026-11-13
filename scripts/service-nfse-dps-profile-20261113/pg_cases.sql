\set ON_ERROR_STOP on
create temp table r(caso text primary key, ok boolean, det text);
grant all on r to authenticated;
create function pg_temp.err(c text, q text, code text) returns void language plpgsql as $$
begin begin execute q; insert into r values (c,false,'sem erro'); exception when others then insert into r values (c, sqlstate=code or sqlerrm like code||'%', sqlstate||' '||sqlerrm); end; end $$;
-- Massa 100% sintética (UUIDs fictícios, códigos de teste, nenhum dado real)
insert into user_roles values ('00000000-0000-4000-8000-0000000000a1','administrador','00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-0000000000b1','administrador','00000000-0000-4000-8000-00000000000b'),
  ('00000000-0000-4000-8000-0000000000a2','gestor','00000000-0000-4000-8000-00000000000a');
insert into company_fiscal_settings values ('00000000-0000-4000-8000-00000000000a', true, 'HOMOLOGATION');
insert into catalog_services values ('00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000000a','Serviço sintético','h');
insert into service_fiscal_profiles(organization_id, service_id, national_taxation_code, incidence_municipality_ibge_code, iss_rate)
  values ('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','010101','9999901',2.5);
insert into service_engagements values ('00000000-0000-4000-8000-0000000e0a01','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a1','2026-11-01',2,100,null,'READY',null,null);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',false);
-- Perfil inválido rejeitado pelo gatilho
select pg_temp.err('gatilho_rejeita_nbs_invalido', $q$update service_fiscal_profiles set federal_withholding_defaults='{"nfse_dps":{"v":1,"nbs_code":"12345"}}'$q$, '22023');
select pg_temp.err('gatilho_rejeita_chave_desconhecida', $q$update service_fiscal_profiles set federal_withholding_defaults='{"nfse_dps":{"v":1,"foo":1}}'$q$, '22023');
select pg_temp.err('gatilho_rejeita_sn_com_fed', $q$update service_fiscal_profiles set federal_withholding_defaults='{"nfse_dps":{"v":1,"tot_trib":{"mode":"SN","sn":6,"fed":1}}}'$q$, '22023');
-- Faturamento sem complemento: rascunho sem nfse_dps (compatível)
create temp table b1 as select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a01']::uuid[],'qa-dps-key-000000001') x;
insert into r select 'fatura_sem_complemento', fiscal_profile_snapshot = '{}'::jsonb and draft_version=1, fiscal_profile_snapshot::text from fiscal_invoices where id=(select (x->>'invoice_id')::uuid from b1);
-- Edição explícita do item no rascunho (descrição/valor) — deve ser preservada
reset role;
update fiscal_invoice_items set description='Descrição editada manualmente', unit_value=120 where fiscal_invoice_id=(select (x->>'invoice_id')::uuid from b1);
set role authenticated;
-- Perfil passa a ter complemento válido
update service_fiscal_profiles set federal_withholding_defaults='{"nfse_dps":{"v":1,"nbs_code":"012345678","service_location_ibge_code":"9999902","pis_cofins":{"cst":"01","p_aliq_pis":0.65,"p_aliq_cofins":3,"ret_type":"2"},"tot_trib":{"mode":"PERCENT","fed":1.5,"est":0,"mun":2.5}}}', iss_rate=3;
insert into r values ('gatilho_aceita_valido', true, 'ok');
-- Gestor não reaplica
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a2',false);
select pg_temp.err('gestor_negado', format('select public.rpc_service_billing_reapply_profile_v1(%L,1)', (select x->>'invoice_id' from b1)), '42501');
-- Outra empresa não enxerga
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b1',false);
select pg_temp.err('outra_empresa_negada', format('select public.rpc_service_billing_reapply_profile_v1(%L,1)', (select x->>'invoice_id' from b1)), 'P0002');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',false);
select pg_temp.err('versao_antiga_conflito', format('select public.rpc_service_billing_reapply_profile_v1(%L,7)', (select x->>'invoice_id' from b1)), 'PT409');
create temp table a1 as select public.rpc_service_billing_reapply_profile_v1((select (x->>'invoice_id')::uuid from b1),1) x;
insert into r select 'reaplica_mesmo_rascunho', (x->>'changed')::boolean and (x->>'draft_version')::int=2 and x->>'invoice_id' = (select x->>'invoice_id' from b1), x::text from a1;
insert into r select 'uma_nota_so', count(*)=1, count(*)::text from fiscal_invoices;
insert into r select 'snapshot_cabecalho', fiscal_profile_snapshot->'nfse_dps'->>'nbs_code'='012345678' and fiscal_profile_snapshot->'nfse_dps'->>'service_location_ibge_code'='9999902', fiscal_profile_snapshot::text from fiscal_invoices;
insert into r select 'item_preserva_edicao', description='Descrição editada manualmente' and unit_value=120 and (tax_snapshot->>'iss_rate')::numeric=3 and fiscal_profile_snapshot->>'national_tax_code'='010101', description||' '||unit_value||' '||tax_snapshot::text from fiscal_invoice_items;
create temp table a2 as select public.rpc_service_billing_reapply_profile_v1((select (x->>'invoice_id')::uuid from b1),2) x;
insert into r select 'reaplicar_idempotente', not (x->>'changed')::boolean and (x->>'draft_version')::int=2, x::text from a2;
-- Transmitido bloqueia
reset role; insert into nfse_transmissions(fiscal_invoice_id) select (x->>'invoice_id')::uuid from b1; set role authenticated;
select pg_temp.err('transmitido_bloqueia', format('select public.rpc_service_billing_reapply_profile_v1(%L,2)', (select x->>'invoice_id' from b1)), 'PT409');
reset role; delete from nfse_transmissions; update fiscal_invoices set status='AUTHORIZED', normalized_status='AUTHORIZED'; set role authenticated;
select pg_temp.err('fechado_bloqueia', format('select public.rpc_service_billing_reapply_profile_v1(%L,2)', (select x->>'invoice_id' from b1)), 'PT409');
reset role; update fiscal_invoices set status='DRAFT', normalized_status='DRAFT', environment='NOT_CONFIGURED'; set role authenticated;
select pg_temp.err('nao_homologacao_bloqueia', format('select public.rpc_service_billing_reapply_profile_v1(%L,2)', (select x->>'invoice_id' from b1)), 'PT409');
-- Novo faturamento já leva o complemento
reset role; insert into service_engagements values ('00000000-0000-4000-8000-0000000e0a02','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-0000000005a1','00000000-0000-4000-8000-00000000c1a1','2026-11-02',1,50,null,'READY',null,null); set role authenticated;
create temp table b2 as select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a02']::uuid[],'qa-dps-key-000000002') x;
insert into r select 'fatura_com_complemento', fiscal_profile_snapshot->'nfse_dps'->'tot_trib'->>'mode'='PERCENT', fiscal_profile_snapshot::text from fiscal_invoices where id=(select (x->>'invoice_id')::uuid from b2);
create temp table b3 as select public.rpc_service_billing_create_draft_v1(array['00000000-0000-4000-8000-0000000e0a02']::uuid[],'qa-dps-key-000000002') x;
insert into r select 'faturamento_replay_sem_duplicar', (x->>'replayed')::boolean and x->>'invoice_id'=(select x->>'invoice_id' from b2), x::text from b3;
reset role;
select caso, ok, left(det,140) from r order by caso;
select count(*) filter (where ok) passou, count(*) filter (where not ok) falhou from r;
