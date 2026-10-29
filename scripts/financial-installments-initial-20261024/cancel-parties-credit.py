"""Owner/credit hypotheses in the existing disposable runner; no release SQL.

Projection carriers are NOT order/title/fiscal writers or authorization evidence.
All identifiers below are synthetic fixture identifiers, never name resolution.
"""
import json, difflib

def exercise(h, metadata):
    m,r=h.m,h.r
    diffs=[]; green='PARTIES_CREDIT_GREEN_SANDBOX'; red='PARTIES_CREDIT_RED_CAPTURED'
    def source(name):return next(f for f in r.live['functions'] if f['schema']=='public' and f['name']==name)
    def transform(name, anchor, replacement):
        old=m.pg.sql('SELECT pg_get_functiondef('+m.q(source(name)['signature'])+'::regprocedure)')
        assert old.count(anchor)==1,(name,anchor)
        new=old.replace(anchor,replacement);m.pg.sql(new+';')
        h.acl('FUNCTION',source(name)['signature'],source(name)['acl'])
        diffs.append(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile=name+' previous sandbox',tofile='offline only')))
        return new
    def reject(label,sql,expected,actor=m.U,mode=green):
        before=h.state();identities=m.pg.sql("SELECT jsonb_build_object('orgs',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM organizations o),'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY user_id) FROM profiles p),'roles',(SELECT jsonb_agg(to_jsonb(u) ORDER BY user_id,role) FROM user_roles u))")
        res=h.client(sql,actor)
        h.check(label+' exact error',expected,h.error_tuple(res),mode)
        h.check(label+' entire state unchanged',before,h.state(),mode)
        h.check(label+' identity state unchanged',identities,m.pg.sql("SELECT jsonb_build_object('orgs',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM organizations o),'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY user_id) FROM profiles p),'roles',(SELECT jsonb_agg(to_jsonb(u) ORDER BY user_id,role) FROM user_roles u))"),mode)
        h.responses.append(dict(test=label,stderr=res.stderr))
    values=dict(billing_trigger='manual',payment_terms_days=0,default_payment_method='LOCAL_METHOD',credit_limit=20000,
        block_if_overdue=True,auto_generate_receivable=False,active=True,credit_limit_action='block',
        overdue_tolerance_days=0,credit_alert_threshold_1=80,credit_alert_threshold_2=90)
    def update(partner,limit,actor):
        payload=dict(values,credit_limit=limit)
        observed=m.pg.sql('SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='+m.q(partner))
        return h.client('SELECT rpc_update_partner_financial_settings('+m.q(partner)+','+m.q(observed)+'::jsonb,'+m.q(json.dumps(payload))+'::jsonb);',actor)
    partners=[(m.U,m.A,m.uid(900002),'A'),(h.V,m.B,m.uid(900003),'B')]
    # Explicit zero was accepted by the canonical CAS but bypassed the captured
    # trigger's >0 comparison; positive financial progression is NOT safe RED.
    for actor,org,partner,label in partners:
        h.check('credit zero explicit CAS '+label,0,update(partner,0,actor).returncode,green)
        probe=m.uid(910000+(label=='B'))
        h.check('credit zero draft '+label,0,h.client(f"INSERT INTO harness.credit_probe(id,partner_id,status,total) VALUES('{probe}','{partner}','rascunho',100);",actor).returncode,green)
        h.check('RED zero progresses '+label,0,h.client(f"UPDATE harness.credit_probe SET status='aprovado' WHERE id='{probe}';",actor).returncode,red)
        h.check('RED zero approved persisted '+label,'aprovado',m.pg.sql(f"SELECT status FROM harness.credit_probe WHERE id='{probe}'"),red)
        h.check('RED zero approved shortcut '+label,0,h.client(f"UPDATE harness.credit_probe SET credit_approved_by='{actor}' WHERE id='{probe}';",actor).returncode,red)
    # Gate ahead of every approved shortcut; zero is configured but cannot authorize
    # financial progression, even through an existing credit-approved marker.
    anchor="IF auth.uid() IS NOT NULL AND NOT platform_private.c2p1_settings_allowed(NEW.partner_id,true) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;"
    transform('tg_partner_orders_credit_guard',anchor,anchor+"\n    IF EXISTS(SELECT 1 FROM public.partner_financial_settings s WHERE s.partner_id=NEW.partner_id AND s.credit_limit=0) THEN RAISE EXCEPTION 'B2B_ZERO_CREDIT_LIMIT' USING ERRCODE='23514'; END IF;")
    for actor,org,partner,label in partners:
        probe=m.uid(910000+(label=='B'))
        for statement in ["status='em_analise_comercial'","status='aprovado'","credit_approved_by="+m.q(actor)]:
            reject('GREEN zero progression '+label+' '+statement,f"UPDATE harness.credit_probe SET {statement} WHERE id='{probe}';",('23514','B2B_ZERO_CREDIT_LIMIT'),actor)
        foreign_actor=h.V if actor==m.U else m.U
        reject('GREEN zero foreign scope first '+label,f"UPDATE harness.credit_probe SET status='aprovado' WHERE id='{probe}';",('42501','C2P1_FORBIDDEN'),foreign_actor)
        h.check('credit restore explicit CAS '+label,0,update(partner,20000,actor).returncode,green)
    transform('fn_b2b_credit_exposure',"    WHEN v_limit <= 0 THEN 'NO_LIMIT_DEFINED'\n",'')
    # Exact service-only exposure via a reduced DEFINER trigger carrier; no public
    # EXECUTE on the calculator and no fabricated origin/approval/title writer.
    m.pg.sql("CREATE TABLE harness.exposure_probe(id uuid PRIMARY KEY,partner_id uuid,new_amount numeric,exclude_order_id uuid,result jsonb); GRANT INSERT,SELECT,UPDATE ON harness.exposure_probe TO authenticated; CREATE FUNCTION harness.exposure_carrier() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN NEW.result:=public.fn_b2b_credit_exposure(NEW.partner_id,NEW.new_amount,NEW.exclude_order_id); RETURN NEW; END$$; REVOKE ALL ON FUNCTION harness.exposure_carrier() FROM PUBLIC,anon,authenticated; CREATE TRIGGER exposure BEFORE INSERT OR UPDATE ON harness.exposure_probe FOR EACH ROW EXECUTE FUNCTION harness.exposure_carrier();")
    h.extra_state_tables.append('harness.exposure_probe')
    partner=m.uid(900002);other=m.uid(900003)
    part=h.fixture(920000,'receivable',m.A,b2b=True)
    title=m.pg.sql(f"SELECT receivable_id FROM accounts_receivable_installments WHERE id='{part}'")
    # Payment event is synthetic but executes the captured monetary recalculation.
    m.pg.sql(f"INSERT INTO receivable_payments(installment_id,amount_received,payment_method_id,created_by,organization_id) VALUES('{part}',1000,'{m.PM}','{m.U}','{m.A}');")
    # Existing B2B-shaped canceled title contributes nothing; isolate all newly
    # created figures against measured prior exposure rather than erase history.
    def exposure(label,new=0,exclude=None,actor=m.U,partner_id=partner):
        ident=m.uid(930000+len(h.checks))
        res=h.client(f"INSERT INTO harness.exposure_probe(id,partner_id,new_amount,exclude_order_id) VALUES('{ident}','{partner_id}',{new},{'NULL' if exclude is None else m.q(exclude)});",actor)
        h.check('exposure dispatch '+label,0,res.returncode,green)
        return json.loads(m.pg.sql(f"SELECT result FROM harness.exposure_probe WHERE id='{ident}'"))
    initial=exposure('initial')
    h.check('exposure financed total minus payment',9300,initial['saldo_em_aberto'],green)
    h.check('credit zero exposure CAS',0,update(partner,0,m.U).returncode,green)
    zero=exposure('explicit zero exposure')
    h.check('credit zero not unlimited exposure reason','LIMIT_EXCEEDED_BLOCK',zero['reason_code'],green)
    h.check('credit zero available concrete',0,zero['credito_disponivel'],green)
    h.check('credit zero division safe',0,zero['percentual_utilizado'],green)
    h.check('credit exposure restore CAS',0,update(partner,20000,m.U).returncode,green)
    order1,order2,linked=m.uid(940001),m.uid(940002),m.uid(940003)
    m.pg.sql(f"INSERT INTO partner_orders(id,partner_id,status,total,final_amount_with_interest) VALUES('{order1}','{partner}','aprovado',999,2000),('{order2}','{partner}','em_analise_comercial',999,1500),('{linked}','{partner}','aprovado',999,5000),('{m.uid(940004)}','{other}','aprovado',999,9000); INSERT INTO partner_order_financial_links(partner_order_id) VALUES('{linked}');")
    result=exposure('mixed',700)
    for key,value in dict(saldo_em_aberto=9300,comprometido_nao_faturado=2000,comprometido_pendente=1500,novo_pedido=700,exposicao_atual=12800,exposicao_projetada=13500,credito_disponivel=6500,percentual_utilizado=67.5,reason_code='OK').items():
        h.check('exposure exact '+key,value,result[key],green)
    excluded=exposure('exclude own pending',700,order2)
    h.check('exposure exclusion prevents double counting',12000,excluded['exposicao_projetada'],green)
    h.check('exposure exceeded existing action','LIMIT_EXCEEDED_BLOCK',exposure('over limit',10000)['reason_code'],green)
    reject('exposure foreign actor',"INSERT INTO harness.exposure_probe(id,partner_id,new_amount) VALUES('"+m.uid(940005)+"','"+partner+"',1);",('42501','C2P1_FORBIDDEN'),h.V)
    # Preserve payment and financed snapshot as measured, not principal conversion.
    h.check('exposure immutable financed original','10300.00',m.pg.sql(f"SELECT original_amount::numeric(14,2) FROM accounts_receivable_installments WHERE id='{part}'"),green)
    # Full captured implementation: exercise its actual early ownership branch.
    # It remains gated before any title, fiscal or installment creation.
    impl=source('generate_b2b_receivable_secure_impl')
    m.pg.sql(impl['body']+';')
    h.acl('FUNCTION',impl['signature'],impl['acl'])
    h.table('partner_order_audit_logs');h.extra_state_tables.append('partner_order_audit_logs')
    h.check('impl captured client EXECUTE closed','f',m.pg.sql("SELECT has_function_privilege('authenticated','generate_b2b_receivable_secure_impl(uuid)','EXECUTE')"),green)
    m.pg.sql("CREATE TABLE harness.impl_probe(id uuid PRIMARY KEY,order_id uuid,result jsonb); GRANT INSERT,SELECT ON harness.impl_probe TO authenticated; CREATE FUNCTION harness.impl_carrier() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN NEW.result:=public.generate_b2b_receivable_secure_impl(NEW.order_id); RETURN NEW; END$$; REVOKE ALL ON FUNCTION harness.impl_carrier() FROM PUBLIC,anon,authenticated; CREATE TRIGGER impl_probe BEFORE INSERT ON harness.impl_probe FOR EACH ROW EXECUTE FUNCTION harness.impl_carrier();")
    h.extra_state_tables.append('harness.impl_probe')
    def impl_call():return "INSERT INTO harness.impl_probe(id,order_id) VALUES('"+m.uid(950000+len(h.checks))+"','"+order1+"');"
    # FSF is a synthetic buyer tenant explicitly linked to the synthetic partner,
    # never a productive UUID derived from its displayed name.
    m.pg.sql(f"UPDATE organizations SET partner_account_id='{partner}' WHERE id='{m.B}';")
    reject('RED impl selects buyer tenant ahead of owner',impl_call(),('42501','B2B_FINANCIAL_TENANT_MISMATCH'),mode=red)
    anchor="""  SELECT count(*), min(o.id::text)::uuid INTO v_org_count,v_org
    FROM public.organizations o WHERE o.partner_account_id=v_order.partner_id;
  -- c2_ord_owner_tenant: cliente comercial sem tenant próprio fatura no tenant dono.
  IF v_org_count = 0 THEN
    SELECT count(*), min(o.id::text)::uuid INTO v_org_count, v_org
      FROM public.partner_accounts pa JOIN public.organizations o ON o.id = pa.commercial_owner_organization_id
     WHERE pa.id = v_order.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
       AND o.ativo IS TRUE AND o.status = 'ativa';
  END IF;"""
    replacement="""  -- Offline decision: the creditor is the commercial owner, never the buyer tenant.
  SELECT count(*), min(o.id::text)::uuid INTO v_org_count, v_org
    FROM public.partner_accounts pa JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
   WHERE pa.id=v_order.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
     AND o.ativo IS TRUE AND o.status='ativa';"""
    corrected=transform('generate_b2b_receivable_secure_impl',anchor,replacement)
    for name in ['partner_order_items','partner_order_payment_terms']:
        h.table(name)
        h.extra_state_tables.append(name)
        h.acl('TABLE',name,h.relation(name)['acl'])
        m.pg.sql('ALTER TABLE '+name+' ENABLE ROW LEVEL SECURITY;')
        # Empty relations cannot fabricate prices/terms/approval; only compose
        # captured columns/checks to reach the legitimate missing-contract denial.
    # order approved fixture lacks legitimate terms: reach exact captured gate,
    # not fabricate terms or flip eligible. Capture its real error as BLOCKED.
    before=h.state();res=h.client(impl_call())
    error=h.error_tuple(res)
    h.check('GREEN owner proceeds only to legitimate billing denial',('P0001','billing_not_eligible:PAYMENT_TERMS_NOT_DEFINED'),error,green)
    h.check('GREEN billing denial atomic',before,h.state(),green)
    h.responses.append(dict(test='owner full impl next gate',stderr=res.stderr))
    reject('GREEN buyer cannot become creditor',impl_call(),('42501','B2B_FINANCIAL_TENANT_MISMATCH'),h.V)
    # Fragment projection reuses the captured pre-gate body, scoped independently
    # of denied full billing. It returns identity only, cannot mint any title/ticket.
    boundary='  -- GATE Fase C: elegibilidade server-side'
    prefix=corrected.split(boundary)[0]
    assert corrected.count(boundary)==1
    projection=prefix.replace('public.generate_b2b_receivable_secure_impl(p_partner_order_id uuid)','harness.parties_projection(p_partner_order_id uuid)')+" RETURN jsonb_build_object('creditor',v_org,'buyer_partner',v_order.partner_id); END $function$"
    m.pg.sql(projection+'; REVOKE ALL ON FUNCTION harness.parties_projection(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION harness.parties_projection(uuid) TO authenticated;')
    before=h.state();res=h.client(f"SELECT harness.parties_projection('{order1}');")
    h.check('projection exact AR owner FSF buyer',dict(creditor=m.A,buyer_partner=partner),json.loads(res.stdout.splitlines()[-1]),'PARTIES_FRAGMENT_ONLY')
    h.check('projection no write or snapshot alteration',before,h.state(),'PARTIES_FRAGMENT_ONLY')
    m.pg.sql(f"INSERT INTO user_roles VALUES('{m.U}','administrador');")
    def partner_change(sql):
        res=h.client(sql);assert res.returncode==0,res.stderr
    for label,sql,expected in [
        ('owner inactive',f"UPDATE organizations SET ativo=false WHERE id='{m.A}';",('42501','B2B_FINANCIAL_TENANT_AMBIGUOUS')),
        ('partner inactive',f"UPDATE partner_accounts SET ativo=false WHERE id='{partner}';",('42501','B2B_FINANCIAL_TENANT_AMBIGUOUS'))]:
        if 'partner_accounts' in sql:partner_change(sql)
        else:m.pg.sql(sql)
        try:reject('parties '+label,f"SELECT harness.parties_projection('{order1}');",expected)
        finally:
            m.pg.sql(f"UPDATE organizations SET ativo=true WHERE id='{m.A}';")
            partner_change(f"UPDATE partner_accounts SET ativo=true WHERE id='{partner}';")
    m.pg.sql(f"DELETE FROM user_roles WHERE user_id='{m.U}' AND role='administrador';")
    reject('parties foreign owner order',f"SELECT harness.parties_projection('{m.uid(940004)}');",('42501','B2B_FINANCIAL_TENANT_MISMATCH'))
    # No fiscal emitter can be inferred from a title organization alone. Executable
    # contract matrix below uses ONLY captured column names on a reduced carrier;
    # deliberately not a fiscal RPC, origin ticket or installed assertion.
    m.pg.sql("CREATE TABLE harness.parties_contract(order_partner uuid,owner uuid,title_partner uuid,title_org uuid,installment_org uuid,invoice_org uuid,invoice_debtor_partner uuid,result boolean); GRANT INSERT,SELECT ON harness.parties_contract TO authenticated; CREATE FUNCTION harness.parties_contract_check() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.result := NEW.order_partner IS NOT NULL AND NEW.order_partner=NEW.title_partner AND NEW.title_partner=NEW.invoice_debtor_partner AND NEW.owner IS NOT NULL AND NEW.owner=NEW.title_org AND NEW.title_org=NEW.installment_org AND NEW.title_org=NEW.invoice_org; IF NEW.result IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'B2B_PARTIES_CONTRACT_MISMATCH' USING ERRCODE='23514'; END IF; RETURN NEW; END$$; CREATE TRIGGER parties_check BEFORE INSERT ON harness.parties_contract FOR EACH ROW EXECUTE FUNCTION harness.parties_contract_check();")
    h.extra_state_tables.append('harness.parties_contract')
    row=dict(order_partner=partner,owner=m.A,title_partner=partner,title_org=m.A,installment_org=m.A,invoice_org=m.A,invoice_debtor_partner=partner)
    def contract(values):return 'INSERT INTO harness.parties_contract('+','.join(values)+') VALUES('+','.join('NULL' if v is None else m.q(v) for v in values.values())+');'
    h.check('contract synthetic consistent chain',0,h.client(contract(row)).returncode,'PARTIES_CONTRACT_ONLY')
    for field in row:
        for value,label in [(None,'NULL'),(other if 'partner' in field else m.B,'inverse/foreign')]:
            bad=dict(row);bad[field]=value
            reject('contract '+field+' '+label,contract(bad),('23514','B2B_PARTIES_CONTRACT_MISMATCH'),mode='PARTIES_CONTRACT_ONLY')
    metadata['parties_credit']=dict(decisions=dict(seller_creditor_issuer='AR Bio',buyer_debtor='FSF Agro',explicit_credit_limit_required=True,zero_unlimited_policy=False),zero_limit_enforcement_scope='credit-trigger new progression/approval shortcuts and calculator; not certification of all runtime consumers',synthetic_ids=dict(ar_bio_owner=m.A,fsf_buyer_tenant=m.B,fsf_partner=partner),next_full_impl_error=error,projection_not_writer=True,fiscal_matrix_contract_only=True,exposure=result,
        blocked='Owner selection corrected offline, but canonical order terms/eligibility, fiscal issuer binding and accounting provenance remain unproved. No origin/accounting denial removed.')
    (h.OUT/'parties-credit-sandbox.diff').write_text('\n'.join(diffs))
    (h.OUT/'parties-credit-captured-impl.txt').write_text(impl['body'])