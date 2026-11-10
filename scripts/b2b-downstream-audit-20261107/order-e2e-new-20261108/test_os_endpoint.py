"""Real public endpoint/reader with SQL roles; synthetic identity, never hosted JWT."""
import json
import time


def run(B,Q,order,item,expected,out):
    results=[]
    product=B.last(f"SELECT product_id FROM public.partner_order_items WHERE id='{item}';")
    def call(uid,key='endpoint-negative-0001'):
        return (f"RESET ROLE;SET ROLE authenticated;SET request.jwt.claim.sub='{uid}';"
                f"SET request.jwt.claims='{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"iat\":1,\"exp\":4102444800}}';"
                f"SELECT public.rpc_b2b_resale_os_create_v1('{order}','{item}','{expected}','{key}');")
    def read(uid):
        return (f"RESET ROLE;SET ROLE authenticated;SET request.jwt.claim.sub='{uid}';"
                f"SET request.jwt.claims='{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"iat\":1,\"exp\":4102444800}}';"
                f"SELECT public.rpc_b2b_resale_os_availability_v1('{order}');")
    def effects():
        return B.last(f"SELECT jsonb_build_array((SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{order}'),(SELECT count(*) FROM platform_private.b2b_resale_os_requests_v1 WHERE order_id='{order}'),(SELECT count(*) FROM platform_private.authz_tickets),(SELECT count(*) FROM public.accounts_receivable),(SELECT count(*) FROM public.estoque_movimentacoes))::text;")
    def enable_fsf_stock():
        # Fixture only, rolled back with each case. Same published feature set as ARBio;
        # no helper, role or server grant is changed.
        return f"""INSERT INTO public.organization_subscriptions(id,organization_id,plan_id,plan_version_id,status,started_at)
 SELECT gen_random_uuid(),'{Q.F}',plan_id,plan_version_id,'ACTIVE',now()-interval '1 hour'
 FROM public.organization_subscriptions WHERE id='{Q.u(807)}';"""
    before=effects()
    initial=json.loads(B.last(read(Q.UADM)))
    assert initial['contract']=='B2B_RESALE_OS_AVAILABILITY_V1' and initial['available'] is True
    assert initial['actor_id']==Q.UADM and initial['organization_id']==Q.A and initial['observed_updated_at']
    assert initial['items'][0]['order_item_id']==item and initial['items'][0]['create_available'] is True,initial
    results.append(dict(name='availability_reader_exact_cas_scope_and_item',status='PASS',actor=initial['actor_id'],organization=initial['organization_id']))
    r=B.run_raw(call(Q.UB));assert r.returncode!=0 and 'B2B_RESALE_ACTOR_DENIED' in r.stderr,r.stderr
    assert effects()==before
    results.append(dict(name='buyer',status='PASS',error=r.stderr[-1200:],zero_delta=True))
    # Preserve the old result explicitly as feature-only, never as tenant proof.
    r=B.run_raw(call(Q.UADMF,'fsf-feature-off-baseline-0001'))
    assert r.returncode!=0 and 'ESTQ_FEATURE_REQUIRED' in r.stderr,r.stderr
    results.append(dict(name='fsf_feature_off_baseline_not_tenant_proof',status='PASS',error=r.stderr[-1200:],zero_delta=True))
    # Same FSF admin, now with stock feature ON. Target remains ARBio: scope must deny.
    sql='BEGIN;SET session_replication_role=replica;'+enable_fsf_stock()+'SET session_replication_role=origin;'+call(Q.UADMF,'fsf-cross-tenant-feature-on-0001')+'ROLLBACK;'
    r=B.run_raw(sql)
    assert r.returncode!=0 and 'B2B_RESALE_ORDER_SCOPE_DENIED' in r.stderr,(r.stdout,r.stderr)
    assert effects()==before
    results.append(dict(name='fsf_cross_tenant_feature_on_role_valid',status='PASS',expected='B2B_RESALE_ORDER_SCOPE_DENIED',error=r.stderr[-1200:],feature_on=True,role_valid=True,zero_delta=True))
    sql='BEGIN;SET session_replication_role=replica;'+enable_fsf_stock()+'SET session_replication_role=origin;'+read(Q.UADMF)+'ROLLBACK;'
    r=B.run_raw(sql)
    assert r.returncode!=0 and 'B2B_RESALE_ORDER_SCOPE_DENIED' in r.stderr,(r.stdout,r.stderr)
    results.append(dict(name='fsf_reader_cross_tenant_feature_on',status='PASS',expected='B2B_RESALE_ORDER_SCOPE_DENIED',error=r.stderr[-1200:]))
    # Positive control: the same FSF actor/feature succeeds only after the whole
    # fixture ownership shape (partner owner and owned product) is FSF. Rollback
    # preserves the real candidate order and all ARBio data.
    own_sql=f"""BEGIN;SET session_replication_role=replica;{enable_fsf_stock()}
 UPDATE public.partner_accounts SET commercial_owner_organization_id='{Q.F}' WHERE id='{Q.P}';
 UPDATE public.produtos SET owner_organization_id='{Q.F}' WHERE id='{product}';
 SET session_replication_role=origin;"""
    own_read=B.last(own_sql+read(Q.UADMF)+'ROLLBACK;')
    # B.last returns the reader row even though the transaction is rolled back.
    own=json.loads(own_read)
    assert own['organization_id']==Q.F and own['items'][0]['create_available'] is True,own
    own_call=B.run_raw(own_sql+call(Q.UADMF,'fsf-own-positive-control-0001')+'ROLLBACK;')
    assert own_call.returncode==0,(own_call.stdout,own_call.stderr)
    own_ack=json.loads(own_call.stdout.strip().splitlines()[-1])
    assert own_ack['ok'] is True and own_ack['order_id']==order and own_ack['order_item_id']==item,own_ack
    assert effects()==before
    results.append(dict(name='fsf_own_positive_control_feature_on',status='PASS',ack=own_ack,fixture_rollback=True,zero_delta=True))
    variants=[
      ('not_approved',f"UPDATE public.partner_orders SET status='pendente' WHERE id='{order}';",'B2B_RESALE_ORDER_CONFLICT'),
      ('linked_terms_pending',f"UPDATE public.partner_order_payment_terms SET approval_status='pending',approved_by=NULL,approved_at=NULL WHERE id=(SELECT payment_terms_id FROM public.partner_orders WHERE id='{order}');",'B2B_RESALE_ORDER_CONFLICT'),
      ('revoked',f"UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UADM}';",'B2B_RESALE_ACTOR_DENIED'),
      ('feature_closed',"UPDATE public.saas_plan_version_features SET enabled=false WHERE feature_id IN (SELECT id FROM public.saas_features WHERE key='estoque_embalagens');",'ESTQ_FEATURE_REQUIRED'),
    ]
    for name,mutation,token in variants:
        sql='BEGIN;RESET ROLE;SET session_replication_role=replica;'+mutation+'SET session_replication_role=origin;'+call(Q.UADM)+'ROLLBACK;'
        r=B.run_raw(sql);assert r.returncode!=0 and token in r.stderr,(name,r.stdout,r.stderr)
        assert effects()==before
        results.append(dict(name=name,status='PASS',error=r.stderr[-1200:],fixture_only=True,all_guards_enabled_at_dispatch=True,zero_delta=True))
    r=B.run_raw("RESET ROLE;SET ROLE authenticated;SELECT platform_private.b2b_resale_os_create_v1(NULL,NULL,NULL,NULL);")
    assert r.returncode!=0 and 'permission denied for function b2b_resale_os_create_v1' in r.stderr,r.stderr
    results.append(dict(name='helper_direct_authenticated_function_acl',status='PASS',error=r.stderr[-500:]))
    # service_role lacks schema USAGE in this fixture, so the call stops at schema.
    # The ACL assertion is independent and exact: no EXECUTE on helper or public RPCs.
    acl=json.loads(B.last("""SELECT jsonb_build_object(
      'schema_usage',has_schema_privilege('service_role','platform_private','USAGE'),
      'helper_execute',has_function_privilege('service_role','platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)','EXECUTE'),
      'writer_execute',has_function_privilege('service_role','public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)','EXECUTE'),
      'reader_execute',has_function_privilege('service_role','public.rpc_b2b_resale_os_availability_v1(uuid)','EXECUTE'))::text;"""))
    assert acl=={'schema_usage':False,'helper_execute':False,'writer_execute':False,'reader_execute':False},acl
    r=B.run_raw("RESET ROLE;SET ROLE service_role;SELECT platform_private.b2b_resale_os_create_v1(NULL,NULL,NULL,NULL);")
    assert r.returncode!=0 and 'permission denied for schema platform_private' in r.stderr,r.stderr
    results.append(dict(name='service_role_catalog_acl_negative_separate_from_schema',status='PASS',acl=acl,direct_call_error=r.stderr[-500:],function_acl_proven_by_catalog=True))
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
    after=json.loads(B.last(read(Q.UADM)))
    assert after['items'][0]['os_id']==acks[0]['os_id'] and after['items'][0]['create_available'] is False,after
    results.append(dict(name='reader_recovers_existing_os_without_resend',status='PASS',os_id=acks[0]['os_id'],create_available=False))
    gate_off=json.loads(B.last('BEGIN;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;'+read(Q.UADM)+'ROLLBACK;'))
    assert gate_off['available'] is False and gate_off['items'][0]['create_available'] is False,gate_off
    results.append(dict(name='reader_gate_off_never_advertises_writer',status='PASS',available=False))
    (out/'os-endpoint-tests.json').write_text(json.dumps(dict(hosted=False,synthetic_auth=True,results=results),indent=2)+'\n')
    return acks[0]['os_id']
