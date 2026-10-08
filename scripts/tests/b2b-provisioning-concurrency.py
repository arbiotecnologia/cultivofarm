"""Two real connections on disposable PG; not remote JWT/concurrency proof."""
import subprocess
import time
import json


def run(base):
    def query(sql):
        r = subprocess.run(base, input=sql, text=True, capture_output=True)
        if r.returncode:
            raise RuntimeError(r.stderr)
        return r.stdout.strip()

    actor = '44444444-4444-4444-8444-444444444444'
    prefix = f"SET request.jwt.claim.sub='{actor}'; SET request.jwt.claim.iat='1780950000'; SET ROLE authenticated; "
    query("RESET ROLE; UPDATE public.profiles SET organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE user_id='"+actor+"';")
    call = "SELECT public.b2b_claim_provisioning('11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999998','race@example.invalid','Race');"

    def blocked_pair(first_sql, second_sql):
        first = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        first.stdin.write("BEGIN; SET LOCAL application_name='b2b_lock_holder'; "+first_sql+" SELECT pg_sleep(0.8); COMMIT;")
        first.stdin.close()
        # Observe a real open transaction before starting the second connection.
        deadline = time.monotonic()+5
        while time.monotonic()<deadline:
            if query("SELECT count(*) FROM pg_stat_activity WHERE application_name='b2b_lock_holder' AND wait_event='PgSleep';") == '1':
                break
            time.sleep(0.02)
        else:
            raise RuntimeError('holder not observed')
        second = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        second.stdin.write(second_sql)
        second.stdin.close()
        deadline = time.monotonic()+0.6
        blocked = False
        while time.monotonic()<deadline:
            if int(query("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid();")):
                blocked = True
                break
            time.sleep(0.01)
        if not blocked:
            raise RuntimeError('competing connection never blocked')
        outputs=[]
        for process in (first,second):
            process.wait(timeout=8)
            out=process.stdout.read(); err=process.stderr.read()
            if process.returncode:
                raise RuntimeError(err)
            outputs.append(out)
        return outputs

    outputs=blocked_pair(prefix+call, prefix+call)
    receipts=[json.loads(next(line for line in output.splitlines() if line.startswith('{'))) for output in outputs]
    if receipts[0]['user_id']!=receipts[1]['user_id'] or [r['acquired'] for r in receipts]!=[True,False]:
        raise RuntimeError('concurrent claim did not converge')
    print('PASS two connections claim same reserved ID exactly one acquired')
    receipt=receipts[0]
    uid=receipt['user_id']
    query(f"SET request.jwt.claim.sub=''; INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('{uid}','race@example.invalid',jsonb_build_object('b2b_provisioning_receipt','{receipt['claim_id']}')); INSERT INTO public.profiles(user_id,email,ativo,senha_provisoria) VALUES('{uid}','race@example.invalid',true,false);")
    args=f"'{receipt['claim_id']}','{receipt['fence']}','{uid}'"
    service="SET request.jwt.claim.sub=''; SET ROLE service_role; "
    # Ordinary profile DML gets the live statement gate first; finish must wait
    # before taking receipt/profile row locks, avoiding gate/profile inversion.
    outputs=blocked_pair(f"UPDATE public.profiles SET nome='Race' WHERE user_id='{uid}';", service+f"SELECT public.b2b_finish_provisioning({args});")
    if '"success": true' not in outputs[1]:
        raise RuntimeError('finish failed after concurrent profile trigger')
    print('PASS two connections profile gate versus finish no deadlock')
    outputs=blocked_pair(service+f"SELECT public.b2b_finish_provisioning({args});",service+f"SELECT public.b2b_prepare_provisioning_compensation({args});")
    if 'completed' not in outputs[1]:
        raise RuntimeError('completed identity became compensatable')
    print('PASS two connections finish versus compensation preserves completed')
