"""Behavioral protocol experiment only; not production Auth, RLS or installer."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import os
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]


def main():
    tmp = Path(tempfile.mkdtemp(prefix='f2b33a-', dir='/tmp'))
    tmp.chmod(0o777)
    prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    cmd = ['psql', '-X', '-h', str(tmp), '-p', '55496', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    started = False
    count = 0

    def run(sql, error=None):
        result = subprocess.run(cmd, input=sql, text=True, capture_output=True, timeout=20)
        if error:
            if result.returncode == 0 or error not in result.stderr:
                raise RuntimeError('Expected '+error+': '+result.stderr)
        elif result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout.strip()

    def state():
        return run("SELECT md5(jsonb_build_array(" + ','.join(
            f"(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM lab.{name} t)"
            for name in ['actors', 'targets', 'clients', 'puc', 'ptc', 'audit', 'source', 'gate']) + ")::text);")

    def check(name, expression):
        nonlocal count
        if run('SELECT ('+expression+') IS TRUE;') != 't':
            raise RuntimeError('FAIL '+name)
        count += 1
        print('PASS '+name)

    def deny(name, sql, error):
        nonlocal count
        before = state()
        run(sql, error)
        if state() != before:
            raise RuntimeError('Partial write after '+name)
        count += 1
        print('PASS '+name+'; row-state digest unchanged')

    def op(target='tech', client='ca', key='k1', expected=0, action='grant', actor='manager', partner='A', fail='false'):
        return f"SELECT lab.operation('{actor}','{partner}','{target}','{client}','{action}',{expected},'{key}',{fail});"

    def fixture():
        run("""TRUNCATE lab.source,lab.audit,lab.puc,lab.ptc,lab.actors,lab.targets,lab.clients RESTART IDENTITY;
        INSERT INTO lab.actors VALUES
        ('manager','ownerA','A','ownerA','commercial_owner','manager',true,true,1),
        ('legacy','legacy:A','A','ownerA','legacy_partner_tenant','manager',true,true,1),
        ('admin','ownerA','A','ownerA','commercial_owner','admin',true,true,1),
        ('super','ownerA','A','ownerA','commercial_owner','superadmin',true,true,1),
        ('technician','ownerA','A','ownerA','commercial_owner','technical',true,true,1);
        INSERT INTO lab.targets VALUES('tech','A','ownerA',true),('other','A','ownerA',true),('techB','B','ownerB',true);
        INSERT INTO lab.clients VALUES('ca','A','ownerA'),('ca2','A','ownerA'),('cb','B','ownerB');""")

    def contend(name, first_sql, second_sql, expected_error=None):
        nonlocal count
        locker = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        pool = ThreadPoolExecutor(max_workers=1)
        try:
            if locker.stdin is None or locker.stdout is None:
                raise RuntimeError('Missing pipes')
            locker.stdin.write("BEGIN;"+first_sql+"SELECT 'READY';\n")
            locker.stdin.flush()
            while True:
                line = locker.stdout.readline()
                if not line:
                    raise RuntimeError('First operation failed before barrier')
                if line.strip() == 'READY':
                    break
            future = pool.submit(run, "SET application_name='f2b33a_waiter'; SET lock_timeout='5s';"+second_sql, expected_error)
            deadline = time.monotonic()+4
            while time.monotonic()<deadline:
                if run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='f2b33a_waiter' AND wait_event_type='Lock');") == 't':
                    break
                if future.done():
                    raise RuntimeError('Second operation did not wait at shared gate')
                time.sleep(0.03)
            else:
                raise RuntimeError('No real lock wait observed')
            locker.stdin.write('COMMIT;\n\\q\n')
            locker.stdin.flush()
            out, err = locker.communicate(timeout=5)
            if locker.returncode:
                raise RuntimeError(err+out)
            future.result(timeout=8)
            count += 1
            print('PASS '+name+'; real session lock wait and commit observed')
        finally:
            if locker.poll() is None:
                locker.kill()
                locker.communicate()
            pool.shutdown(wait=True)

    try:
        subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'server.log'),'-o',f'-k {tmp} -h "" -p 55496','start'],check=True,capture_output=True)
        started = True
        run((ROOT/'scripts/tests/b2b-f2b33a-protocol-local.sql').read_text())
        fixture()
        for file, error in [
            ('vinculos-b2b-f2b33a-candidato-bloqueado-20261018.sql','F2B33A_NO_GO_BACKUP_RECEIPT_WRITERS_READERS_JWT_RLS'),
            ('vinculos-b2b-f2b33a-rollback-bloqueado-20261018.sql','F2B33A_ROLLBACK_NO_GO_MANIFEST_CONSUMPTION_RECOVERY')]:
            deny('document refuses '+file, (ROOT/'docs/auditorias'/file).read_text(), error)
        run(op())
        check('actor distinct from target creates atomic source', "(SELECT count(*)=1 FROM lab.puc WHERE active AND version=1) AND (SELECT count(*)=1 FROM lab.ptc WHERE active) AND (SELECT count(*)=1 FROM lab.source) AND (SELECT count(*)=1 FROM lab.audit WHERE actor='manager' AND target='tech')")
        run(op())
        check('lost response retry returns one effect', '(SELECT count(*)=1 FROM lab.audit) AND (SELECT version=1 FROM lab.puc)')
        deny('changed payload same key',op(action='revoke'),'IDEMPOTENCY_CONFLICT')
        deny('stale CAS',op(key='stale',action='revoke'),'CAS_CONFLICT')
        deny('technical actor cannot impersonate manager',op(actor='technician',key='technical'),'ACTOR_CONTEXT_DENIED')
        deny('admin A cannot manage B',op(actor='admin',partner='B',target='techB',client='cb',key='cross'),'ACTOR_CONTEXT_DENIED')
        deny('foreign client denied',op(client='cb',key='foreign'),'CLIENT_SCOPE_DENIED')
        deny('foreign target denied',op(target='techB',key='foreign-target'),'TARGET_INELIGIBLE')
        for contexts in [0,2]:
            run(f"UPDATE lab.actors SET contexts={contexts} WHERE id='super';")
            deny(f'superadmin {contexts} contexts denied',op(actor='super',key='ctx'),'ACTOR_CONTEXT_DENIED')
        run("UPDATE lab.actors SET contexts=1 WHERE id='super';")
        run(op(actor='super',target='other',key='super'))
        check('explicit scoped superadmin allowed in model', "EXISTS(SELECT 1 FROM lab.audit WHERE actor='super' AND target='other')")
        fixture()
        run(op(actor='legacy'))
        check('proven legacy tenant differs from owner', "EXISTS(SELECT 1 FROM lab.audit WHERE org='legacy:A' AND owner='ownerA')")
        run("UPDATE lab.actors SET org='unproven' WHERE id='legacy';")
        deny('legacy unproven denied before replay',op(actor='legacy'),'ACTOR_CONTEXT_DENIED')
        fixture()
        for field in ['ready','entitled']:
            run(f"UPDATE lab.actors SET {field}=false WHERE id='manager';")
            deny('actor '+field+' denied',op(),'ACTOR_CONTEXT_DENIED')
            run(f"UPDATE lab.actors SET {field}=true WHERE id='manager';")
        run("SELECT lab.direct_write('A','tech','ca',true);")
        deny('direct collision aborts all writes',op(),'DIRECT_UNKNOWN_COLLISION')
        run("SELECT lab.direct_write('A','tech','ca',false);")
        check('existing direct writer can deactivate direct', '(SELECT active=false FROM lab.ptc)')
        fixture()
        run("INSERT INTO lab.ptc(partner,target,client,active) VALUES('A','tech','ca',true);")
        deny('unknown collision not adopted',op(),'DIRECT_UNKNOWN_COLLISION')
        fixture()
        deny('audit failure rolls back source and projection',op(fail='true'),'AUDIT_FAILURE')
        run(op())
        deny('source immutable',"UPDATE lab.source SET target='other';",'IMMUTABLE_SOURCE_AUDIT')
        deny('audit immutable',"DELETE FROM lab.audit;",'IMMUTABLE_SOURCE_AUDIT')
        deny('direct cannot tamper projected',"SELECT lab.direct_write('A','tech','ca',false);",'PROJECTED_DIRECT_TAMPERING')
        deny('GUC invented does not confer authority',"SET app.fake_authority='true';"+op(actor='technician',key='fake'),'ACTOR_CONTEXT_DENIED')
        deny('client cannot issue operation',"SET ROLE lab_client;"+op(),'permission denied')
        deny('client cannot forge source',"SET ROLE lab_client; INSERT INTO lab.source VALUES(99,99,'A','tech','ca',1);",'permission denied')
        run("SELECT lab.direct_write('A','tech','ca2',true); UPDATE lab.targets SET eligible=false WHERE id='tech';")
        run(op(action='revoke',expected=1,key='cleanup'))
        check('cleanup works with ineligible target preserves direct', "(SELECT active=false AND version=2 FROM lab.puc) AND (SELECT active=false FROM lab.ptc WHERE client='ca') AND (SELECT active FROM lab.ptc WHERE client='ca2')")
        check('new reads deny residual direct without link', "NOT lab.can_read('tech','ca2')")
        deny('cleanup cannot regrant ineligible target',op(expected=2,key='regrant'),'TARGET_INELIGIBLE')
        fixture()
        run(op())
        run('DELETE FROM lab.puc;')
        check('deleted source never becomes direct read', "NOT lab.can_read('tech','ca') AND (SELECT count(*)=1 FROM lab.source)")
        deny('recreated source cannot inherit projected',op(key='newgen'),'DIRECT_UNKNOWN_COLLISION')
        fixture()
        contend('grant versus same-key grant',op(),op())
        check('concurrent retry exactly one event', '(SELECT count(*)=1 FROM lab.audit) AND (SELECT count(*)=1 FROM lab.ptc)')
        fixture()
        contend('grant then link revoke',op(),"SELECT lab.link_revoke('tech');")
        check('revoke closes committed grant and reader', "(SELECT active=false FROM lab.ptc) AND NOT lab.can_read('tech','ca') AND (SELECT version=2 FROM lab.puc)")
        fixture()
        contend('link revoke then grant revalidates',"SELECT lab.link_revoke('tech');",op(), 'TARGET_INELIGIBLE')
        check('no projection created after revoke wins', '(SELECT count(*)=0 FROM lab.puc) AND (SELECT count(*)=0 FROM lab.ptc)')
        fixture()
        run(op())
        contend('revoke versus same-key revoke',op(action='revoke',expected=1,key='r'),op(action='revoke',expected=1,key='r'))
        check('concurrent revoke idempotent', '(SELECT version=2 FROM lab.puc) AND (SELECT count(*)=2 FROM lab.audit)')
        fixture()
        contend('direct wins versus projection',"SELECT lab.direct_write('A','tech','ca',true);",op(),'DIRECT_UNKNOWN_COLLISION')
        check('direct collision concurrent state preserved', '(SELECT count(*)=0 FROM lab.puc) AND (SELECT count(*)=0 FROM lab.source) AND (SELECT active FROM lab.ptc)')
        fixture()
        contend('projection wins versus direct',op(),"SELECT lab.direct_write('A','tech','ca',false);",'PROJECTED_DIRECT_TAMPERING')
        check('projection concurrent state preserved', '(SELECT active FROM lab.ptc) AND (SELECT count(*)=1 FROM lab.source)')
        print(f'PASS {count} protocol checks; synthetic actor/source/gate only; NO-GO hosted installation/JWT/RLS')
    finally:
        if started:
            subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
        shutil.rmtree(tmp)


if __name__ == '__main__':
    main()