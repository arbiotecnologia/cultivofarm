#!/usr/bin/env python3
"""Exact forecast function bodies, isolated synthetic schema; NOT fiscal/JWT proof."""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[5]
PG = next(Path('/nix/store').glob('*-postgresql-17.11/bin'))
os.environ['PATH'] = str(PG) + ':' + os.environ['PATH']
spec = importlib.util.spec_from_file_location('forecast_disposable_pg', ROOT/'scripts/contracts-c2-20261022/integral/pg.py')
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)
OUT = Path(sys.argv[2])
OUT.mkdir(exist_ok=False)
source = Path(sys.argv[1]).read_text()
reconcile_source = Path(sys.argv[3]).read_text()
before = sys.argv[4] == 'before'
schedule_before = sys.argv[4] == 'schedule-before'
F = '00000000-0000-0000-0000-000000000001'
O = '00000000-0000-0000-0000-000000000002'
D = '00000000-0000-0000-0000-000000000003'
R = '00000000-0000-0000-0000-000000000004'
I = '00000000-0000-0000-0000-000000000005'
checks = []

def raw(sql):
    return subprocess.run(pg.psql(), input='\\set VERBOSITY verbose\n'+sql, capture_output=True, text=True, timeout=20)

def record(name, result, expected):
    state = pg.sql(f"SELECT jsonb_build_object('state',state,'residual',residual_amount,'version',version) FROM platform_private.b2b_financial_forecasts WHERE id='{F}';")
    row = dict(name=name, exit=result.returncode, stdout=result.stdout, stderr=result.stderr, state=json.loads(state))
    checks.append(row)
    assert expected(result), row

def event(payload='{}', version=1, reference=I):
    return f"SELECT platform_private.b2b_financial_forecast_transition_v1('{F}',{version},'EMISSION_STARTED','{reference}','{payload}'::jsonb);"

def pre(name, result, expected):
    row = dict(name=name, exit=result.returncode, stdout=result.stdout, stderr=result.stderr)
    checks.append(row)
    assert expected(result), row

def reset(state='aguardando_fiscal', residual=18):
    pg.sql(f"TRUNCATE platform_private.b2b_financial_forecast_events; UPDATE platform_private.b2b_financial_forecasts SET state='{state}',residual_amount={residual},fiscal_intent_id=NULL,version=version+1; ")
    return int(pg.sql(f"SELECT version FROM platform_private.b2b_financial_forecasts WHERE id='{F}';"))

try:
    pg.start()
    pg.sql("""CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
      CREATE SCHEMA platform_private; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE TYPE public.app_role AS ENUM('administrador','financeiro','gestor','gestor_comercial');
      -- Declared seam (cf7d5fb/214): internal actor of org D for the synthetic approver only.
      CREATE FUNCTION platform_private.c2p1_internal_actor(public.app_role[]) RETURNS uuid LANGUAGE sql AS $$
        SELECT '00000000-0000-0000-0000-000000000003'::uuid WHERE auth.uid()='00000000-0000-0000-0000-0000000000aa'$$;
      CREATE TABLE public.partner_orders(id uuid PRIMARY KEY,partner_id uuid,status text,approved_by uuid,approved_at timestamptz,
        requires_financial_approval boolean,payment_terms_id uuid,payment_condition_status text,credit_approved_at timestamptz,
        credit_approved_by uuid,internal_economic_snapshot jsonb,final_amount_with_interest numeric,total numeric);
      CREATE TABLE public.partner_order_payment_terms(id uuid,partner_order_id uuid,approval_status text,approved_by uuid,approved_at timestamptz);
      CREATE TABLE public.partner_accounts(id uuid,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);
      CREATE TABLE public.partner_order_payment_schedule(partner_order_id uuid,installment_number integer,amount numeric,status text DEFAULT 'pending',receivable_installment_id uuid);
      CREATE TABLE public.partner_order_items(id uuid,order_id uuid);
      CREATE TABLE platform_private.b2b_document_allocations(document_id uuid,receivable_id uuid,order_id uuid);
      CREATE TABLE platform_private.b2b_fiscal_service_permits(transaction_id bigint,document_id uuid,invoice_id uuid,order_id uuid,organization_id uuid,partner_id uuid);
      CREATE FUNCTION platform_private.b2b_order_residual(uuid) RETURNS numeric LANGUAGE sql AS $$SELECT 9::numeric$$;
      CREATE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void LANGUAGE plpgsql AS $$BEGIN
        RAISE EXCEPTION 'B2B_FISCAL_SERVICE_PERMIT_REQUIRED' USING ERRCODE='42501';END$$;
    """)
    # Actual forecast tables/triggers/functions, no rewritten permissive body.
    table_start = source.index('CREATE TABLE platform_private.b2b_financial_forecasts')
    table_end = source.index('CREATE FUNCTION public.get_b2b_financial_forecast_secure')
    pg.sql(source[table_start:table_end])
    for name, text in [('transition',source),('cancel_residual',source),('reconcile_fiscal',reconcile_source)]:
        match = re.search(r'CREATE FUNCTION platform_private\.b2b_financial_forecast_'+name+r'_v1\(.*?END\$\$;', text,re.S)
        assert match, name
        pg.sql(match.group())
    # Execute the candidate ACL statements, not just the extracted body.
    for text in (source,reconcile_source):
        for statement in re.findall(r'(?:REVOKE ALL|GRANT EXECUTE) ON FUNCTION platform_private\.b2b_financial_forecast_.*?;',text,re.S):
            pg.sql(statement)
    pg.sql(f"""INSERT INTO public.partner_accounts VALUES('{R}','{D}',true,NULL);
      INSERT INTO public.partner_orders VALUES('{O}','{R}','aprovado','{D}',now(),false,'{I}','defined',NULL,NULL,'{{"total":18}}',18,18);
      INSERT INTO public.partner_order_payment_schedule(partner_order_id,installment_number,amount) VALUES('{O}',1,18);
      INSERT INTO public.partner_order_items VALUES('{I}','{O}');
      UPDATE platform_private.b2b_financial_forecasts SET id='{F}';
    """.replace(f"UPDATE platform_private.b2b_financial_forecasts SET id='{F}';",''))
    # Creation pilot: out of grant the helper defers BEFORE snapshot/schedule checks.
    pg.sql("SET request.jwt.claim.sub='00000000-0000-0000-0000-0000000000aa';")
    A='00000000-0000-0000-0000-0000000000aa'
    pre('no grant: creation deferred, no forecast',raw(f"SET request.jwt.claim.sub='{A}';SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\"}}');SELECT count(*) FROM platform_private.b2b_financial_forecasts;"),lambda r:r.returncode==0 and 'FORECAST_CREATION_NOT_GRANTED' in r.stdout and r.stdout.strip().endswith('0'))
    pg.sql(f"INSERT INTO platform_private.b2b_forecast_creation_allowlist_v1(actor_id,organization_id,partner_id,order_id,valid_until) VALUES('{A}','{D}','{R}','{O}',now()+interval '1 hour');")
    pre('grant but gate closed: deferred',raw(f"SET request.jwt.claim.sub='{A}';SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\"}}');"),lambda r:r.returncode==0 and 'FORECAST_CREATION_NOT_GRANTED' in r.stdout)
    pg.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=true WHERE singleton;")
    pre('other actor with gate open: deferred',raw(f"SET request.jwt.claim.sub='{R}';SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\"}}');"),lambda r:r.returncode==0 and 'FORECAST_CREATION_NOT_GRANTED' in r.stdout)
    pg.sql(f"SET request.jwt.claim.sub='{A}';SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\",\"exposure\":0}}');")
    F = pg.sql(f"SELECT id FROM platform_private.b2b_financial_forecasts WHERE order_id='{O}';")
    pg.sql(f"UPDATE public.partner_order_payment_schedule SET status='linked',receivable_installment_id='{R}' WHERE partner_order_id='{O}';")
    record('economic replay after mutable NF installment link',raw(f"SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\"}}');"),lambda r:'REPLAY_DIVERGENCE' in r.stderr if schedule_before else r.returncode==0)
    pg.sql(f"UPDATE public.partner_order_payment_schedule SET status='paid' WHERE partner_order_id='{O}';")
    record('economic replay after mutable payment status',raw(f"SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\"}}');"),lambda r:'REPLAY_DIVERGENCE' in r.stderr if schedule_before else r.returncode==0)
    if schedule_before:
        (OUT/'results.json').write_text(json.dumps(dict(kind='ISOLATED_COMPONENT_NOT_NF_OR_PAYMENT_WRITER',checks=checks,hosted=False),indent=2)+'\n')
        print('schedule-before: two divergences reproduced')
        sys.exit(0)
    record('changed economic installment amount is rejected',raw(f"BEGIN;UPDATE public.partner_order_payment_schedule SET amount=19 WHERE partner_order_id='{O}';SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\"}}');ROLLBACK;"),lambda r:r.returncode!=0 and 'SCHEDULE_UNPROVEN' in r.stderr)
    v = int(pg.sql(f"SELECT version FROM platform_private.b2b_financial_forecasts WHERE id='{F}';"))
    record('first intent',raw(event(version=v)),lambda r:r.returncode==0)
    record('divergent replay',raw(event('{"error_code":"DIFFERENT"}',v)),lambda r:r.returncode==0 if before else 'PT409' in r.stderr and 'REPLAY_DIVERGENCE' in r.stderr)
    v = reset()
    # Both calls queue behind the same observed lock, reproducing the TOCTOU.
    locker = subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    locker.stdin.write(f"BEGIN;SELECT id FROM platform_private.b2b_financial_forecasts WHERE id='{F}' FOR UPDATE;SELECT pg_sleep(1);COMMIT;\n")
    locker.stdin.close()
    time.sleep(.15)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:raw(event(version=v,reference=D)),range(2)))
    locker.wait()
    for n,r in enumerate(results): record(f'concurrent same intent {n}',r,lambda _:True)
    assert sum(r.returncode==0 for r in results)==(1 if before else 2), [r.stderr for r in results]
    v=reset('faturado_parcial',9)
    record('second emission from partial',raw(event(version=v)),lambda r:'STATE_CONFLICT' in r.stderr if before else r.returncode==0)
    v=reset('faturado_parcial',9)
    record('economic replay after NF with dynamic credit',raw(f"SELECT platform_private.b2b_financial_forecast_after_approval_v1('{O}','{{\"reason_code\":\"OK\",\"exposure\":18}}');"),lambda r:'REPLAY_DIVERGENCE' in r.stderr if before else r.returncode==0)
    pg.sql(f"INSERT INTO platform_private.b2b_document_allocations VALUES('{D}','{R}','{O}');")
    record('cancel residual',raw(f"SELECT platform_private.b2b_financial_forecast_cancel_residual_v1('{F}',{v},'LOCAL REVIEW');"),lambda r:r.returncode==0)
    record('reconcile canceled residual',raw(f"SELECT platform_private.b2b_financial_forecast_reconcile_fiscal_v1('{D}','{R}');"),lambda r:r.returncode==0 if before else r.returncode!=0)
    state=json.loads(pg.sql(f"SELECT jsonb_build_object('state',state,'residual',residual_amount) FROM platform_private.b2b_financial_forecasts WHERE id='{F}';"))
    assert state==({'state':'faturado_parcial','residual':9} if before else {'state':'cancelado_residual','residual':0}),state
    if not before:
        v=reset('faturado_parcial',9)
        # Cancel holds the exact aggregate lock; confirmation must observe its
        # committed terminal state. No fiscal-positive stub is introduced.
        cancel_sql=f"BEGIN;SELECT platform_private.b2b_financial_forecast_cancel_residual_v1('{F}',{v},'LOCAL RACE');SELECT pg_sleep(.5);COMMIT;"
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            cancel_future=pool.submit(raw,cancel_sql)
            time.sleep(.15)
            reconcile_future=pool.submit(raw,f"SELECT platform_private.b2b_financial_forecast_reconcile_fiscal_v1('{D}','{R}');")
            cancellation=cancel_future.result();confirmation=reconcile_future.result()
        record('cancel race committed',cancellation,lambda r:r.returncode==0)
        record('unattested confirmation waits and stays denied after cancellation',confirmation,lambda r:'42501' in r.stderr and 'SERVICE_PERMIT_REQUIRED' in r.stderr)
        record('canceled residual cannot emit',raw(event(version=v+1)),lambda r:'STATE_CONFLICT' in r.stderr)
        v=reset('faturado_parcial',9)
        record('allocation alone is not fiscal evidence',raw(f"SELECT platform_private.b2b_financial_forecast_reconcile_fiscal_v1('{D}','{R}');"),lambda r:'42501' in r.stderr and 'SERVICE_PERMIT_REQUIRED' in r.stderr)
        for role in ('anon','authenticated','service_role'):
            for sql in (event(version=v),f"SELECT platform_private.b2b_financial_forecast_cancel_residual_v1('{F}',{v},'DENIED');",f"SELECT platform_private.b2b_financial_forecast_reconcile_fiscal_v1('{D}','{R}');"):
                record('private caller denied '+role,raw('SET ROLE '+role+';'+sql),lambda r:'42501' in r.stderr)
    (OUT/'results.json').write_text(json.dumps(dict(kind='ISOLATED_COMPONENT_NOT_FISCAL_AUTHORITY',phase=sys.argv[4],checks=checks,hosted=False,source_sha256=hashlib.sha256(source.encode()).hexdigest(),reconcile_sha256=hashlib.sha256(reconcile_source.encode()).hexdigest(),fiscal_provenance_positive='NOT_PROVEN',synthetic_residual=True),indent=2)+'\n')
    print(json.dumps(dict(checks=len(checks),phase=sys.argv[4],status='EXPECTED_CHARACTERIZATION' if before else 'COMPONENT_PASS_NOT_RELEASE')))
except Exception:
    (OUT/'failed-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
    raise