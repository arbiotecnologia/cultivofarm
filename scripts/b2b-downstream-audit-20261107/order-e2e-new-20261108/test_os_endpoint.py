"""Real endpoint with SQL-role callers; synthetic identity/schema, never hosted JWT."""
import json
import time

def run(B,Q,order,item,expected,out):
    results=[]
    def call(uid,key='endpoint-negative-0001'):
        return (f"RESET ROLE;SET ROLE authenticated;SET request.jwt.claim.sub='{uid}';"
                f"SET request.jwt.claims='{{\"sub\":\"{uid}\",\"iat\":1}}';"
                f"SELECT public.rpc_b2b_resale_os_create_v1('{order}','{item}','{expected}','{key}');")
    def effects():
        return B.last(f"SELECT jsonb_build_array((SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{order}'),(SELECT count(*) FROM platform_private.b2b_resale_os_requests_v1 WHERE order_id='{order}'),(SELECT count(*) FROM platform_private.authz_tickets),(SELECT count(*) FROM public.accounts_receivable),(SELECT count(*) FROM public.estoque_movimentacoes))::text;")
    before=effects()
    for name,uid,token in [('buyer',Q.UB,'B2B_RESALE_ACTOR_DENIED'),('FSF',Q.UADMF,'ESTQ_FEATURE_REQUIRED')]:
        r=B.run_raw(call(uid));assert r.returncode!=0 and (token in r.stderr or 'B2B_RESALE_ORDER_SCOPE_DENIED' in r.stderr),(name,r.stderr)
        assert effects()==before
        results.append(dict(name=name,status='PASS',error=r.stderr[-1200:],zero_delta=True))
    # Fixture-only mutations rollback before the next case; all real guards are
    # enabled at endpoint dispatch. This is not a hosted account change.
    variants=[
      ('not_approved',f"UPDATE public.partner_orders SET status='pendente' WHERE id='{order}';",'B2B_RESALE_ORDER_CONFLICT'),
      ('accounting_pending',f"UPDATE public.partner_orders SET financial_approval_status='pending' WHERE id='{order}';",'B2B_RESALE_ORDER_CONFLICT'),
      ('revoked',f"UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UADM}';",'B2B_RESALE_ACTOR_DENIED'),
      ('feature_closed',"UPDATE public.saas_plan_version_features SET enabled=false WHERE feature_id IN (SELECT id FROM public.saas_features WHERE key='estoque_embalagens');",'ESTQ_FEATURE_REQUIRED'),
    ]
    for name,mutation,token in variants:
        sql='BEGIN;RESET ROLE;SET session_replication_role=replica;'+mutation+'SET session_replication_role=origin;'+call(Q.UADM)+'ROLLBACK;'
        r=B.run_raw(sql);assert r.returncode!=0 and token in r.stderr,(name,r.stdout,r.stderr)
        assert effects()==before
        results.append(dict(name=name,status='PASS',error=r.stderr[-1200:],fixture_only=True,all_guards_enabled_at_dispatch=True,zero_delta=True))
    for role in ('authenticated','service_role'):
        r=B.run_raw(f"RESET ROLE;SET ROLE {role};SELECT platform_private.b2b_resale_os_create_v1(NULL,NULL,NULL,NULL);")
        assert r.returncode!=0 and 'permission denied' in r.stderr,r.stderr
        results.append(dict(name='helper_direct_'+role,status='PASS',error=r.stderr[-500:]))
    # Two concurrent real public calls, same item/key/observed value.
    key='endpoint-concurrent-create-0001'
    holder=B.T.session(f"BEGIN;SELECT 1 FROM public.partner_orders WHERE id='{order}' FOR UPDATE;")
    time.sleep(.15)
    workers=[B.T.session(call(Q.UADM,key)) for _ in range(2)]
    B.T.wait();B.T.finish(holder,'COMMIT;')
    acks=[]
    for worker in workers:
        stdout,stderr=B.T.finish(worker);assert not stderr,(stdout,stderr)
        acks.append(json.loads(stdout.strip().splitlines()[-1]))
    assert acks[0]['os_id']==acks[1]['os_id'] and sorted(a['replay'] for a in acks)==[False,True],acks
    assert B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_item_id='{item}';")=='1'
    results.append(dict(name='concurrent_public_create',status='PASS',actual_lock_wait=True,one_os=True,acks=acks))
    (out/'os-endpoint-tests.json').write_text(json.dumps(dict(hosted=False,synthetic_auth=True,results=results),indent=2)+'\n')
    return acks[0]['os_id']