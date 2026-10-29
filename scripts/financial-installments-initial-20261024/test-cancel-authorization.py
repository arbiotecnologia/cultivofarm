"""Disposable client-role cancel audit; no hosted connection or deployable SQL.
Uses existing monetary schema/identity harness. Never fabricates an origin ticket.
"""
import sys
sys.dont_write_bytecode = True
import importlib.util, json, hashlib, subprocess, csv, argparse, tempfile, time, re, os
from pathlib import Path

H = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('redgreen', H/'test-receivable-red-green.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
m = r.m
parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
OUT = args.output_dir or Path(tempfile.mkdtemp(prefix='cancel-authorization-', dir='/tmp'))
if args.output_dir:
    OUT.mkdir(parents=True, exist_ok=False)
assert OUT.resolve() != (m.ROOT/'docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization').resolve()
races = []
checks, pins, omitted_policies, responses = [], [], [], []
V = m.uid(900001)

def check(name, expected, actual, mode='CAPTURED'):
    row = dict(test=name, expected=str(expected), actual=str(actual), mode=mode,
               status='PASS' if expected == actual else 'FAIL')
    checks.append(row)
    assert expected == actual, row

def relation(name):
    return next(x for x in r.live['relations'] if x['schema']=='public' and x['name']==name)

def table(name):
    t = relation(name)
    columns = [f"{c['name']} {c['type']}" + (' DEFAULT '+c['default'] if c['default'] else '') +
               (' NOT NULL' if c['notnull'] else '') for c in r.live['columns'] if c['relation_oid']==t['oid']]
    constraints = [f"CONSTRAINT {c['name']} {c['definition']}" for c in t['constraints'] if not c['definition'].startswith('FOREIGN KEY')]
    m.pg.sql('CREATE TABLE '+name+'('+','.join(columns+constraints)+');')

def install(name):
    f = r.captured('public',name)
    pins.append({k:f[k] for k in ['oid','signature','md5','owner','acl']})
    return f

def acl(kind, target, entries):
    # Captured ACL only, in a new socket-only cluster. No client ownership/membership.
    m.pg.sql(f'REVOKE ALL ON {kind} {target} FROM PUBLIC,anon,authenticated,service_role;')
    letters = dict(a='INSERT',r='SELECT',w='UPDATE',d='DELETE',D='TRUNCATE',x='REFERENCES',t='TRIGGER',m='MAINTAIN',X='EXECUTE')
    for entry in entries or []:
        who, privileges = entry.split('/')[0].split('=')
        who = who or 'PUBLIC'
        if who=='postgres': continue
        # MAINTAIN exists only on PG17+; not relevant to runtime cancellation.
        ps = [letters[c] for c in privileges if c in letters and c!='m']
        if ps: m.pg.sql(f"GRANT {','.join(ps)} ON {kind} {target} TO {who};")

def policies(name):
    t = relation(name)
    acl('TABLE', name, t['acl'])
    m.pg.sql('ALTER TABLE '+name+' ENABLE ROW LEVEL SECURITY;')
    for p in t['policies'] or []:
        expression=(p['qual'] or '')+(p['with_check'] or '')
        if any(x in expression for x in ['b2b_commercial_context','get_cliente_ids_for_user']):
            # Unavailable permissive partner/producer readers are excluded explicitly; actors here are financeiro only.
            omitted_policies.append(name+'.'+p['policyname']); continue
        roles = ','.join(p['roles'])
        sql = f'CREATE POLICY "{p["policyname"]}" ON {name} AS {p["permissive"]} FOR {p["cmd"]} TO {roles}'
        if p['qual']: sql += ' USING ('+p['qual']+')'
        if p['with_check']: sql += ' WITH CHECK ('+p['with_check']+')'
        m.pg.sql(sql+';')

def client(sql, actor=m.U, role='authenticated'):
    claims = {} if actor is None else dict(sub=actor,iat=1793275200)
    command = "SELECT set_config('request.jwt.claims',"+m.q(json.dumps(claims))+",false);"+sql
    return subprocess.run(m.pg.psql(user=role)+['-v','VERBOSITY=verbose'], input="SET statement_timeout='12s'; SET lock_timeout='8s';"+command, text=True, capture_output=True, timeout=16)

def state():
    tables=['accounts_receivable','accounts_payable','accounts_receivable_installments','accounts_payable_installments','financial_audit_log','receivable_payments','payable_payments','financial_receipts','partner_order_payment_schedule']
    parts=[m.q(t)+",(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "+t+" t)" for t in tables]
    return m.pg.sql('SELECT jsonb_build_object('+','.join(parts)+');')

def call(part,kind): return f"SELECT rpc_cancel_financial_installment('{part}','{kind}','LOCAL AUDIT REASON');"

def error_tuple(result):
    match = re.search(r'ERROR:\s+([0-9A-Z]{5}): (.*)', result.stderr)
    assert match, result.stderr
    return tuple(match.groups())

def denied(name, sql, marker, actor=m.U, role='authenticated', mode='CAPTURED'):
    before = state(); result = client(sql,actor,role)
    responses.append(dict(test=name,returncode=result.returncode,stderr=result.stderr))
    check(name,True,result.returncode!=0 and marker in result.stderr and state()==before,mode)
    return result.stderr

def uniform(name, part, kind, expected=('42501','FINANCIAL_SCOPE_DENIED')):
    before = state(); result = client(call(part,kind))
    check(name+' exact SQLSTATE/message', expected, error_tuple(result), 'GREEN_OFFLINE_ONLY')
    check(name+' full monetary state unchanged', before, state(), 'GREEN_OFFLINE_ONLY')
    responses.append(dict(test=name, error=error_tuple(result), stderr=result.stderr))

def fixture(n, kind, org, status='OPEN', b2b=False):
    if kind=='receivable':
        title=m.uid(n+20000)
        partner='NULL' if not b2b else m.q(m.uid(900002))
        # Prepare immutable parent at INSERT, never reclassify an existing snapshot.
        m.pg.sql("SELECT set_config('request.jwt.claims','{}',false);"+
                 f"INSERT INTO accounts_receivable(id,description,category_id,total_amount,first_due_date,created_by,organization_id,origin_type,partner_id,customer_id) VALUES('{title}','LOCAL','{m.K}',10300,CURRENT_DATE+30,'{m.U}','{org}','{'B2B_ORDER' if b2b else 'MANUAL'}',{partner},'{m.C}');")
        part=m.pg.sql(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{title}'")
    else:
        title,part=m.uid(n+20000),m.uid(n+40000)
        m.pg.sql(f"INSERT INTO accounts_payable(id,description,category_id,total_amount,first_due_date,created_by,organization_id) VALUES('{title}','LOCAL','{m.K}',10300,CURRENT_DATE+30,'{m.U}','{org}'); INSERT INTO accounts_payable_installments(id,payable_id,installment_number,due_date,original_amount,net_amount,organization_id) VALUES('{part}','{title}',1,CURRENT_DATE+30,10300,10300,'{org}');")
    if status!='OPEN': m.pg.sql(f"UPDATE accounts_{kind}_installments SET status='{status}' WHERE id='{part}';")
    return part

def paid_fixture(n,kind,org):
    part=fixture(n,kind,org)
    field='amount_received' if kind=='receivable' else 'amount_paid'
    m.pg.sql(f"INSERT INTO {'receivable' if kind=='receivable' else 'payable'}_payments(installment_id,{field},payment_method_id,created_by,organization_id) VALUES('{part}',1000,'{m.PM}','{m.U}','{org}');")
    if kind=='payable': m.pg.sql(f"UPDATE accounts_payable_installments SET status='PARTIAL',paid_amount=1000 WHERE id='{part}';")
    return part


def race(body, mode, kind, revoke, number, isolation='READ COMMITTED'):
    # Owner prepares/locks fixtures, but the RPC is dispatched by authenticated LOGIN only.
    m.pg.sql(body+';')
    part=fixture(number,kind,m.A)
    before=state(); holder=None; worker=None
    label=f'{mode} {kind} wait revoke {revoke} {isolation}'
    tag='cancel_'+str(number)
    try:
        holder=subprocess.Popen(m.pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        holder.stdin.write(f"BEGIN; SET statement_timeout='12s'; SELECT id FROM accounts_{kind}_installments WHERE id='{part}' FOR UPDATE; SELECT 'LOCKED';\n"); holder.stdin.flush()
        check(label+' holder locked', 'LOCKED', holder.stdout.readline().strip() if holder.stdout.readline().strip()==part else 'MISSING', mode)
        claims=m.q(json.dumps(dict(sub=m.U,iat=1793275200)))
        worker=subprocess.Popen(m.pg.psql('authenticated')+['-v','VERBOSITY=verbose'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        worker.stdin.write(f"SET application_name='{tag}'; SET statement_timeout='10s'; SET lock_timeout='7s'; SELECT set_config('request.jwt.claims',{claims},false); BEGIN ISOLATION LEVEL {isolation}; "+call(part,kind)+" COMMIT;\n");worker.stdin.close();worker.stdin=None
        observed=None; deadline=time.monotonic()+4
        while time.monotonic()<deadline:
            raw=m.pg.sql("SELECT jsonb_build_object('pid',pid,'wait_event_type',wait_event_type,'blockers',pg_blocking_pids(pid)) FROM pg_stat_activity WHERE application_name="+m.q(tag)+" AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0")
            if raw: observed=json.loads(raw);break
            if worker.poll() is not None: break
            time.sleep(.025)
        check(label+' authenticated wait proven', True, observed is not None, mode)
        if revoke=='role': change=f"DELETE FROM user_roles WHERE user_id='{m.U}';"
        else: change=f"UPDATE profiles SET ativo=false WHERE user_id='{m.U}';"
        m.pg.sql(change) # third independent session commits before holder release
        check(label+' revocation committed', '0' if revoke=='role' else 'f', m.pg.sql(f"SELECT count(*) FROM user_roles WHERE user_id='{m.U}'" if revoke=='role' else f"SELECT ativo FROM profiles WHERE user_id='{m.U}'"), mode)
        holder.stdin.write('ROLLBACK;\n');holder.stdin.close();holder.stdin=None
        holder.communicate(timeout=4)
        stdout,stderr=worker.communicate(timeout=12)
        result=subprocess.CompletedProcess([],worker.returncode,stdout,stderr)
        unchanged=state()==before
        if mode=='GREEN_OFFLINE_ONLY':
            check(label+' exact denial', ('42501','FINANCIAL_SCOPE_DENIED'),error_tuple(result),mode)
            check(label+' no monetary effects',True,unchanged,mode)
        elif revoke=='role':
            check(label+' RED revoked role still succeeds',0,result.returncode,mode)
            check(label+' RED cancellation persisted','CANCELED',m.pg.sql(f"SELECT status FROM accounts_{kind}_installments WHERE id='{part}'"),mode)
        else:
            check(label+' late tenant trigger denies',True,result.returncode!=0 and unchanged,mode)
        races.append(dict(test=label,wait=observed,returncode=result.returncode,error=error_tuple(result) if result.returncode else None,state_unchanged=unchanged))
    finally:
        for process in [worker,holder]:
            if process and process.poll() is None:
                process.kill();process.communicate(timeout=4)
        m.pg.sql(f"UPDATE profiles SET ativo=true WHERE user_id='{m.U}'; INSERT INTO user_roles VALUES('{m.U}','financeiro') ON CONFLICT DO NOTHING;")

def foreign_no_lock(kind, number):
    part=paid_fixture(number,kind,m.B);before=state();holder=None
    try:
        holder=subprocess.Popen(m.pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        holder.stdin.write(f"BEGIN; SET statement_timeout='8s'; SELECT id FROM accounts_{kind}_installments WHERE id='{part}' FOR UPDATE; SELECT 'LOCKED';\n");holder.stdin.flush()
        assert holder.stdout.readline().strip()==part
        assert holder.stdout.readline().strip()=='LOCKED'
        result=client("SET lock_timeout='200ms';"+call(part,kind))
        check(kind+' foreign locked row denies without waiting on row',('42501','FINANCIAL_SCOPE_DENIED'),error_tuple(result),'GREEN_OFFLINE_ONLY')
        check(kind+' foreign locked row full state unchanged',before,state(),'GREEN_OFFLINE_ONLY')
    finally:
        if holder and holder.poll() is None:
            holder.kill();holder.communicate(timeout=4)

def main():
    m.pg.start(); m.schema(); r.identity()
    for e in r.live['enums']:
        if e['name']=='app_role': m.pg.sql('ALTER TYPE app_role ADD VALUE IF NOT EXISTS '+m.q(e['value'])+';')
    m.scope = lambda *args, **kwargs: "SELECT set_config('request.jwt.claims','{}',false);"
    m.pg.sql("CREATE ROLE authenticated LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT; CREATE ROLE anon LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT; CREATE ROLE service_role NOLOGIN; CREATE ROLE dashboard_user NOLOGIN; CREATE ROLE supabase_auth_admin NOLOGIN; GRANT USAGE ON SCHEMA public,auth,platform_private TO authenticated,anon;")
    m.pg.sql(f"INSERT INTO profiles VALUES('{V}','{m.B}',true,false); INSERT INTO user_roles VALUES('{V}','financeiro'); CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('{m.U}'),('{V}');")
    m.pg.sql('DROP TABLE accounts_payable_installments,payable_payments,accounts_payable;')
    for name in ['accounts_payable','accounts_payable_installments','payable_payments']: table(name)
    acl('TABLE','accounts_receivable',relation('accounts_receivable')['acl'])
    m.pg.sql('ALTER TABLE financial_audit_log ADD CONSTRAINT financial_audit_log_performed_by_fkey FOREIGN KEY(performed_by) REFERENCES auth.users(id);')
    for name in ['guard_tenant_organization_id','d51_5_validate_financial_tenant_links','fn_h6_guard_ap_installment_snapshot','fn_h6d_block_hard_delete','tg_recalc_risk_on_ar_change']: install(name)
    for name in ['accounts_receivable_installments','accounts_payable_installments']:
        t=relation(name)
        for c in t['constraints']:
            if c['definition'].startswith('FOREIGN KEY') and name=='accounts_payable_installments':
                m.pg.sql(f"ALTER TABLE {name} ADD CONSTRAINT {c['name']} {c['definition']};")
        for tr in t['triggers'] or []:
            if m.pg.sql("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname="+m.q(tr['name'])+" AND tgrelid="+m.q(name)+"::regclass)")=='f': m.pg.sql(tr['definition']+';')
        policies(name)
    local_functions = json.loads(m.pg.sql("SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','platform_private')"))
    for local in local_functions:
        matches = [f for f in r.live['functions'] if f['schema']==local['schema'] and f['name']==local['name']]
        if len(matches)==1:
            acl('FUNCTION',local['signature'],matches[0]['acl'])
    rpc=next(f for f in r.live['functions'] if f['name']=='rpc_cancel_financial_installment')
    pins.append({k:rpc[k] for k in ['oid','signature','md5','owner','acl']})
    check('client role has no owner membership/superuser/bypass', 'f|f|f',m.pg.sql("SELECT rolsuper,rolbypassrls,pg_has_role('authenticated','postgres','MEMBER') FROM pg_roles WHERE rolname='authenticated'"))
    check('captured RPC definition exact',rpc['md5'],m.pg.sql("SELECT md5(pg_get_functiondef('rpc_cancel_financial_installment(uuid,text,text)'::regprocedure))"))
    for kind in ['receivable','payable']:
        own=fixture(910 if kind=='receivable' else 920,kind,m.A)
        foreign=fixture(911 if kind=='receivable' else 921,kind,m.B)
        result=client(f"SELECT count(*) FROM accounts_{kind}_installments WHERE id='{foreign}';")
        assert result.returncode==0,result.stderr
        check(kind+' foreign SELECT hidden by captured RLS','0',result.stdout.strip().splitlines()[-1])
        before=state()
        result=client(f"UPDATE accounts_{kind}_installments SET status='CANCELED' WHERE id='{own}' RETURNING id;")
        check(kind+' direct own UPDATE closed',True,result.returncode==0 and own not in result.stdout and state()==before)
        check(kind+' own client RPC accepted',0,client(call(own,kind)).returncode)
        check(kind+' own status persisted','CANCELED',m.pg.sql(f"SELECT status FROM accounts_{kind}_installments WHERE id='{own}'"))
        check(kind+' exactly one cancellation audit','1',m.pg.sql(f"SELECT count(*) FROM financial_audit_log WHERE entity_id='{own}' AND action='INSTALLMENT_CANCELED' AND performed_by='{m.U}'"))
        denied(kind+' replay no extra audit',call(own,kind),'já cancelada')
        denied(kind+' foreign OPEN tenant guard atomic',call(foreign,kind),'tenant_scope_violation')
        denied(kind+' anon ACL closed',call(foreign,kind),'permission denied',None,'anon')
        denied(kind+' empty identity denied',call(foreign,kind),'Sem permissão',None)
        denied(kind+' nonexistent identity denied',call(foreign,kind),'Sem permissão',m.uid(999999))
        denied(kind+' malformed identity denied',call(foreign,kind),'invalid input syntax','not-a-uuid')
        m.pg.sql(f"UPDATE organizations SET ativo=false WHERE id='{m.A}';")
        denied(kind+' revoked organization denies before mutation',call(foreign,kind),'tenant_context_required')
        m.pg.sql(f"UPDATE organizations SET ativo=true WHERE id='{m.A}';")
        m.pg.sql(f"UPDATE profiles SET ativo=false WHERE user_id='{m.U}';")
        denied(kind+' revoked profile denied',call(foreign,kind),'Sem permissão')
        m.pg.sql(f"UPDATE profiles SET ativo=true WHERE user_id='{m.U}'; DELETE FROM user_roles WHERE user_id='{m.U}';")
        denied(kind+' revoked role denied',call(foreign,kind),'Sem permissão')
        m.pg.sql(f"INSERT INTO user_roles VALUES('{m.U}','financeiro');")
        check(kind+' B own accepted',0,client(call(foreign,kind),V).returncode)
        denied(kind+' RED foreign canceled leaks status',call(foreign,kind),'já cancelada',mode='RED_ORACLE_REPRODUCED')
        denied(kind+' RED nonexistent distinguishable',call(m.uid(999998),kind),'não encontrada',mode='RED_ORACLE_REPRODUCED')
        active=paid_fixture(980+(10 if kind=='payable' else 0),kind,m.A)
        denied(kind+' own active payment preserved',call(active,kind),'não estornados')
        active=paid_fixture(981+(10 if kind=='payable' else 0),kind,m.B)
        denied(kind+' RED foreign active payment oracle',call(active,kind),'não estornados',mode='RED_ORACLE_REPRODUCED')
    before=state()
    try:
        fixture(930,'receivable',m.A,b2b=True)
        raise RuntimeError('Expected uncomposed risk dependency')
    except AssertionError as error:
        check('B2B fixture BLOCKED before RPC by exact risk dependency',True,
              'recalc_partner_risk_score' in str(error) and state()==before)
    # A status oracle is reproduced, not an unauthorized mutation. Scope SELECT before row lock
    # closes only that oracle in the sandbox; no runtime file or SQL installer emitted.
    body=rpc['body']
    anchor='DECLARE v_status text; v_has_payment boolean; v_table text;'
    assert body.count(anchor)==1
    body=body.replace(anchor,anchor+' v_org uuid;')
    anchor="  IF p_kind = 'receivable' THEN"
    assert body.count(anchor)==1
    body=body.replace(anchor,"  v_org := public.h15_actor_organization();\n  IF v_org IS NULL THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;\n"+anchor)
    for kind in ['receivable','payable']:
        anchor=f'SELECT status INTO v_status FROM accounts_{kind}_installments WHERE id = p_installment_id FOR UPDATE;'
        assert body.count(anchor)==1
        body=body.replace(anchor,anchor.replace(' FOR UPDATE',' AND organization_id = v_org FOR UPDATE'))
    anchor="IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;"
    assert body.count(anchor)==2
    body=body.replace(anchor,"IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;")
    scoped_body=body
    # Separate SPI statement in VOLATILE RPC: captured STABLE helpers retain definitions.
    # Non-READ-COMMITTED is denied, because a new SPI statement cannot refresh its transaction snapshot.
    post="SELECT public.is_financial_staff(auth.uid()) AND public.h15_actor_organization() = v_org INTO v_authorized;\n    IF v_authorized IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;"
    body=body.replace('v_org uuid;', 'v_org uuid; v_authorized boolean;')
    anchor="    IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;"
    assert body.count(anchor)==2
    body=body.replace(anchor,anchor+'\n    '+post)
    unguarded_body=body
    body=body.replace('BEGIN\n', "BEGIN\n  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;\n",1)
    for mode,transformed in [('RED_CAPTURED_WAIT',rpc['body']),('RED_SCOPED_WAIT',scoped_body),('GREEN_OFFLINE_ONLY',body)]:
        for ki,kind in enumerate(['receivable','payable']):
            for ri,revoke in enumerate(['role','profile']):
                race(transformed,mode,kind,revoke,1100+len(races)*10)
    # Demonstrate STABLE helper's old transaction snapshot without changing volatility.
    for kind in ['receivable','payable']:
        race(unguarded_body,'RED_REPEATABLE_SNAPSHOT',kind,'role',1400+len(races)*10,'REPEATABLE READ')
    m.pg.sql(body+';')
    for kind in ['receivable','payable']:
        denied(kind+' GREEN repeatable read closed',"BEGIN ISOLATION LEVEL REPEATABLE READ;"+call(m.uid(999998),kind),'FINANCIAL_SCOPE_DENIED',mode='GREEN_OFFLINE_ONLY')
        denied(kind+' GREEN serializable closed',"BEGIN ISOLATION LEVEL SERIALIZABLE;"+call(m.uid(999998),kind),'FINANCIAL_SCOPE_DENIED',mode='GREEN_OFFLINE_ONLY')

        for status,offset in [('OPEN',0),('CANCELED',1),('PARTIAL',2)]:
            part=paid_fixture(940+offset+(10 if kind=='payable' else 0),kind,m.B) if status=='PARTIAL' else fixture(940+offset+(10 if kind=='payable' else 0),kind,m.B,status)
            if status=='PARTIAL':
                check(kind+' GREEN foreign real payment exists','1000.00',m.pg.sql(f"SELECT sum({'amount_received' if kind=='receivable' else 'amount_paid'})::numeric(14,2) FROM {kind}_payments WHERE installment_id='{part}'"),'GREEN_OFFLINE_ONLY')
            uniform(kind+' GREEN foreign '+status,part,kind)
        uniform(kind+' GREEN nonexistent uniform',m.uid(999998),kind)
        foreign_no_lock(kind,1600+(10 if kind=='payable' else 0))
        for actor,label,marker in [(None,'empty','Sem permissão'),(m.uid(999999),'unknown','Sem permissão'),('not-a-uuid','invalid','invalid input syntax')]:
            denied(kind+' GREEN identity '+label,call(m.uid(999998),kind),marker,actor,mode='GREEN_OFFLINE_ONLY')
        for target,disable,restore in [
            ('profile',f"UPDATE profiles SET ativo=false WHERE user_id='{m.U}'",f"UPDATE profiles SET ativo=true WHERE user_id='{m.U}'"),
            ('role',f"DELETE FROM user_roles WHERE user_id='{m.U}'",f"INSERT INTO user_roles VALUES('{m.U}','financeiro')"),
            ('organization',f"UPDATE organizations SET ativo=false WHERE id='{m.A}'",f"UPDATE organizations SET ativo=true WHERE id='{m.A}'")]:
            try:
                m.pg.sql(disable+';')
                denied(kind+' GREEN revoked '+target,call(m.uid(999998),kind),'FINANCIAL_SCOPE_DENIED' if target=='organization' else 'Sem permissão',mode='GREEN_OFFLINE_ONLY')
            finally: m.pg.sql(restore+';')
        own_b=fixture(1650+(10 if kind=='payable' else 0),kind,m.B)
        check(kind+' GREEN own B accepted',0,client(call(own_b,kind),V).returncode,'GREEN_OFFLINE_ONLY')
        own=fixture(960+(10 if kind=='payable' else 0),kind,m.A)
        check(kind+' GREEN own preserved',0,client(call(own,kind)).returncode,'GREEN_OFFLINE_ONLY')
        denied(kind+' GREEN replay preserved',call(own,kind),'já cancelada',mode='GREEN_OFFLINE_ONLY')
        active=paid_fixture(982+(10 if kind=='payable' else 0),kind,m.A)
        denied(kind+' GREEN own payment branch preserved',call(active,kind),'não estornados',mode='GREEN_OFFLINE_ONLY')
    helper_metadata=json.loads(m.pg.sql("SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'volatility',p.provolatile,'md5',md5(pg_get_functiondef(p.oid)))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','platform_private','auth') AND p.proname IN ('is_financial_staff','h15_actor_organization','has_role','platform_actor_access_ready','fn_authz_uid_scope_ok')"))
    for entry in helper_metadata:
        source=next(f for f in r.live['functions'] if f['signature']==entry['signature'])
        check('helper unchanged '+entry['signature'],source['md5'],entry['md5'],'GREEN_OFFLINE_ONLY')
        check('helper STABLE '+entry['signature'],'s',entry['volatility'],'GREEN_OFFLINE_ONLY')
    (OUT/'rpc-captured.txt').write_text(rpc['body'])
    (OUT/'rpc-offline-transformation.diff').write_text(''.join(__import__('difflib').unified_diff(rpc['body'].splitlines(True),body.splitlines(True),fromfile='captured',tofile='offline-not-installable')))
    result=dict(counts={s:sum(c['status']==s for c in checks) for s in ['PASS','FAIL']},checks=checks,pins=pins,responses=responses,
        captured_manifest_sha256=hashlib.sha256((H/'receivable-recursive-live-20261029.json').read_bytes()).hexdigest(),
        transformed_body_md5=hashlib.md5(body.encode()).hexdigest(),
        omitted_policies=omitted_policies, races=races, helper_metadata=helper_metadata, output_dir=str(OUT), by_mode={mode:sum(c['mode']==mode for c in checks) for mode in sorted({c['mode'] for c in checks})},
        blocked=['B2B own positive requires captured recalc_partner_risk_score and full risk/partner/governance dependency chain'],
        not_run=['Hosted JWT/RLS A/B, full BI/provenance and promotion'],
        vulnerability='Foreign canceled vs missing row status oracle; OPEN foreign mutation denied by exact tenant trigger',
        limits='Actual LOGIN client roles, captured RPC ACL/installment RLS/all installment triggers; minimal synthetic identity tables. Parent creation/identity-wide guards, payment insert chain and audit SELECT policy not composed. No owner RPC calls, no tickets, no JWT verification, no production operations.')
    (OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    with (OUT/'matrix.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(checks[0]),lineterminator='\n');w.writeheader();w.writerows(checks)
        w.writerow(dict(test='B2B own positive cancellation',expected='Legitimate complete chain',actual='Fixture fails in exact risk trigger before RPC',mode='INTEGRATION',status='BLOCKED'))
        w.writerow(dict(test='JWT/RLS hosted A/B and lock wait revocation',expected='Independent canonical proof',actual='No production operations authorized/executed',mode='HOSTED',status='NOT RUN'))
    print(json.dumps(result['counts']))

if __name__=='__main__':
    try: main()
    finally:
        if (m.pg.root/'data/postmaster.pid').exists():
            subprocess.run(m.pg.prefix+['pg_ctl','-D',str(m.pg.root/'data'),'-m','immediate','stop'],capture_output=True,timeout=10)