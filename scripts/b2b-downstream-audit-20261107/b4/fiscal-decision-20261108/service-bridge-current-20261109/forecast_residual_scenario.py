#!/usr/bin/env python3
"""Cenários adicionais do plano aprovado; somente PostgreSQL descartável."""
import concurrent.futures
import hashlib
import json
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))


def test_terms_waits(B, Q, OUT, order_id):
    """Real captured guards and RPC, no trigger disable or authorization stub."""
    results = []
    terms_id = B.last(f"SELECT payment_terms_id FROM public.partner_orders WHERE id='{order_id}';")
    def snapshot():
        return json.loads(B.last(f"SELECT jsonb_build_object('order',to_jsonb(po),'terms',(SELECT to_jsonb(t) FROM public.partner_order_payment_terms t WHERE t.id=po.payment_terms_id),'forecasts',(SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id),'audit',(SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id=po.id)) FROM public.partner_orders po WHERE id='{order_id}';"))
    def race(name, mutation, restore, token):
        before = snapshot()
        # Hold the existing child row, then mutate actual authorization or its
        # mutable notes. The RPC must first lock the order and wait for this row.
        sql = f"BEGIN;SELECT id FROM public.partner_order_payment_terms WHERE id='{terms_id}' FOR UPDATE;SELECT pg_sleep(.8);{mutation};COMMIT;"
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            holder = pool.submit(B.run_raw, sql)
            time.sleep(.15)
            caller = pool.submit(Q.as_user, Q.UFIN, f"SELECT public.approve_b2b_payment_terms_secure('{order_id}','WAIT-{name}');")
            held = holder.result(); called = caller.result()
        after = snapshot()
        row = dict(name=name, before=before, after=after, holder_exit=held.returncode, holder_stderr=held.stderr, caller_exit=called.returncode, stdout=called.stdout, stderr=called.stderr, hosted=False)
        results.append(row)
        (OUT/'terms-wait-real-guards.json').write_text(json.dumps(results,indent=2)+'\n')
        assert held.returncode == 0, row
        assert called.returncode != 0 and token in called.stderr, row
        assert before['order'] == after['order'] and before['audit'] == after['audit'] and after['forecasts'] == 0, row
        if name != 'child-cas':
            assert before['terms'] == after['terms'], row
        if restore:
            restored = B.run_raw(restore)
            assert restored.returncode == 0, restored.stderr
    race('actor-revoked', f"UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UFIN}'", f"UPDATE public.profiles SET ativo=true WHERE user_id='{Q.UFIN}';", '42501')
    race('tenant-revoked', f"UPDATE public.organizations SET ativo=false WHERE id='{Q.A}'", f"UPDATE public.organizations SET ativo=true WHERE id='{Q.A}';", '42501')
    # A second real approval writer holds order THEN child; no reverse-lock
    # UPDATE of the child (its captured trigger itself locks the parent).
    before = snapshot()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        # Owner connection acquires the physical row, then the real RPC runs
        # as authenticated. A SELECT filtered to zero by RLS is not a lock.
        claims = json.dumps({'sub':Q.UFIN,'role':'authenticated','iat':1,'exp':4102444800}).replace("'","''")
        first = pool.submit(B.run_raw, f"BEGIN;SELECT id FROM public.partner_orders WHERE id='{order_id}' FOR UPDATE;SELECT pg_sleep(.8);SET ROLE authenticated;SET request.jwt.claim.sub='{Q.UFIN}';SET request.jwt.claims='{claims}';SELECT public.approve_b2b_payment_terms_secure('{order_id}','CONCURRENT FIRST');COMMIT;")
        time.sleep(.15)
        second = pool.submit(Q.as_user, Q.UFIN, f"SELECT public.approve_b2b_payment_terms_secure('{order_id}','CONCURRENT SECOND');")
        winner = first.result(); loser = second.result()
    after = snapshot()
    row = dict(name='canonical-terms-cas',before=before,after=after,winner_exit=winner.returncode,winner_stdout=winner.stdout,winner_stderr=winner.stderr,caller_exit=loser.returncode,stdout=loser.stdout,stderr=loser.stderr,hosted=False)
    results.append(row)
    (OUT/'terms-wait-real-guards.json').write_text(json.dumps(results,indent=2)+'\n')
    assert winner.returncode == 0 and loser.returncode != 0 and 'B2B_PAYMENT_TERMS_CAS_CONFLICT' in loser.stderr, row
    assert after['terms']['approval_notes'] == 'CONCURRENT FIRST' and after['terms']['approval_status'] == 'approved' and after['forecasts'] == 0, row
    return results


def exposure(B, Q, exclude=None, partner=None):
    claims = "'" + json.dumps(json.dumps({'sub': Q.UADM, 'role': 'authenticated', 'iat': 1, 'exp': 4102444800})).replace("'", "''") + "'"
    ex = 'NULL' if exclude is None else f"'{exclude}'"
    return json.loads(B.last(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';SET request.jwt.claims={claims};SELECT public.fn_b2b_credit_exposure('{partner or Q.P}',0,{ex});"))


def assert_order_exposure(B, Q, order_id, base_open, open_order, residual, partner=None, label=''):
    """Other orders of the partner are measured with p_exclude_order_id, never assumed zero."""
    full = exposure(B, Q, partner=partner)
    others = exposure(B, Q, exclude=order_id, partner=partner)
    got = dict(open=float(full['saldo_em_aberto']), committed=float(full['comprometido_nao_faturado']), pending=float(full['comprometido_pendente']),
               others_committed=float(others['comprometido_nao_faturado']), others_pending=float(others['comprometido_pendente']), total=float(full['exposicao_atual']))
    ok = (abs(got['open'] - (base_open + open_order)) < .001 and abs(got['committed'] - (got['others_committed'] + residual)) < .001
          and abs(got['pending'] - got['others_pending']) < .001
          and abs(got['total'] - (base_open + open_order + got['others_committed'] + got['others_pending'] + residual)) < .001)
    assert ok, (label, got, base_open, open_order, residual)
    return dict(full=full, others=others, order_open=open_order, order_residual=residual, order_exposure=open_order + residual, label=label)


def test_terms_replay(B, Q, OUT, order_id, before_fix=False):
    def state():
        return json.loads(B.last(f"SELECT jsonb_build_object('order',to_jsonb(po),'terms',(SELECT to_jsonb(t) FROM public.partner_order_payment_terms t WHERE t.id=po.payment_terms_id AND t.partner_order_id=po.id),'audit',(SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id=po.id),'notifications',(SELECT count(*) FROM public.notificacoes_operacionais WHERE tipo='b2b_payment_terms'),'forecast',(SELECT to_jsonb(f) FROM platform_private.b2b_financial_forecasts f WHERE f.order_id=po.id)) FROM public.partner_orders po WHERE po.id='{order_id}';"))
    original = state()
    called = Q.as_user(Q.UFIN, f"SELECT public.approve_b2b_payment_terms_secure('{order_id}','LOCAL TERMS REPLAY');")
    after = state()
    row = dict(before=original,after=after,exit=called.returncode,stdout=called.stdout,stderr=called.stderr,synthetic_auth=True,hosted=False,before_fix=before_fix)
    (OUT/('terms-replay-before.json' if before_fix else 'terms-replay-after.json')).write_text(json.dumps(row,indent=2)+'\n')
    assert called.returncode == 0, row
    if before_fix:
        assert after['terms']['approved_at'] != original['terms']['approved_at'] and after['audit'] > original['audit'], row
        # Notification containment may suppress the attempted write; a static
        # INSERT does not establish a delivered or persisted notification.
    else:
        assert original == after, row
        assert json.loads(called.stdout.strip().splitlines()[-1])['replayed'] is True, row
        for uid in (Q.UADM,Q.UFIN):
            again = Q.as_user(uid,f"SELECT public.approve_b2b_payment_terms_secure('{order_id}',NULL);")
            assert again.returncode == 0 and state() == original, (again.stdout,again.stderr)
        denied = Q.as_user(Q.UADMF,f"SELECT public.approve_b2b_payment_terms_secure('{order_id}',NULL);")
        assert denied.returncode != 0 and state() == original, (denied.stdout,denied.stderr)
    return row


def run_override(B, Q, OUT):
    """Crédito manual é exceção; crédito OK sem override já foi coberto pelo caso principal."""
    choice = Q.ch('boleto', 2, 30)
    assigned, assignment_error = Q.assign(Q.UADM, Q.PC, Q.P3, 'boleto', 2)
    assert assigned is not None, assignment_error
    baseline = json.loads(B.last(f"SELECT to_jsonb(s)::text FROM public.partner_financial_settings s WHERE partner_id='{Q.PC}';"))
    fields = ['billing_trigger','payment_terms_days','default_payment_method','credit_limit','block_if_overdue','auto_generate_receivable','active','credit_limit_action','overdue_tolerance_days','credit_alert_threshold_1','credit_alert_threshold_2']
    values = {k: baseline[k] for k in fields}
    values.update(credit_limit=1, credit_limit_action='approval_required', block_if_overdue=False)
    values['default_payment_method'] = B.last(f"SELECT name FROM public.payment_methods WHERE id='{Q.M_BOL}' AND active IS TRUE;")
    assert values['default_payment_method'], 'active canonical boleto method required'
    expected_sql = json.dumps(baseline).replace("'", "''")
    values_sql = json.dumps(values).replace("'", "''")
    configured = Q.as_user(Q.UFIN, f"SELECT public.rpc_update_partner_financial_settings('{Q.PC}','{expected_sql}'::jsonb,'{values_sql}'::jsonb);")
    assert configured.returncode == 0, configured.stderr
    simulated, error = Q.sim(Q.UBC, Q.P3, [Q.S(2)], choice, partner=Q.PC)
    assert simulated is not None, error
    journal, journal_error = Q.call(Q.UBC, f"public.recover_partner_order_attempt_v1('{Q.PC}',NULL,NULL,false,NULL)")
    assert journal is not None and journal['state'] == 'reserved', journal_error or journal
    created, error = Q.create(Q.UBC, Q.P3, [Q.S(2)], simulated['cart_hash'], journal['key'], choice, partner=Q.PC)
    assert created is not None, error
    order_id = created['id']
    before = json.loads(B.last(f"SELECT jsonb_build_object('status',status,'credit_approved_at',credit_approved_at,'credit_approved_by',credit_approved_by)::text FROM public.partner_orders WHERE id='{order_id}';"))
    assert before == {'status': 'aguardando_aprovacao_credito', 'credit_approved_at': None, 'credit_approved_by': None}, before
    assert B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';") == '0'
    seller_scope = Q.as_user(Q.UFIN, f"SELECT public.b2b_phase1_order_visible('{order_id}');")
    foreign = Q.as_user(Q.UADMF, f"SELECT public.approve_b2b_credit('{order_id}','FOREIGN DENIED');")
    assert foreign.returncode != 0 and 'b2b_phase1_scope_denied' in foreign.stderr, foreign.stderr
    unchanged = json.loads(B.last(f"SELECT jsonb_build_object('status',status,'credit_approved_at',credit_approved_at,'credit_approved_by',credit_approved_by)::text FROM public.partner_orders WHERE id='{order_id}';"))
    assert unchanged == before, unchanged
    approved_credit = Q.as_user(Q.UFIN, f"SELECT public.approve_b2b_credit('{order_id}','LOCAL MANUAL OVERRIDE');")
    assert approved_credit.returncode == 0, approved_credit.stderr
    test_terms_waits(B, Q, OUT, order_id)
    terms = Q.as_user(Q.UFIN, f"SELECT public.approve_b2b_payment_terms_secure('{order_id}','LOCAL TERMS BEFORE COMMERCIAL');")
    assert terms.returncode == 0, terms.stderr
    child = json.loads(B.last(f"SELECT to_jsonb(t) FROM public.partner_order_payment_terms t JOIN public.partner_orders po ON po.payment_terms_id=t.id WHERE po.id='{order_id}';"))
    assert child['approval_status'] == 'approved' and child['approved_by'] == Q.UFIN, child
    assert B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';") == '0'
    approved = Q.as_user(Q.UADM, f"SELECT public.approve_partner_order('{order_id}',NULL,NULL);")
    assert approved.returncode == 0, approved.stderr
    row = json.loads(B.last(f"SELECT jsonb_build_object('status',status,'credit_approved_at',credit_approved_at,'credit_approved_by',credit_approved_by,'residual',(SELECT residual_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}'),'total',(SELECT total_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}'))::text FROM public.partner_orders WHERE id='{order_id}';"))
    assert row['status'] == 'aprovado' and row['credit_approved_at'] and row['credit_approved_by'] == Q.UFIN, row
    assert float(row['residual']) == float(row['total']) > 0, row
    assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}';") == '0'
    (OUT/'forecast-manual-credit-override.json').write_text(json.dumps(dict(order_id=order_id, seller_scope_stdout=seller_scope.stdout, seller_scope_stderr=seller_scope.stderr, foreign_denied=foreign.stderr, before=before, after=row, receivables=0, hosted=False), indent=2)+'\n')
    return dict(order_id=order_id, seller_scope=seller_scope.returncode == 0 and seller_scope.stdout.strip().endswith('t'))


ENDPOINT = 'https://hnfe.fazenda.mg.gov.br/LOCAL-SYNTHETIC-NO-NETWORK'


def _key(n):
    key = '3526' + '1' * 34 + f'{n:06d}'
    assert len(key) == 44
    return key


def _last(proc):
    return json.loads(proc.stdout.strip().splitlines()[-1])


def version(Q, order_id):
    got = Q.as_user(Q.UADM, f"SELECT public.get_b2b_financial_forecast_secure('{order_id}');")
    assert got.returncode == 0, got.stderr
    return _last(got)['version']


def forecast_row(B, order_id):
    return json.loads(B.last(f"SELECT jsonb_build_object('state',state,'residual_amount',residual_amount,'version',version,'fiscal_intent_id',fiscal_intent_id,'last_error_code',last_error_code)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';"))


def sync_raw(Q, uid, tx, expected):
    return Q.as_user(uid, f"SELECT public.rpc_b2b_forecast_fiscal_sync_v1('{tx}',{expected});")


def sync(Q, uid, tx, expected):
    got = sync_raw(Q, uid, tx, expected)
    assert got.returncode == 0, (got.stdout, got.stderr)
    return _last(got)


def cancel_raw(Q, uid, order_id, expected, reason):
    return Q.as_user(uid, f"SELECT public.rpc_b2b_forecast_cancel_residual_v1('{order_id}',{expected},'{reason}');")


def insert_invoice(B, Q, order_id, partner, company, item_id, amount, n, issue_date='2027-02-01', with_tx=True):
    """Declared synthetic fiscal seam (same as the integrated fixture): document rows only.
    Outcomes are recorded exclusively by the canonical H13 callback, never by UPDATE."""
    invoice_id, xml_run_id, tx_id = Q.u(n), Q.u(n + 1), Q.u(n + 2)
    access_key = _key(n)
    xml_sha = hashlib.sha256(b'{}').hexdigest()
    fingerprint = hashlib.sha256(f'NFeAutorizacao4|{ENDPOINT}|{xml_sha}'.encode()).hexdigest()
    B.sql(f"""SET ROLE service_role;
 INSERT INTO public.fiscal_invoices(id,invoice_type,document_model,idempotency_key,status,normalized_status,environment,company_settings_id,organization_id,
   partner_order_id,debtor_partner_id,issue_date,total_amount,created_by,provider_reference,access_key)
  VALUES('{invoice_id}','NFE','NFE','local-forecast-invoice:{invoice_id}','PENDING','PENDING','HOMOLOGATION','{company}','{Q.A}','{order_id}','{partner}','{issue_date}',{amount},'{Q.UADM}','LOCAL-FORECAST-{n}','{access_key}');
 INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,partner_order_item_id,item_sequence,item_kind,quantity,commercial_unit,taxable_quantity,taxable_unit,net_value)
  VALUES('{invoice_id}','{item_id}',1,'PRODUCT',1,'UN',25,'KG',{amount});
 INSERT INTO public.fiscal_xml_runs(id,fiscal_invoice_id,idempotency_key,run_version,schema_version,environment_code,access_key,state,payload,payload_sha256,signed_sha256,signed_path,signed_at,validation,signature_metadata,created_by,updated_at)
  VALUES('{xml_run_id}','{invoice_id}','local-forecast-xml:{invoice_id}',1,'LOCAL-NFE-4.00','2','{access_key}','SIGNED','{{}}'::jsonb,'{xml_sha}','{xml_sha}','local/{invoice_id}.xml',now(),'{{"synthetic":true,"network":false}}'::jsonb,'{{"synthetic":true,"adapter":"LOCAL_FIXTURE_ONLY"}}'::jsonb,'{Q.UADM}',now());
""" + (f"""INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,xml_run_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,c_stat,x_motivo,ch_nfe,n_prot,ambiente_retorno,dh_recbto,completed_at,created_by)
  VALUES('{tx_id}','{invoice_id}','{xml_run_id}','NFeAutorizacao4','2','hnfe.fazenda.mg.gov.br','{ENDPOINT}','local-forecast-tx:{tx_id}','{fingerprint}','SENT','PENDING','103','PROCESSANDO','{access_key}',NULL,'2',now(),NULL,'{Q.UADM}');""" if with_tx else ''))
    return dict(invoice=invoice_id, xml_run=xml_run_id, tx=tx_id if with_tx else None, access_key=access_key)


FISCAL_BEGIN_PREFLIGHT_SQL = """BEGIN READ ONLY;
SELECT jsonb_build_object(
 'markers',(SELECT coalesce(jsonb_agg(jsonb_build_object('project_ref',m.project_ref,'production_emission_allowed',m.production_emission_allowed) ORDER BY m.ctid),'[]') FROM public.fiscal_environment_marker m),
 'clause1_marker_first',(SELECT jsonb_build_object('project_ref',project_ref,'production_emission_allowed',production_emission_allowed) FROM public.fiscal_environment_marker LIMIT 1),
 'clause2_tpamb_canonical_pick',(SELECT coalesce(nfe_environment_code,'') FROM public.company_fiscal_settings WHERE is_active LIMIT 1),
 'clause2_picked_row',(SELECT jsonb_build_object('id',id,'organization_id',organization_id,'nfe_environment_code',nfe_environment_code,'legal_name',legal_name,'ctid',ctid::text) FROM public.company_fiscal_settings WHERE is_active LIMIT 1),
 'active_settings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'nfe_environment_code',nfe_environment_code,'legal_name',legal_name,'ctid',ctid::text) ORDER BY ctid),'[]') FROM public.company_fiscal_settings WHERE is_active))::text;
ROLLBACK;"""


def fiscal_begin_preflight(B, OUT, label, invoice=None, org=None, require_marker=False):
    """READ ONLY replica of the begin writer environment predicates. Records the
    canonical tenant-blind pick (active settings LIMIT 1) and the tenant-scoped
    pick (invoice settings / own org). Never mutates nor relaxes the guard."""
    snap = json.loads([x for x in B.sql(FISCAL_BEGIN_PREFLIGHT_SQL).splitlines() if x.startswith('{')][-1])
    if invoice:
        snap['invoice_settings'] = json.loads([x for x in B.sql(f"""BEGIN READ ONLY;SELECT jsonb_build_object('company_settings_id',i.company_settings_id,'organization_id',i.organization_id,'environment',i.environment,
 'scoped_tpamb',(SELECT coalesce(c.nfe_environment_code,'') FROM public.company_fiscal_settings c WHERE c.id=i.company_settings_id AND c.organization_id=i.organization_id AND c.is_active))::text
 FROM public.fiscal_invoices i WHERE i.id='{invoice}';ROLLBACK;""").splitlines() if x.startswith('{')][-1])
        scoped = snap['invoice_settings']['scoped_tpamb']
    else:
        own = [r for r in snap['active_settings'] if r['organization_id'] == org]
        scoped = own[0]['nfe_environment_code'] if len(own) == 1 else None
    picked = snap['clause2_picked_row'] or {}
    snap['canonical_pick_is_other_tenant'] = bool(org and picked.get('organization_id') != org) or bool(invoice and picked.get('id') != snap['invoice_settings']['company_settings_id'])
    snap['scoped_tpamb'] = scoped
    m = snap['clause1_marker_first'] or {}
    failing = []
    if require_marker and (m.get('project_ref') != 'swzpzcwiasxmjutrmvkm' or m.get('production_emission_allowed') is not False):
        failing.append('clause1_marker')
    if scoped != '2':
        failing.append('clause2_scoped_tpamb')
    snap.update(label=label, failing_predicates=failing, readonly=True, hosted=False,
                canonical_clause2_result=('PASS' if snap['clause2_tpamb_canonical_pick'] == '2' else 'BLOCK'),
                endpoint_host_clause='static ENDPOINT hnfe.fazenda.mg.gov.br (clause3) not data dependent')
    path = OUT / 'fiscal-begin-preflight.json'
    rows = json.loads(path.read_text()) if path.exists() else []
    rows.append(snap)
    path.write_text(json.dumps(rows, indent=2) + '\n')
    assert not failing, f'FISCAL_BEGIN_PREFLIGHT_FAILED {label}: {failing}'
    return snap


def test_begin_env_tenant_scope(B, Q, OUT, doc, n):
    """Rolled-back negatives: the document's OWN settings decide tpamb; another
    tenant's active settings (env NULL sentinel or '2') never decide it."""
    out = {}
    company = B.last(f"SELECT company_settings_id FROM public.fiscal_invoices WHERE id='{doc['invoice']}';")
    call = (f"SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_begin_v1('NFeConsultaProtocolo4','local-env-scope-{n}',"
            f"'LOCAL-ENV-SCOPE-{n}','{ENDPOINT}','{doc['invoice']}','{doc['xml_run']}','{Q.UFIN}',NULL);")
    for name, mutate in [('own_settings_env_1', f"UPDATE public.company_fiscal_settings SET nfe_environment_code='1' WHERE id='{company}';"),
                         ('own_settings_env_null', f"UPDATE public.company_fiscal_settings SET nfe_environment_code=NULL WHERE id='{company}';"),
                         ('own_settings_inactive_other_tenant_env_2', f"UPDATE public.company_fiscal_settings SET nfe_environment_code='2' WHERE id<>'{company}';UPDATE public.company_fiscal_settings SET is_active=false WHERE id='{company}';")]:
        # Declared synthetic seam (as the fixture insert): settings staged with replica
        # role inside a rolled-back txn; triggers return to origin BEFORE the writer call.
        got = B.run_raw(f"BEGIN;SET LOCAL session_replication_role=replica;{mutate}SET LOCAL session_replication_role=origin;{call}ROLLBACK;")
        out[name] = dict(exit=got.returncode, blocked='FISCAL_PRODUCTION_ENDPOINT_BLOCKED' in got.stderr, stderr=got.stderr[-400:])
        assert got.returncode != 0 and out[name]['blocked'], out[name]
    out['transmissions_created'] = B.last(f"SELECT count(*) FROM public.fiscal_sefaz_transmissions WHERE idempotency_key LIKE 'local-env-scope-{n}%';")
    assert out['transmissions_created'] == '0', out
    (OUT/'begin-env-tenant-scope.json').write_text(json.dumps(dict(cases=out, rolled_back=True, hosted=False, seam='settings staged with replica role, writer called with origin role'), indent=2)+'\n')
    return out


def insert_followup_tx(B, Q, doc, n, service, OUT=None):
    if service=='NFeConsultaProtocolo4':
        if OUT is not None:
            fiscal_begin_preflight(B, OUT, f'pre-begin-consult-{n}', doc['invoice'], require_marker=True)
        got=B.run_raw(f"SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_begin_v1('{service}','local-forecast-consult-{n}','LOCAL-CONSULT-{n}','{ENDPOINT}','{doc['invoice']}','{doc['xml_run']}','{Q.UFIN}',NULL);")
        assert got.returncode==0,got.stderr
        return _last(got)['transmissionId']
    tx_id = Q.u(n)
    fingerprint = hashlib.sha256(f'{service}|{ENDPOINT}|{doc["access_key"]}'.encode()).hexdigest()
    B.sql(f"""SET ROLE service_role;INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,xml_run_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,c_stat,x_motivo,ch_nfe,ambiente_retorno,dh_recbto,created_by)
  VALUES('{tx_id}','{doc['invoice']}','{doc['xml_run']}','{service}','2','hnfe.fazenda.mg.gov.br','{ENDPOINT}','local-forecast-tx:{tx_id}','{fingerprint}','SENT','PENDING','103','PROCESSANDO','{doc['access_key']}','2',now(),'{Q.UADM}');""")
    return tx_id


def record(B, tx, state, patch):
    body = json.dumps(patch).replace("'", "''")
    return B.run_raw(f"SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{tx}','{state}','{body}'::jsonb);")


def authorize(B, doc, tx, protocol, when='2027-02-02T12:00:00Z'):
    return record(B, tx, 'SUCCEEDED', {'cStat': '104', 'protocolCStat': '100', 'nProt': protocol, 'chNFe': doc['access_key'],
                                       'xMotivo': 'LOTE PROCESSADO; PROTOCOLO AUTORIZADO', 'tpAmb': '2', 'dhRecbto': when})


def reject(B, tx, cstat, motive):
    key = B.last(f"SELECT i.access_key FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id WHERE t.id='{tx}';")
    got = record(B, tx, 'SUCCEEDED', {'cStat': cstat, 'xMotivo': motive, 'tpAmb': '2', 'chNFe':key,
                                   'responseSummary':{'cStat':cstat,'chNFe':key,'tpAmb':'2'}})
    assert got.returncode == 0 and _last(got)['outcome'] == 'REJECTED', (got.stdout, got.stderr)
    return _last(got)


def transport_error(B, tx, code):
    got = record(B, tx, 'FAILED', {'errorCode': code})
    assert got.returncode == 0 and _last(got)['outcome'] == 'TRANSPORT_ERROR', (got.stdout, got.stderr)
    return _last(got)


def denied(proc, token):
    assert proc.returncode != 0 and token in proc.stderr, (proc.stdout, proc.stderr)
    return proc.stderr.strip().splitlines()[0][:240]


def run_pre_nf_wrappers(B, Q, OUT, order_id, accepted, item):
    """Emission/consultation/cancel through authenticated wrappers over real callbacks."""
    # Local restoration is metadata-only: populate the staging marker explicitly,
    # with external emission still OFF. Never change a divergent existing marker.
    B.sql("INSERT INTO public.fiscal_environment_marker(project_ref,environment_label,production_emission_allowed) SELECT 'swzpzcwiasxmjutrmvkm','STAGING',false WHERE NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker);")
    assert B.last("SELECT project_ref='swzpzcwiasxmjutrmvkm' AND production_emission_allowed IS FALSE FROM public.fiscal_environment_marker;")=='t'
    (OUT/'fiscal-marker-local.json').write_text(json.dumps(dict(ref='swzpzcwiasxmjutrmvkm',synthetic=True,production_emission_allowed=False,hosted=False))+'\n')
    company = accepted['internal_economic_snapshot']['origin']['company_settings_id']
    log = []
    R = insert_invoice(B, Q, order_id, Q.P, company, item['id'], 9, 960)
    v = version(Q, order_id)
    from lifecycle_containment_tests import run as containment_run
    containment_run(B,Q,OUT,order_id,R,v)
    neg = dict(
        foreign_admin=denied(sync_raw(Q, Q.UADMF, R['tx'], v), 'B2B_FORECAST_'),
        cross_tenant_buyer=denied(sync_raw(Q, Q.UB2, R['tx'], v), 'B2B_FORECAST_FISCAL_'),
        service_role_wrapper=denied(B.run_raw(f"SET ROLE service_role;SELECT public.rpc_b2b_forecast_fiscal_sync_v1('{R['tx']}',{v});"), 'permission denied'),
        service_role_private=denied(B.run_raw(f"SET ROLE service_role;SELECT platform_private.b2b_financial_forecast_transition_v1(gen_random_uuid(),1,'EMISSION_STARTED','x','{{}}'::jsonb);"), 'permission denied'),
        authenticated_private_cancel=denied(Q.as_user(Q.UFIN, "SELECT platform_private.b2b_financial_forecast_cancel_residual_v1(gen_random_uuid(),1,'x');"), 'permission denied'),
        stale_version=denied(sync_raw(Q, Q.UFIN, R['tx'], v + 50), 'B2B_FORECAST_CAS_CONFLICT'),
    )
    assert forecast_row(B, order_id)['version'] == v
    started = sync(Q, Q.UFIN, R['tx'], v); log.append(started)
    assert started['event'] == 'EMISSION_STARTED' and started['state'] == 'emissao_em_andamento' and started['replayed'] is False, started
    replay = sync(Q, Q.UADM, R['tx'], v); log.append(replay)
    assert replay['replayed'] is True and replay['version'] == started['version'], replay
    reject(B, R['tx'], '539', 'Rejeicao local sintetica')
    rejected = sync(Q, Q.UFIN, R['tx'], started['version']); log.append(rejected)
    assert rejected['event'] == 'EMISSION_REJECTED' and rejected['state'] == 'aguardando_fiscal', rejected
    assert forecast_row(B, order_id)['last_error_code'] == '539'

    T = insert_invoice(B, Q, order_id, Q.P, company, item['id'], 9, 965)
    t_started = sync(Q, Q.UFIN, T['tx'], rejected['version']); log.append(t_started)
    transport_error(B, T['tx'], 'LOCAL_TRANSPORT_TIMEOUT')
    timeout = sync(Q, Q.UFIN, T['tx'], t_started['version']); log.append(timeout)
    assert timeout['event'] == 'EMISSION_TIMEOUT' and timeout['state'] == 'consulta_fiscal_obrigatoria', timeout
    neg['cancel_while_consultation_required'] = denied(cancel_raw(Q, Q.UFIN, order_id, timeout['version'], 'consulta pendente'), 'B2B_FORECAST_STATE_CONFLICT')
    neg['begin_env_tenant_scope'] = test_begin_env_tenant_scope(B, Q, OUT, T, 967)
    consult = insert_followup_tx(B, Q, T, 968, 'NFeConsultaProtocolo4', OUT)
    neg['consultation_not_terminal'] = denied(sync_raw(Q, Q.UFIN, consult, timeout['version']), 'B2B_FORECAST_FISCAL_OUTCOME_NOT_SYNCABLE')
    neg['cancel_with_consultation_in_flight'] = denied(cancel_raw(Q, Q.UFIN, order_id, timeout['version'], 'consulta em voo'), 'B2B_FORECAST_FISCAL_IN_FLIGHT')
    review = test_wrapper_review(B,Q,OUT,order_id,T,consult,timeout['version'])
    reject(B, consult, '217', 'NF-e nao consta na base de dados da SEFAZ')
    consulted = sync(Q, Q.UFIN, consult, timeout['version']); log.append(consulted)
    assert consulted['event'] == 'CONSULTATION_NOT_AUTHORIZED' and consulted['state'] == 'aguardando_fiscal', consulted

    # Revocation after the wrapper's wait: owner holds the forecast row, deactivates
    # the actor and commits; the wrapper re-authorizes after the lock and fails.
    W = insert_invoice(B, Q, order_id, Q.P, company, item['id'], 9, 970)
    before = forecast_row(B, order_id)
    holder_sql = f"BEGIN;SELECT id FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}' FOR UPDATE;SELECT pg_sleep(.8);UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UFIN}';COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        holder = pool.submit(B.run_raw, holder_sql)
        time.sleep(.2)
        caller = pool.submit(sync_raw, Q, Q.UFIN, W['tx'], before['version'])
        held, called = holder.result(), caller.result()
    assert held.returncode == 0, held.stderr
    neg['revoked_profile_after_lock'] = denied(called, 'B2B_FORECAST_FISCAL_ACTOR_DENIED')
    restored = B.run_raw(f"UPDATE public.profiles SET ativo=true WHERE user_id='{Q.UFIN}';")
    assert restored.returncode == 0, restored.stderr
    assert forecast_row(B, order_id) == before
    transport_error(B, W['tx'], 'LOCAL_ABANDONED_AFTER_DENIAL')
    final = forecast_row(B, order_id)
    assert final['state'] == 'aguardando_fiscal' and float(final['residual_amount']) == 18, final
    receivables = B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}';")
    assert receivables == '0', receivables
    result = dict(events=log, negatives=neg, review=review, final=final, receivables=0, invoices=dict(rejected=R, timeout=T, consultation_tx=consult, revocation=W),
                  callbacks='public.rpc_fiscal_sefaz_transmit_record_v1 as service_role (canonical H13 worker)',
                  wrappers_as='authenticated SQL role with JWT claims (local, not hosted JWT)', reset_role_used=False, hosted=False)
    (OUT / 'forecast-wrappers-pre-nf.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def test_wrapper_review(B,Q,OUT,order_id,doc,consult,v):
    """Actual SQL calls, rollback-only response mutations for negative provenance cases.
    These mutations characterize the reader, not fiscal/provider evidence."""
    rows=[]
    claims=json.dumps({'sub':Q.UFIN,'role':'authenticated','iat':1,'exp':4102444800}).replace("'","''")
    ctx=f"SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{Q.UFIN}';SET LOCAL request.jwt.claims='{claims}';"
    before=forecast_row(B,order_id)
    from pathlib import Path
    # Frozen 184 source, not a reconstructed stand-in. Rollback retains candidate.
    # Actual pre-review wrapper was frozen separately in the review package.
    old_folder=Path(__file__).parent/'forecast-pre-nf-20261109'
    old_source=old_folder/'wrappers-184.sql.capture'
    old=old_source.read_text()
    legacy=old[old.index('CREATE OR REPLACE FUNCTION public.rpc_b2b_forecast_fiscal_sync_v1'):old.index('$function$;',old.index('AS $function$'))+len('$function$;')]
    worker="SET LOCAL ROLE service_role;"
    repro=B.run_raw(f"BEGIN;{legacy}{worker}UPDATE public.fiscal_sefaz_transmissions SET state='SUCCEEDED',outcome='REJECTED',c_stat='215' WHERE id='{consult}';{ctx}SELECT public.rpc_b2b_forecast_fiscal_sync_v1('{consult}',{v});ROLLBACK;")
    assert repro.returncode==0 and 'CONSULTATION_NOT_AUTHORIZED' in repro.stdout,repro.stderr
    rows.append(dict(case='BEFORE-schema-rejection-clears-consultation',exit=repro.returncode,stdout=repro.stdout,stderr=repro.stderr,rollback=True))
    cases=[('schema-215',"c_stat='215'"),('receipt-106',"c_stat='106'"),('authorization-280',"c_stat='280'"),
           ('key-mismatch',"ch_nfe='"+_key(555)+"'"),('environment-mismatch',"ambiente_retorno='1'"),
           ('receipt-mismatch',"n_rec='DIVERGENT-RECEIPT'"),('document-mismatch',f"xml_run_id='{Q.u(961)}'"),
           ('return-batch-not-proof',"service='NFeRetAutorizacao4'"),('stale-response',"created_at='2000-01-01'::timestamptz"),
           ('missing-returned-proof',"response_summary='{\"cStat\":\"217\",\"tpAmb\":\"2\"}'::jsonb"),('returned-key-mismatch',"response_summary='{}'::jsonb")]
    for name,change in cases:
        sql=f"BEGIN;UPDATE public.fiscal_sefaz_transmissions SET state='SUCCEEDED',outcome='REJECTED',c_stat='217',ch_nfe='{doc['access_key']}',ambiente_retorno='2',completed_at=now(),{change} WHERE id='{consult}';{ctx}SELECT public.rpc_b2b_forecast_fiscal_sync_v1('{consult}',{v});ROLLBACK;"
        # Avoid assigning the same column twice while preserving the complete baseline.
        proof=json.dumps({'cStat':'217','chNFe':doc['access_key'],'tpAmb':'2'})
        assignments={k:val for k,val in (s.split('=',1) for s in ["state='SUCCEEDED'","outcome='REJECTED'","c_stat='217'",f"ch_nfe='{doc['access_key']}'","ambiente_retorno='2'","completed_at=now()",f"response_summary='{proof}'::jsonb",change])}
        sql=f"BEGIN;{worker}UPDATE public.fiscal_sefaz_transmissions SET "+','.join(k+'='+val for k,val in assignments.items())+f" WHERE id='{consult}';{ctx}SELECT public.rpc_b2b_forecast_fiscal_sync_v1('{consult}',{v});ROLLBACK;"
        got=B.run_raw(sql)
        rows.append(dict(case=name,exit=got.returncode,stderr=got.stderr,hosted=False))
        # Immutable source identity is denied by the existing canonical guard
        # before the wrapper; record that separately, never disable the trigger.
        expected='FISCAL_TRANSMISSION_FIELDS_IMMUTABLE' if name in ('document-mismatch','return-batch-not-proof','stale-response') else 'B2B_FORECAST_FISCAL_OUTCOME_NOT_SYNCABLE'
        assert got.returncode!=0 and expected in got.stderr,rows[-1]
        (OUT/'wrapper-review-affected.json').write_text(json.dumps(rows,indent=2)+'\n')
        assert forecast_row(B,order_id)==before
    # Foreign actor must not wait on an actual row lock of this tenant.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        hold=pool.submit(B.run_raw,f"BEGIN;SELECT id FROM public.fiscal_invoices WHERE id='{doc['invoice']}' FOR UPDATE;SELECT id FROM public.partner_orders WHERE id='{order_id}' FOR UPDATE;SELECT pg_sleep(1);COMMIT;")
        time.sleep(.2)
        start=time.monotonic()
        claims_f=json.dumps({'sub':Q.UADMF,'role':'authenticated','iat':1,'exp':4102444800}).replace("'","''")
        foreign_ctx=f"BEGIN;SET LOCAL lock_timeout='150ms';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{Q.UADMF}';SET LOCAL request.jwt.claims='{claims_f}';"
        a=B.run_raw(foreign_ctx+f"SELECT public.rpc_b2b_forecast_fiscal_sync_v1('{consult}',{v});COMMIT;")
        b=B.run_raw(foreign_ctx+f"SELECT public.rpc_b2b_forecast_cancel_residual_v1('{order_id}',{v},'foreign');COMMIT;")
        elapsed=time.monotonic()-start;held=hold.result()
    assert held.returncode==0 and a.returncode!=0 and b.returncode!=0
    assert '42501' in a.stderr and '42501' in b.stderr and 'lock timeout' not in a.stderr+b.stderr,(a.stderr,b.stderr)
    rows.append(dict(case='foreign-no-wait',sync=a.stderr,cancel=b.stderr,elapsed=elapsed))
    # ACL drift must fail actual generated POST, not just a source assertion.
    folder=Path(__file__).parent/'forecast-pre-nf-20261109'
    for sig in ('platform_private.b2b_credit_balances(uuid,uuid)','platform_private.b2b_order_residual(uuid)'):
        post=(folder/'11-post-credit-composition.sql.readonly').read_text().replace('BEGIN READ ONLY;','').replace('ROLLBACK;','')
        got=B.run_raw(f"BEGIN;GRANT EXECUTE ON FUNCTION {sig} TO authenticated;"+post+'ROLLBACK;')
        assert got.returncode!=0 and 'B2B_CREDIT_COMPOSITION_POST_ACL' in got.stderr,got.stderr
        rows.append(dict(case='helper-acl-drift',signature=sig,stderr=got.stderr))
    (OUT/'wrapper-review-affected.json').write_text(json.dumps(rows,indent=2)+'\n')
    return rows


def run_partial_completion(B, Q, OUT, order_id, accepted, item, first_invoice, first_receivable, credit_before):
    """Duas NFs de 9, corrida das duas últimas NFs, replay, H7 e pagamento canônico de 9."""
    assert float(accepted['final_amount_with_interest']) == 18.0, accepted['final_amount_with_interest']
    base_open = float(credit_before['saldo_em_aberto'])
    first_credit = assert_order_exposure(B, Q, order_id, base_open, 9, 9, label='after NF1: title 9 + residual 9 = 18')
    assert abs(float(first_credit['full']['exposicao_atual']) - float(credit_before['exposicao_atual'])) < .001, (first_credit, credit_before)

    # Replay race only through the canonical H13 callback (the bridge itself has no
    # service grant); identical authorized returns must keep one document and title.
    first_doc = dict(invoice=first_invoice, access_key='35261111111111111111111111111111111111111111')
    first_tx = B.last(f"SELECT id FROM public.fiscal_sefaz_transmissions WHERE fiscal_invoice_id='{first_invoice}' AND outcome='AUTHORIZED';")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        races = list(pool.map(lambda _: authorize(B, first_doc, first_tx, 'LOCAL-INTEGRATED-PROTOCOL', '2027-02-01T12:00:00Z'), range(2)))
    assert all(r.returncode == 0 and _last(r)['reconciliationPending'] is False for r in races), [(r.stdout, r.stderr) for r in races]
    direct_bridge = denied(B.run_raw(f"SET ROLE service_role;SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{first_invoice}');"), 'permission denied')
    assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{first_invoice}';") == '1'
    assert B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecast_events WHERE event_type='FISCAL_CONFIRMED' AND event_reference='{first_invoice}';") == '1'

    company = accepted['internal_economic_snapshot']['origin']['company_settings_id']
    A = insert_invoice(B, Q, order_id, Q.P, company, item['id'], 9, 910, '2027-02-02')
    Z = insert_invoice(B, Q, order_id, Q.P, company, item['id'], 9, 920, '2027-02-02')
    v = version(Q, order_id)
    started = sync(Q, Q.UFIN, A['tx'], v)
    assert started['event'] == 'EMISSION_STARTED' and started['state'] == 'emissao_em_andamento', started
    second_intent_denied = denied(sync_raw(Q, Q.UFIN, Z['tx'], started['version']), 'B2B_FORECAST_INTENT_CONFLICT')
    # Both authorizations arrive concurrently through the canonical callback.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        fa = pool.submit(authorize, B, A, A['tx'], 'LOCAL-INTEGRATED-PROTOCOL-2A')
        fz = pool.submit(authorize, B, Z, Z['tx'], 'LOCAL-INTEGRATED-PROTOCOL-2Z')
        ra, rz = fa.result(), fz.result()
    assert ra.returncode == 0 and rz.returncode == 0, (ra.stderr, rz.stderr)
    da, dz = _last(ra), _last(rz)
    assert da['outcome'] == 'AUTHORIZED' and dz['outcome'] == 'AUTHORIZED', (da, dz)
    pending = [d for d in (da, dz) if d['reconciliationPending']]
    closed = [d for d in (da, dz) if not d['reconciliationPending']]
    assert len(pending) == 1 and len(closed) == 1 and pending[0]['reconciliationCode'] == 'FISCAL_AUTHORIZATION_CLOSE_PENDING', (da, dz)
    winner, loser = (A, Z) if closed[0]['transmissionId'] == A['tx'] else (Z, A)
    second_receivable = B.last(f"SELECT receivable_id FROM public.fiscal_invoices WHERE id='{winner['invoice']}';")
    assert second_receivable and second_receivable != first_receivable
    loser_state = json.loads(B.last(f"SELECT jsonb_build_object('invoice_status',normalized_status,'receivable_id',receivable_id,'tx_outcome',(SELECT outcome FROM public.fiscal_sefaz_transmissions WHERE id='{loser['tx']}'),'tx_nprot',(SELECT n_prot FROM public.fiscal_sefaz_transmissions WHERE id='{loser['tx']}'),'close_pending',(SELECT error_code FROM platform_private.fiscal_close_pending WHERE transmission_id='{loser['tx']}'))::text FROM public.fiscal_invoices WHERE id='{loser['invoice']}';"))
    assert loser_state['receivable_id'] is None and loser_state['invoice_status'] != 'AUTHORIZED' and loser_state['tx_outcome'] == 'AUTHORIZED' and loser_state['tx_nprot'] and loser_state['close_pending'] == 'FISCAL_AUTHORIZATION_CLOSE_PENDING', loser_state
    loser_reason = B.run_raw(f"BEGIN;SET ROLE service_role;SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{loser['invoice']}','{loser['access_key']}','{'LOCAL-INTEGRATED-PROTOCOL-2A' if loser is A else 'LOCAL-INTEGRATED-PROTOCOL-2Z'}',now(),'100','LOTE PROCESSADO; PROTOCOLO AUTORIZADO','{loser['tx']}');ROLLBACK;")
    forecast = forecast_row(B, order_id)
    assert forecast['state'] == 'faturado_total' and float(forecast['residual_amount']) == 0 and forecast['version'] == started['version'] + 1, forecast
    second_credit = assert_order_exposure(B, Q, order_id, base_open, 18, 0, label='after NF2: titles 18 + residual 0 = 18')
    assert abs(float(second_credit['full']['exposicao_atual']) - float(credit_before['exposicao_atual'])) < .001, (second_credit, credit_before)
    totals = json.loads(B.last(f"SELECT jsonb_build_object('titles',count(*),'total',sum(total_amount))::text FROM public.accounts_receivable WHERE origin_id='{order_id}' AND b2b_document_id IS NOT NULL;"))
    assert totals['titles'] == 2 and float(totals['total']) == 18, totals
    replay = authorize(B, winner, winner['tx'], 'LOCAL-INTEGRATED-PROTOCOL-2A' if winner is A else 'LOCAL-INTEGRATED-PROTOCOL-2Z')
    assert replay.returncode == 0 and _last(replay)['reconciliationPending'] is False, (replay.stdout, replay.stderr)
    assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}' AND b2b_document_id IS NOT NULL;") == '2'
    assert forecast_row(B, order_id) == forecast

    # H7 negative with the tenant admin's claims so the H15 company guard is satisfied
    # and the immutability trigger itself must refuse; always rolled back.
    claims = json.dumps({'sub': Q.UADM, 'role': 'authenticated', 'iat': 1, 'exp': 4102444800}).replace("'", "''")
    h7_ctx = f"BEGIN;SET LOCAL request.jwt.claim.sub='{Q.UADM}';SET LOCAL request.jwt.claims='{claims}';"
    h7 = B.run_raw(h7_ctx + f"UPDATE public.fiscal_invoices SET receivable_id='{second_receivable}' WHERE id='{first_invoice}';ROLLBACK;")
    assert h7.returncode != 0 and 'FISCAL_DOCUMENT_LOCKED' in h7.stderr, h7.stderr
    h7_same = B.run_raw(h7_ctx + f"UPDATE public.fiscal_invoices SET receivable_id=receivable_id WHERE id='{first_invoice}';ROLLBACK;")
    h7_no_claims = B.run_raw(f"BEGIN;UPDATE public.fiscal_invoices SET receivable_id='{second_receivable}' WHERE id='{first_invoice}';ROLLBACK;")
    assert h7_no_claims.returncode != 0, h7_no_claims.stderr
    assert B.last(f"SELECT receivable_id FROM public.fiscal_invoices WHERE id='{first_invoice}';") == first_receivable

    # Projection reader authority is recorded as observed (not relaxed); the target
    # installment id is only identified by an owner read. The payment itself runs
    # through the canonical writer as the financial actor.
    projection_attempts = {}
    for label, uid in (('financeiro', Q.UFIN), ('administrador', Q.UADM)):
        got = Q.as_user(uid, f"SELECT public.rpc_receivable_money_projection_v1('{first_receivable}',0,1000);")
        projection_attempts[label] = dict(exit=got.returncode, stdout=got.stdout.strip()[-300:], stderr=got.stderr.strip()[:200])
    projection_meta=json.loads(B.last("""SELECT jsonb_build_object('body_md5',md5(pg_get_functiondef(p.oid)),
      'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE'))::text
      FROM pg_proc p WHERE p.oid='public.rpc_receivable_money_projection_v1(uuid,integer,integer)'::regprocedure;"""))
    assert projection_meta['authenticated_execute'] is False,projection_meta
    (OUT/'projection-reader-diagnosis.json').write_text(json.dumps(dict(metadata=projection_meta,
      attempts=projection_attempts,positive='BLOCKED_OWNER_ONLY_CANDIDATE_ACL',
      source='financial-price-generator-20261029/integration/origin.sql.review REVOKE includes authenticated',
      owner_read_is_not_positive=True,client_grants_added=False,hosted=False),indent=2)+'\n')
    installment = B.last(f"SELECT id FROM public.accounts_receivable_installments WHERE receivable_id='{first_receivable}' ORDER BY installment_number LIMIT 1;")
    assert B.last(f"SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id='{first_receivable}';") == '1'
    payment = json.dumps({'amount_received':9,'payment_method_id':Q.M_BOL,'idempotency_key':'LOCAL-FORECAST-PAY-9'}).replace("'", "''")
    paid = Q.as_user(Q.UFIN, f"SELECT public.rpc_register_receivable_payment('{installment}','{payment}'::jsonb);")
    assert paid.returncode == 0, paid.stderr
    paid_replay = Q.as_user(Q.UFIN, f"SELECT public.rpc_register_receivable_payment('{installment}','{payment}'::jsonb);")
    paid_credit = assert_order_exposure(B, Q, order_id, base_open, 9, 0, label='after payment 9: open 9 + residual 0 = 9')
    assert abs(float(paid_credit['full']['exposicao_atual']) - (float(credit_before['exposicao_atual']) - 9)) < .001, (paid_credit, credit_before)
    forecast_after_payment = forecast_row(B, order_id)
    assert forecast_after_payment == forecast, (forecast_after_payment, forecast)
    result = dict(first_invoice=first_invoice, first_receivable=first_receivable, replay_race=[_last(r) for r in races], direct_bridge_service_denied=direct_bridge, winner_invoice=winner['invoice'], loser_invoice=loser['invoice'], second_receivable=second_receivable,
                  second_intent_denied=second_intent_denied, concurrent_callbacks=dict(a=da, z=dz), loser_state=loser_state,
                  loser_reason=dict(exit=loser_reason.returncode, stderr=loser_reason.stderr.strip()[-600:]),
                  credit_before=credit_before, credit_after_first=first_credit, credit_after_second=second_credit, credit_after_payment=paid_credit,
                  forecast_after_second=forecast, forecast_after_payment=forecast_after_payment, titles=totals, payment_amount=9,
                  payment_replay=dict(exit=paid_replay.returncode, stdout=paid_replay.stdout.strip()[-300:], stderr=paid_replay.stderr.strip()[-300:]),
                  projection_reader_attempts=projection_attempts, installment_id=installment,
                  concurrent_replay_one_title=True, h7_receivable_id_immutable=True, h7=dict(change=h7.stderr.strip()[:300], same_value=dict(exit=h7_same.returncode, stderr=h7_same.stderr.strip()[:300]), without_claims=h7_no_claims.stderr.strip()[:300]), synthetic_fiscal_documents=True, hosted=False)
    (OUT/'forecast-two-partial-nf-and-payment.json').write_text(json.dumps(result, indent=2)+'\n')
    return result


def exposure_for(B, partner, uid):
    claims = "'" + json.dumps(json.dumps({'sub': uid, 'role': 'authenticated', 'iat': 1, 'exp': 4102444800})).replace("'", "''") + "'"
    return json.loads(B.last(f"RESET ROLE;SET request.jwt.claim.sub='{uid}';SET request.jwt.claims={claims};SELECT public.fn_b2b_credit_exposure('{partner}',0,NULL);"))


def run_cancel_late_callback(B, Q, OUT, pc_order, accepted):
    """Partial NF, residual cancel by wrapper, emission denied, late authorization -> close pending."""
    order = json.loads(B.last(f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{pc_order}';"))
    company = order['internal_economic_snapshot']['origin']['company_settings_id']
    item_id = B.last(f"SELECT id FROM public.partner_order_items WHERE order_id='{pc_order}' ORDER BY created_at,id LIMIT 1;")
    total = float(forecast_row(B, pc_order)['residual_amount'])
    from lifecycle_containment_tests import grant_sql
    B.sql(grant_sql(Q,pc_order,Q.PC))
    pc_base_open = float(exposure(B, Q, partner=Q.PC)['saldo_em_aberto'])
    pc_initial = assert_order_exposure(B, Q, pc_order, pc_base_open, 0, total, partner=Q.PC, label='PC before NF: residual only')
    half = round(total / 2, 2)
    # Same declared B4 customer seam as the main partner (partner_accounts.client_id).
    customer = Q.u(302)
    B.sql(f"SET session_replication_role=replica;INSERT INTO public.clientes(id,organization_id,nome,codigo_cliente) VALUES('{customer}','{Q.A}','CLIENTE FISCAL SINTETICO LOCAL PC','LOCAL-FISCAL-302') ON CONFLICT(id) DO NOTHING;UPDATE public.partner_accounts SET client_id='{customer}' WHERE id='{Q.PC}' AND commercial_owner_organization_id='{Q.A}';SET session_replication_role=origin;")
    baseline = json.loads(B.last(f"SELECT to_jsonb(s)::text FROM public.partner_financial_settings s WHERE partner_id='{Q.PC}';"))
    fields = ['billing_trigger','payment_terms_days','default_payment_method','credit_limit','block_if_overdue','auto_generate_receivable','active','credit_limit_action','overdue_tolerance_days','credit_alert_threshold_1','credit_alert_threshold_2']
    values = {k: baseline[k] for k in fields}; values.update(credit_limit=1000, credit_limit_action='block')
    configured = Q.as_user(Q.UFIN, f"SELECT public.rpc_update_partner_financial_settings('{Q.PC}','{json.dumps(baseline).replace(chr(39), chr(39)*2)}'::jsonb,'{json.dumps(values).replace(chr(39), chr(39)*2)}'::jsonb);")
    assert configured.returncode == 0, configured.stderr
    neg = dict(foreign_cancel=denied(cancel_raw(Q, Q.UADMF, pc_order, version(Q, pc_order), 'estrangeiro'), 'B2B_FORECAST_'),
               buyer_cancel=denied(cancel_raw(Q, Q.UBC, pc_order, version(Q, pc_order), 'comprador'), 'B2B_FORECAST_CANCEL_ACTOR_DENIED'))
    P1 = insert_invoice(B, Q, pc_order, Q.PC, company, item_id, half, 980, '2027-02-03')
    dry = B.run_raw(f"BEGIN;SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{P1['tx']}','SUCCEEDED','{json.dumps({'cStat':'104','protocolCStat':'100','nProt':'LOCAL-PC-1','chNFe':P1['access_key'],'xMotivo':'AUTORIZADO','tpAmb':'2','dhRecbto':'2027-02-03T12:00:00Z'})}'::jsonb);ROLLBACK;")
    dry_ok = dry.returncode == 0 and _last(dry)['reconciliationPending'] is False
    path = 'PARTIAL_THEN_CANCEL' if dry_ok else 'CANCEL_BEFORE_NF'
    partial = None
    if dry_ok:
        s1 = sync(Q, Q.UFIN, P1['tx'], version(Q, pc_order))
        got = authorize(B, P1, P1['tx'], 'LOCAL-PC-1', '2027-02-03T12:00:00Z')
        assert got.returncode == 0 and _last(got)['reconciliationPending'] is False, (got.stdout, got.stderr)
        partial = forecast_row(B, pc_order)
        assert partial['state'] == 'faturado_parcial' and abs(float(partial['residual_amount']) - (total - half)) < .001, partial
        exp_partial = assert_order_exposure(B, Q, pc_order, pc_base_open, half, total - half, partner=Q.PC, label='PC after partial NF')
    else:
        reject(B, P1['tx'], '539', 'Rejeicao local sintetica PC')
        exp_partial = None
    L = insert_invoice(B, Q, pc_order, Q.PC, company, item_id, half, 985, '2027-02-04')
    l_started = sync(Q, Q.UFIN, L['tx'], version(Q, pc_order))
    transport_error(B, L['tx'], 'LOCAL_TRANSPORT_TIMEOUT_PC')
    l_timeout = sync(Q, Q.UFIN, L['tx'], l_started['version'])
    consult = insert_followup_tx(B, Q, L, 988, 'NFeConsultaProtocolo4', OUT)
    reject(B, consult, '217', 'NF-e nao consta na base de dados da SEFAZ')
    l_consulted = sync(Q, Q.UFIN, consult, l_timeout['version'])
    assert l_consulted['state'] == 'aguardando_fiscal', l_consulted
    # Functional cancellation control uses this separate reconciled PC order,
    # not the main authorization-control document still in flight.
    in_flight=B.last(f"SELECT count(*) FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id WHERE i.partner_order_id='{pc_order}' AND t.state IN ('PENDING','SENT');")
    assert in_flight=='0',in_flight
    functional_before=forecast_row(B,pc_order)
    functional=Q.as_user(Q.UFIN,f"BEGIN;SELECT public.rpc_b2b_forecast_cancel_residual_v1('{pc_order}',{l_consulted['version']},'LOCAL DEDICATED RECONCILED CONTROL');ROLLBACK;")
    assert functional.returncode==0,functional.stderr
    functional_ack=_last(functional)
    assert functional_ack['state'] in ('cancelado_residual','cancelado_antes_nf'),functional_ack
    assert forecast_row(B,pc_order)==functional_before
    (OUT/'lifecycle-cancel-functional-control.json').write_text(json.dumps(dict(
      classification='FUNCTIONAL_CANCEL_SUCCESS_DEDICATED_RECONCILED_REFERENCE_ROLLBACK',
      order_id=pc_order,invoice_id=L['invoice'],consultation_id=consult,in_flight=0,
      canonical_reconciliation=l_consulted,exit=functional.returncode,ack=functional_ack,
      state_preserved_after_rollback=True,hosted=False),indent=2)+'\n')
    begin_race = test_begin_cancel_race(B,Q,OUT,pc_order,L,l_consulted['version'])
    # Permanent cancel wins against canonical begin, not only rollback serialization.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        claims=json.dumps({'sub':Q.UFIN,'role':'authenticated','iat':1,'exp':4102444800})
        held_cancel=pool.submit(B.run_raw,f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{Q.UFIN}';SET LOCAL request.jwt.claims='{claims}';SELECT public.rpc_b2b_forecast_cancel_residual_v1('{pc_order}',{version(Q,pc_order)},'Residual cancelado por decisao comercial local');SELECT pg_sleep(.8);COMMIT;")
        time.sleep(.2)
        losing_begin=pool.submit(B.run_raw,begin_statement(Q,L,'permanent-cancel-wins'))
        canceled,begin_lost=held_cancel.result(),losing_begin.result()
    assert begin_lost.returncode!=0 and 'B2B_FORECAST_BEGIN_BLOCKED' in begin_lost.stderr,begin_lost.stderr
    assert canceled.returncode == 0, canceled.stderr
    canceled_data = json.loads(next(x for x in canceled.stdout.splitlines() if x.startswith('{')))
    expected_state = 'cancelado_residual' if dry_ok else 'cancelado_antes_nf'
    assert canceled_data['state'] == expected_state, canceled_data
    after_cancel = forecast_row(B, pc_order)
    assert float(after_cancel['residual_amount']) == 0, after_cancel
    blocked_begin = B.run_raw(begin_statement(Q,L,'after-cancel'))
    assert blocked_begin.returncode!=0 and 'B2B_FORECAST_BEGIN_BLOCKED' in blocked_begin.stderr,blocked_begin.stderr
    from pathlib import Path
    root=Path(__file__).resolve().parents[4]
    capture=json.loads((root/'scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-184/current-pre-physical.json').read_text())
    old_begin=next(r['body'] for r in capture['functions'] if r['name']=='rpc_fiscal_sefaz_transmit_begin_v1')
    old_started=B.run_raw('BEGIN;'+old_begin+';'+begin_statement(Q,L,'BEFORE-canceled-begin')+'ROLLBACK;')
    assert old_started.returncode==0 and '"idempotentReplay": false' in old_started.stdout,old_started.stderr
    cancel_replay = denied(cancel_raw(Q, Q.UFIN, pc_order, l_consulted['version'], 'repeticao'), 'B2B_FORECAST_')
    exp_cancel = assert_order_exposure(B, Q, pc_order, pc_base_open, half if dry_ok else 0, 0, partner=Q.PC, label='PC after residual cancel: residual not counted')
    N = insert_invoice(B, Q, pc_order, Q.PC, company, item_id, half, 990, '2027-02-05')
    emission_denied = denied(sync_raw(Q, Q.UFIN, N['tx'], after_cancel['version']), 'B2B_FORECAST_FISCAL_AMOUNT_EXCEEDS_RESIDUAL')
    reject(B, N['tx'], '539', 'Rejeicao local sintetica residual cancelado')
    late = insert_followup_tx(B, Q, L, 993, 'NFeRetAutorizacao4')
    late_got = authorize(B, L, late, 'LOCAL-PC-LATE', '2027-02-06T12:00:00Z')
    assert late_got.returncode == 0, late_got.stderr
    late_data = _last(late_got)
    assert late_data['outcome'] == 'AUTHORIZED' and late_data['reconciliationPending'] is True and late_data['reconciliationCode'] == 'FISCAL_AUTHORIZATION_CLOSE_PENDING', late_data
    late_reason = B.run_raw(f"BEGIN;SET ROLE service_role;SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{L['invoice']}','{L['access_key']}','LOCAL-PC-LATE',now(),'100','LOTE PROCESSADO; PROTOCOLO AUTORIZADO','{late}');ROLLBACK;")
    assert late_reason.returncode != 0 and ('B2B_FORECAST_RESIDUAL_CANCELED' in late_reason.stderr or 'CANCEL' in late_reason.stderr), late_reason.stderr
    final = forecast_row(B, pc_order)
    assert final == after_cancel, (final, after_cancel)
    titles = json.loads(B.last(f"SELECT jsonb_build_object('titles',count(*),'total',coalesce(sum(total_amount),0))::text FROM public.accounts_receivable WHERE origin_id='{pc_order}' AND b2b_document_id IS NOT NULL;"))
    assert titles['titles'] == (1 if dry_ok else 0), titles
    evidence = json.loads(B.last(f"SELECT jsonb_build_object('tx',(SELECT jsonb_build_object('outcome',outcome,'c_stat',c_stat,'n_prot',n_prot,'ch_nfe',ch_nfe) FROM public.fiscal_sefaz_transmissions WHERE id='{late}'),'invoice',(SELECT jsonb_build_object('normalized_status',normalized_status,'receivable_id',receivable_id) FROM public.fiscal_invoices WHERE id='{L['invoice']}'),'close_pending',(SELECT jsonb_build_object('error_code',error_code,'attempts',attempts) FROM platform_private.fiscal_close_pending WHERE transmission_id='{late}'))::text;"))
    assert evidence['tx']['n_prot'] == 'LOCAL-PC-LATE' and evidence['invoice']['receivable_id'] is None and evidence['close_pending']['error_code'] == 'FISCAL_AUTHORIZATION_CLOSE_PENDING', evidence
    exp_final = assert_order_exposure(B, Q, pc_order, pc_base_open, half if dry_ok else 0, 0, partner=Q.PC, label='PC after late callback: unchanged, close pending explicit')
    blocked_after = denied(cancel_raw(Q, Q.UFIN, pc_order, final['version'], 'nova tentativa'), 'B2B_FORECAST_')
    result = dict(order_id=pc_order, path=path, dry_run=dict(exit=dry.returncode, stdout=dry.stdout.strip()[-400:], stderr=dry.stderr.strip()[-400:]),
                  exposure_initial=pc_initial, partial=partial, exposure_partial=exp_partial, canceled=canceled_data, cancel_replay=cancel_replay, exposure_after_cancel=exp_cancel,
                  emission_after_cancel_denied=emission_denied, late_callback=late_data, late_close_code=late_data['reconciliationCode'],
                  late_reason=late_reason.stderr.strip()[-500:], evidence_preserved=evidence, forecast_final=final, titles=titles,
                  exposure_final=exp_final, cancel_after_late_denied=blocked_after, negatives=neg,
                  seams=['partner_accounts.client_id for PC (same declared B4 customer seam)', 'fiscal document rows inserted as service_role; outcomes only via canonical callback'],
                  begin_cancel_race=begin_race, canonical_begin_after_cancel=blocked_begin.stderr,
                  before_canceled_begin=dict(exit=old_started.returncode,stdout=old_started.stdout,rollback=True), hosted=False)
    (OUT/'forecast-cancel-late-callback.json').write_text(json.dumps(result, indent=2)+'\n')
    return result


def begin_statement(Q,doc,key):
    return f"SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_begin_v1('NFeAutorizacao4','LOCAL-REVIEW-{key}','LOCAL-FINGERPRINT-{key}','{ENDPOINT}','{doc['invoice']}','{doc['xml_run']}','{Q.UADM}',NULL);"


def test_begin_cancel_race(B,Q,OUT,order_id,doc,v):
    """Canonical begin and cancel in two connections, both serial orders.
    The holding transaction rolls back; no fiscal outcomes/state is manufactured."""
    rows=[]
    before=forecast_row(B,order_id)
    claims=json.dumps({'sub':Q.UFIN,'role':'authenticated','iat':1,'exp':4102444800}).replace("'","''")
    ctx=f"SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{Q.UFIN}';SET LOCAL request.jwt.claims='{claims}';"
    repeatable=B.run_raw('BEGIN ISOLATION LEVEL REPEATABLE READ;'+begin_statement(Q,doc,'repeatable-denied')+'ROLLBACK;')
    assert repeatable.returncode!=0 and 'READ_COMMITTED_REQUIRED' in repeatable.stderr,repeatable.stderr
    # Two independent invoice intentions for the same residual, before any SYNC.
    extra=insert_invoice(B,Q,order_id,Q.PC,
      B.last(f"SELECT company_settings_id FROM public.fiscal_invoices WHERE id='{doc['invoice']}';"),
      B.last(f"SELECT partner_order_item_id FROM public.fiscal_invoice_items WHERE fiscal_invoice_id='{doc['invoice']}' LIMIT 1;"),9,1005,with_tx=False)  # second intention has NO fixture transmission: only the canonical begin may create one
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        winner=pool.submit(B.run_raw,'BEGIN;'+begin_statement(Q,doc,'intent-first')+'SELECT pg_sleep(.8);COMMIT;')
        time.sleep(.2)
        loser=pool.submit(B.run_raw,begin_statement(Q,extra,'intent-second'))
        won,lost=winner.result(),loser.result()
    assert won.returncode==0 and lost.returncode!=0 and 'B2B_FORECAST_BEGIN_BLOCKED' in lost.stderr,(won.stderr,lost.stderr)
    reserved_tx=json.loads(next(x for x in won.stdout.splitlines() if x.startswith('{')))['transmissionId']
    assert forecast_row(B,order_id)['state']=='emissao_em_andamento'
    assert B.last(f"SELECT count(*) FROM public.fiscal_sefaz_transmissions WHERE idempotency_key='LOCAL-REVIEW-intent-second';")=='0'
    # Settle through canonical timeout + current consultation, not UPDATE.
    transport_error(B,reserved_tx,'LOCAL_TWO_INTENT_TIMEOUT')
    timed=sync(Q,Q.UFIN,reserved_tx,version(Q,order_id))
    c=insert_followup_tx(B,Q,doc,1008,'NFeConsultaProtocolo4');reject(B,c,'217','LOCAL TWO INTENT ABSENCE')
    clear=sync(Q,Q.UFIN,c,timed['version']);v=clear['version'];before=forecast_row(B,order_id)
    rows.append(dict(case='two-begins-before-sync',winner=won.stdout,loser=lost.stderr,repeatable=repeatable.stderr))
    # Begin owns the shared order lock. Cancel waits, then sees committed pending tx.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(B.run_raw,'BEGIN;'+begin_statement(Q,doc,'begin-first')+'SELECT pg_sleep(.8);COMMIT;')
        time.sleep(.2)
        cancel=pool.submit(cancel_raw,Q,Q.UFIN,order_id,v,'race begin first')
        held,called=holder.result(),cancel.result()
    assert held.returncode==0 and called.returncode!=0 and 'B2B_FORECAST_FISCAL_IN_FLIGHT' in called.stderr,(held.stderr,called.stderr)
    tx=json.loads(next(x for x in held.stdout.splitlines() if x.startswith('{')))['transmissionId']
    # BEGIN now reserves EMISSION_STARTED atomically. SYNC is an exact replay.
    reserved=forecast_row(B,order_id)
    assert reserved['state']=='emissao_em_andamento' and reserved['version']==v+1,reserved
    replay_begin=B.run_raw(begin_statement(Q,doc,'begin-first'))
    assert replay_begin.returncode==0 and _last(replay_begin)['idempotentReplay'] is True,replay_begin.stderr
    transport_error(B,tx,'LOCAL_RACE_FINISHED_NO_EMISSION')
    rows.append(dict(case='begin-first',begin_stdout=held.stdout,cancel_stderr=called.stderr))
    timed=sync(Q,Q.UFIN,tx,reserved['version'])
    consult=insert_followup_tx(B,Q,doc,997,'NFeConsultaProtocolo4')
    reject(B,consult,'217','LOCAL RACE PROTOCOL ABSENCE')
    cleared=sync(Q,Q.UFIN,consult,timed['version'])
    v=cleared['version'];before=forecast_row(B,order_id)
    # Cancel owns order+forecast and commits before begin; the writer itself denies.
    # Rollback-only cancel serialization is tested here, permanent canceled path below.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(B.run_raw,f"BEGIN;{ctx}SELECT public.rpc_b2b_forecast_cancel_residual_v1('{order_id}',{v},'race rollback cancel');SELECT pg_sleep(.8);ROLLBACK;")
        time.sleep(.2)
        started=time.monotonic();begin=pool.submit(B.run_raw,'BEGIN;'+begin_statement(Q,doc,'cancel-lock-first')+'ROLLBACK;')
        held,called=holder.result(),begin.result();elapsed=time.monotonic()-started
    assert held.returncode==0 and called.returncode==0 and elapsed>.35,(held.stderr,called.stderr,elapsed)
    assert forecast_row(B,order_id)==before
    rows.append(dict(case='cancel-lock-first-rollback',cancel_stdout=held.stdout,begin_stdout=called.stdout,elapsed=elapsed))
    (OUT/'canonical-begin-cancel-race.json').write_text(json.dumps(rows,indent=2)+'\n')
    return rows
