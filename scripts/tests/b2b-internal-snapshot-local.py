"""Actual applied triggers, isolated PostgreSQL; stub Auth is not live RLS/JWT evidence."""
from pathlib import Path
import subprocess, tempfile, os, json, shutil
ROOT=Path(__file__).resolve().parents[2]
def main():
    tmp=Path(tempfile.mkdtemp(prefix='b2b-trigger-',dir='/tmp')); tmp.chmod(0o777)
    prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    data=tmp/'data'
    try:
        subprocess.run(prefix+['initdb','-D',str(data),'-A','trust','-U','local_audit'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(data),'-l',str(tmp/'server.log'),'-o',f'-k {tmp} -h "" -p 55484','start'],check=True,capture_output=True)
        base=(ROOT/'supabase/migrations/20261008192025_4c4bd075-7352-4dbc-9429-47a75e9500e4.sql').read_text()
        body=base[base.index('ALTER TABLE'):base.index('-- Fix Q-01')]
        follow=(ROOT/'supabase/migrations/20261008192236_b41d54d0-8ff8-4e47-ae9f-149434dd4fc2.sql').read_text()
        follow=follow[follow.index('DO $$ DECLARE'):].replace("IF md5(def)<>'6609bf943b9d2b0b95b556bc7c070b71' THEN RAISE EXCEPTION 'SNAPSHOT_GUARD_BASELINE_CHANGED'; END IF;",'')
        final=(ROOT/'supabase/migrations/20261008192601_beb97fe3-6ee1-40fe-8a35-dd35d43b318a.sql').read_text()
        final=final[final.index('DO $$ DECLARE'):final.index('FOREACH name')]+'END $$;'
        final=final.replace("IF md5(def)<>'8294269d170fc826c9ee384e14c82177' THEN RAISE EXCEPTION 'GUARD_BASELINE_CHANGED'; END IF;",'')
        schema='''BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('test.active',true)='true' THEN nullif(current_setting('test.org',true),'')::uuid END $$;
CREATE TYPE app_role AS ENUM ('administrador','financeiro','gestor_comercial');
CREATE FUNCTION fn_cc_can_prepare(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role',true) IN ('administrador','financeiro','gestor_comercial') $$;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role',true)=$2::text $$;
CREATE FUNCTION _saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.feature',true)='true' $$;
CREATE TYPE partner_order_status AS ENUM ('rascunho','em_analise_comercial','solicitado','aguardando_cotacao','aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado','cancelado','reprovado');
CREATE FUNCTION fn_b2b_status_is_operational(partner_order_status) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') $$;
CREATE TABLE clientes(id uuid,organization_id uuid);
CREATE TABLE partner_accounts(id uuid,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz,client_id uuid);
CREATE TABLE company_fiscal_settings(id uuid,organization_id uuid,is_active boolean,configuration_status text,accounting_validated_at timestamptz,legal_name text,cnpj text,configuration_version integer);
CREATE TABLE partner_orders(id uuid PRIMARY KEY,partner_id uuid,cliente_id uuid,created_by uuid,status partner_order_status,payment_condition_status text,payment_terms_id uuid,subtotal numeric,desconto_total numeric,total numeric,ready_for_production boolean);
CREATE TABLE partner_order_items(id uuid PRIMARY KEY,order_id uuid,quantidade numeric,preco_unitario numeric,desconto_percentual numeric,subtotal numeric,created_at timestamptz);
CREATE TABLE partner_order_payment_terms(id uuid PRIMARY KEY,partner_order_id uuid,final_amount numeric,net_amount_after_discount numeric,discount_percent_snapshot numeric,installment_count integer,approval_status text);
CREATE TABLE partner_order_payment_schedule(id uuid PRIMARY KEY,partner_order_id uuid,payment_terms_id uuid,installment_number integer,due_date date,amount numeric,principal_amount numeric,interest_amount numeric,status text,receivable_installment_id uuid);
'''
        tests='''
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false),set_config('test.org','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false),set_config('test.active','true',false),set_config('test.role','administrador',false),set_config('test.feature','true',false);
INSERT INTO partner_accounts VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,NULL,NULL);
INSERT INTO company_fiscal_settings VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'VALIDATED',now(),'TEMPORARY_AUDIT','TEMPORARY_AUDIT',1);
CREATE TABLE results(name text PRIMARY KEY,passed boolean);
CREATE FUNCTION pg_temp.denied(name text,command text,expected text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; INSERT INTO results VALUES(name,true); RETURN; END;
RAISE EXCEPTION 'Expected denial: %',name; END $$;
INSERT INTO partner_orders(id,partner_id,created_by,status,subtotal,desconto_total,total,ready_for_production) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),'em_analise_comercial',100,0,100,false);
INSERT INTO results SELECT 'own_A_optional_client_origin',internal_origin_snapshot->>'organization_id'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND internal_origin_snapshot->>'creditor_organization_id'=internal_origin_snapshot->>'issuer_organization_id' FROM partner_orders;
SELECT pg_temp.denied('spoof_origin',$q$UPDATE partner_orders SET internal_origin_snapshot='{}'::jsonb$q$,'SNAPSHOT_IMMUTABLE');
SELECT set_config('test.org','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',false);
SELECT pg_temp.denied('P_to_A',$q$UPDATE partner_orders SET total=101$q$,'ORIGIN_DENIED');
SELECT set_config('test.org','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false),set_config('test.active','false',false);
SELECT pg_temp.denied('inactive',$q$UPDATE partner_orders SET total=101$q$,'ACTOR_DENIED');
SELECT set_config('test.active','true',false),set_config('test.role','tecnico',false);
SELECT pg_temp.denied('insufficient_role',$q$UPDATE partner_orders SET total=101$q$,'ACTOR_DENIED');
SELECT set_config('test.role','administrador',false),set_config('test.feature','false',false);
SELECT pg_temp.denied('missing_feature',$q$UPDATE partner_orders SET total=101$q$,'ACTOR_DENIED');
SELECT set_config('test.feature','true',false);
SELECT set_config('test.org','',false);
SELECT pg_temp.denied('missing_organization',$q$UPDATE partner_orders SET total=101$q$,'ACTOR_DENIED');
SELECT set_config('test.org','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_temp.denied('premature_planning',$q$UPDATE partner_orders SET ready_for_production=true$q$,'DOWNSTREAM_UNVERIFIED');
INSERT INTO partner_order_items VALUES ('11111111-2222-4333-8444-555555555555','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,100,0,100,now());
INSERT INTO partner_order_payment_terms VALUES ('22222222-2222-4333-8444-555555555555','dddddddd-dddd-4ddd-8ddd-dddddddddddd',100,100,0,1,'not_required');
INSERT INTO partner_order_payment_schedule VALUES ('33333333-2222-4333-8444-555555555555','dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4333-8444-555555555555',1,current_date,100,100,0,'pending',NULL);
UPDATE partner_orders SET payment_terms_id='22222222-2222-4333-8444-555555555555',payment_condition_status='defined';
UPDATE partner_order_items SET quantidade='NaN';
SELECT pg_temp.denied('NaN_quantity',$q$UPDATE partner_orders SET status='aprovado'$q$,'ITEM_INVALID');
UPDATE partner_order_items SET quantidade=1;
UPDATE partner_order_payment_schedule SET amount=99;
SELECT pg_temp.denied('schedule_sum',$q$UPDATE partner_orders SET status='aprovado'$q$,'SCHEDULE_INVALID');
UPDATE partner_order_payment_schedule SET amount=100;
UPDATE partner_orders SET status='aprovado';
INSERT INTO results SELECT 'approval_seals_real_rows',internal_economic_snapshot->'items'->0->>'preco_unitario'='100' AND internal_economic_snapshot->'terms'->>'final_amount'='100' FROM partner_orders;
UPDATE partner_orders SET status='aprovado';
INSERT INTO results SELECT 'same_status_replay_preserves_seal',internal_economic_snapshot IS NOT NULL FROM partner_orders;
SELECT pg_temp.denied('sealed_planning',$q$UPDATE partner_orders SET ready_for_production=true$q$,'DOWNSTREAM_UNVERIFIED');
SELECT pg_temp.denied('sealed_price',$q$UPDATE partner_order_items SET preco_unitario=101$q$,'ECONOMICS_IMMUTABLE');
SELECT pg_temp.denied('sealed_discount',$q$UPDATE partner_order_items SET desconto_percentual=10$q$,'ECONOMICS_IMMUTABLE');
SELECT pg_temp.denied('sealed_terms',$q$UPDATE partner_order_payment_terms SET final_amount=101$q$,'ECONOMICS_IMMUTABLE');
SELECT pg_temp.denied('sealed_schedule',$q$UPDATE partner_order_payment_schedule SET amount=101$q$,'ECONOMICS_IMMUTABLE');
SELECT pg_temp.denied('delete_sealed_item',$q$DELETE FROM partner_order_items$q$,'ECONOMICS_IMMUTABLE');
SELECT pg_temp.denied('blocked_downstream',$q$UPDATE partner_orders SET status='em_producao'$q$,'DOWNSTREAM_UNVERIFIED');
SELECT pg_temp.denied('duplicate_order_id',$q$INSERT INTO partner_orders(id,partner_id,status) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rascunho')$q$,'duplicate key');
SELECT set_config('test.uid','',false);
SELECT pg_temp.denied('signed_out',$q$UPDATE partner_orders SET total=101$q$,'auth_required');
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
UPDATE company_fiscal_settings SET configuration_status='DRAFT';
SELECT pg_temp.denied('draft_issuer',$q$INSERT INTO partner_orders(id,partner_id,status) VALUES ('44444444-2222-4333-8444-555555555555','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rascunho')$q$,'ISSUER_NOT_VALIDATED');
INSERT INTO company_fiscal_settings SELECT '55555555-2222-4333-8444-555555555555',organization_id,is_active,'VALIDATED',now(),legal_name,cnpj,configuration_version FROM company_fiscal_settings;
SELECT pg_temp.denied('ambiguous_issuer',$q$INSERT INTO partner_orders(id,partner_id,status) VALUES ('44444444-2222-4333-8444-555555555555','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rascunho')$q$,'ISSUER_AMBIGUOUS');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM results WHERE passed IS DISTINCT FROM true) THEN RAISE EXCEPTION 'assertion failed'; END IF; END $$;
SELECT json_agg(name ORDER BY name) FROM results;
ROLLBACK;
'''
        r=subprocess.run(['psql','-X','-h',str(tmp),'-p','55484','-U','local_audit','-d','postgres','-v','ON_ERROR_STOP=1','-At'],input=schema+body+follow+final+tests,text=True,capture_output=True)
        if r.returncode: raise RuntimeError(r.stderr)
        cases=json.loads([x for x in r.stdout.splitlines() if x.startswith('[')][-1])
        print(json.dumps({'passed':len(cases),'cases':cases,'layer':'isolated PostgreSQL; stub Auth; not live RLS/JWT'}))
    finally:
        subprocess.run(prefix+['pg_ctl','-D',str(data),'stop','-m','immediate'],capture_output=True)
        shutil.rmtree(tmp)
if __name__=='__main__': main()
