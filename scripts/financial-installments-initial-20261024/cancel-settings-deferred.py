"""Registration-first decision, disposable transformations only; no installable SQL."""
import json, difflib

FIELDS = ['billing_trigger','payment_terms_days','default_payment_method','credit_limit',
          'block_if_overdue','auto_generate_receivable','active','credit_limit_action',
          'overdue_tolerance_days','credit_alert_threshold_1','credit_alert_threshold_2']

def proposed_consumer_state(settings, methods, loaded=True, error=False):
    # Inactive presentation rule only; never financial authorization.
    if not loaded or error:return 'unavailable'
    if settings is None:return 'pending_configuration'
    if any(settings.get(field) is None for field in FIELDS):return 'pending_configuration'
    if settings['active'] is not True:return 'inactive_configuration'
    if sum(method.get('active') is True and method.get('name')==settings['default_payment_method'] for method in methods)!=1:return 'pending_configuration'
    return 'configuration_record_complete_not_operational_authority'

def exercise(h, metadata):
    m,r=h.m,h.r
    mode='DEFERRED_GREEN_SANDBOX'; diffs=[]
    def transform(name, anchor, replacement, count=1, schema='public'):
        f=r.captured(schema,name);body=f['body'];assert body.count(anchor)==count,(name,anchor)
        new=body.replace(anchor,replacement)
        m.pg.sql(new+';');h.acl('FUNCTION',f['signature'],f['acl'])
        diffs.append(''.join(difflib.unified_diff(body.splitlines(True),new.splitlines(True),fromfile=f['signature']+' captured',tofile='sandbox-only')))
    # Keep the captured trigger identity and all other registration triggers.
    anchor='  INSERT INTO public.partner_financial_settings(partner_id) VALUES (NEW.id)\n  ON CONFLICT (partner_id) DO NOTHING;'
    transform('tg_create_default_pfs',anchor,'  -- Decision: no financial provisioning at registration. Canonical CAS configures later.')
    def rejected(label,sql,expected,actor=m.U,role='authenticated',which=mode):
        before=h.state();res=h.client(sql,actor,role)
        h.check(label+' exact error',expected,h.error_tuple(res),which)
        h.check(label+' atomic',before,h.state(),which)
        h.responses.append(dict(test=label,stderr=res.stderr))
    partners=[(m.U,m.A,m.uid(900002),'A'),(h.V,m.B,m.uid(900003),'B')]
    for actor,org,partner,label in partners:
        m.pg.sql(f"INSERT INTO user_roles VALUES('{actor}','administrador');")
        try:
            sql=f"INSERT INTO partner_accounts(id,razao_social,commercial_owner_organization_id) VALUES('{partner}','LOCAL PARTNER {label}','{org}');"
            res=h.client(sql,actor);h.check('deferred register own '+label,0,res.returncode,mode)
            h.check('deferred register owner actor '+label,org+'|'+actor,m.pg.sql(f"SELECT commercial_owner_organization_id,created_by FROM partner_accounts WHERE id='{partner}'"),mode)
            h.check('deferred no settings method ticket '+label,'0|0',m.pg.sql(f"SELECT (SELECT count(*) FROM partner_financial_settings WHERE partner_id='{partner}'),(SELECT count(*) FROM platform_private.authz_tickets)"),mode)
            h.check('deferred registration audit '+label,'1',m.pg.sql(f"SELECT count(*) FROM partner_audit_logs WHERE partner_id='{partner}' AND usuario_id='{actor}' AND acao='create'"),mode)
            foreign_org=m.B if org==m.A else m.A
            rejected('deferred foreign registration '+label,f"INSERT INTO partner_accounts(id,razao_social,commercial_owner_organization_id) VALUES('{m.uid(902000+(1 if label=='B' else 0))}','LOCAL FOREIGN','{foreign_org}');",('42501','cadastro_owner_denied'),actor)
        finally:m.pg.sql(f"DELETE FROM user_roles WHERE user_id='{actor}' AND role='administrador';")
    rejected('deferred anonymous registration',"INSERT INTO partner_accounts(razao_social) VALUES('LOCAL ANON');",('42501','permission denied for function h15_actor_organization'),None,'anon')
    rejected('deferred no registration role',"INSERT INTO partner_accounts(razao_social) VALUES('LOCAL NO ROLE');",('42501','cadastro_context_required'))
    # RED: captured calculator manufactures a low risk score when no settings exist.
    for actor,org,partner,label in partners:
        res=h.client(f"SELECT recalc_partner_risk_score('{partner}');",actor)
        h.check('RED absent settings risk '+label,0,res.returncode,'DEFERRED_RED_CAPTURED')
        h.check('RED absent settings low risk '+label,'0|baixo',m.pg.sql(f"SELECT score,risk_level FROM partner_risk_scores WHERE partner_id='{partner}'"),'DEFERRED_RED_CAPTURED')
    # Only erase synthetic characterization results, never production/history.
    m.pg.sql('DELETE FROM partner_risk_scores; DELETE FROM financial_governance_audit_log;')
    complete="""EXISTS (SELECT 1 FROM public.partner_financial_settings s
      WHERE s.partner_id=p_partner_id AND s.active IS TRUE
      AND s.billing_trigger IS NOT NULL AND s.payment_terms_days IS NOT NULL
      AND s.default_payment_method IS NOT NULL AND s.credit_limit IS NOT NULL
      AND s.credit_limit::text NOT IN ('NaN','Infinity','-Infinity') AND s.credit_limit>=0
      AND s.block_if_overdue IS NOT NULL AND s.auto_generate_receivable IS NOT NULL
      AND s.credit_limit_action IS NOT NULL AND s.overdue_tolerance_days IS NOT NULL
      AND s.credit_alert_threshold_1 IS NOT NULL AND s.credit_alert_threshold_2 IS NOT NULL
      AND (SELECT count(*) FROM public.payment_methods pm
           WHERE pm.name=s.default_payment_method AND pm.active IS TRUE)=1)"""
    auth="IF auth.uid() IS NOT NULL AND NOT platform_private.c2p1_settings_allowed(p_partner_id,true) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;"
    guard=auth+"\n IF NOT "+complete+" THEN RAISE EXCEPTION 'B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED' USING ERRCODE='P0001'; END IF;"
    transform('recalc_partner_risk_score',"  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_id required'; END IF;", "  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_id required'; END IF;\n "+guard)
    # Captured service-only calculators remain service-only. Carrier triggers below
    # exercise their unchanged DEFINER boundary, not new callable client RPCs.
    for name in ['fn_b2b_credit_exposure','tg_partner_orders_credit_guard','tg_auto_b2b_receivable','fn_b2b_order_billing_eligibility','fn_h6c_entrega_ar_b2b_link']:
        f=r.captured('public',name);h.acl('FUNCTION',f['signature'],f['acl'])
    anchor='  v_limit := COALESCE(v_limit,0);'
    transform('fn_b2b_credit_exposure',anchor,'  '+guard+'\n'+anchor)
    # A matching row shape is synthetic scaffolding, never an order writer or origin proof.
    m.pg.sql("ALTER TABLE partner_orders ADD COLUMN total numeric, ADD COLUMN final_amount_with_interest numeric, ADD COLUMN receivable_generated boolean, ADD COLUMN internal_origin_snapshot jsonb; CREATE TABLE partner_order_financial_links(partner_order_id uuid UNIQUE); CREATE SCHEMA harness; GRANT USAGE ON SCHEMA harness TO authenticated; CREATE TABLE harness.credit_probe(id uuid PRIMARY KEY,partner_id uuid,status text,total numeric,final_amount_with_interest numeric,credit_approved_by uuid,credit_block_reason text,receivable_generated boolean DEFAULT false); GRANT SELECT,INSERT,UPDATE,DELETE ON harness.credit_probe TO authenticated; CREATE TRIGGER credit_probe BEFORE INSERT OR UPDATE ON harness.credit_probe FOR EACH ROW EXECUTE FUNCTION tg_partner_orders_credit_guard();")
    h.extra_state_tables+=['harness.credit_probe','partner_order_financial_links','partner_orders']
    # The baseline credit trigger's approved shortcut skips the calculator entirely.
    probe=m.uid(903000);partner=m.uid(900002)
    res=h.client(f"INSERT INTO harness.credit_probe(id,partner_id,status,total) VALUES('{probe}','{partner}','rascunho',100);")
    h.check('credit carrier baseline draft accepted',0,res.returncode,'DEFERRED_RED_CAPTURED')
    res=h.client(f"UPDATE harness.credit_probe SET credit_approved_by='{m.U}',status='aprovado' WHERE id='{probe}';")
    h.check('RED absent settings approved shortcut accepted',0,res.returncode,'DEFERRED_RED_CAPTURED')
    h.check('RED shortcut progressed','aprovado',m.pg.sql(f"SELECT status FROM harness.credit_probe WHERE id='{probe}'"),'DEFERRED_RED_CAPTURED')
    m.pg.sql('DELETE FROM harness.credit_probe;')
    financial_statuses="('pendente','solicitado','aguardando_ajuste_comercial','aguardando_itens','em_analise_comercial','aprovado','aguardando_aprovacao_credito','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado')"
    scoped_guard=guard.replace('p_partner_id','NEW.partner_id')
    entry="\n  IF NEW.status IN "+financial_statuses+" OR NEW.credit_approved_by IS NOT NULL THEN\n    "+scoped_guard+"\n  END IF;"
    transform('tg_partner_orders_credit_guard','BEGIN\n','BEGIN\n'+entry+'\n')
    anchor='BEGIN\n  SELECT * INTO v_settings'
    transform('tg_auto_b2b_receivable',anchor,'BEGIN\n'+entry.replace(' OR NEW.credit_approved_by IS NOT NULL','')+'\n  SELECT * INTO v_settings')
    # Full captured eligibility remains private. A synthetic trigger carrier calls
    # the service-only function under its captured owner; no new authorization claim.
    eligibility_guard=guard.replace('p_partner_id','v_order.partner_id')
    eligibility_guard=eligibility_guard.replace("RAISE EXCEPTION 'B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED' USING ERRCODE='P0001';","RETURN jsonb_build_object('eligible',false,'reason_code','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED');")
    anchor="  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_FOUND'); END IF;"
    transform('fn_b2b_order_billing_eligibility',anchor,anchor+'\n'+eligibility_guard)
    # Link guard moves before the first protected title mutation, no fallback settings.
    link_guard=guard.replace('p_partner_id','v_po.partner_id')
    anchor='  -- 1) o recebível passa a pertencer ao parceiro (entra em saldo_em_aberto)'
    transform('fn_h6c_entrega_ar_b2b_link',anchor,'  '+link_guard+'\n'+anchor)
    # Wrapper already preserves explicit origin/accounting denials. Add readiness only
    # after those exact gates, before row/advisory locks and downstream writers.
    wrapper=r.captured('public','generate_b2b_receivable_secure');h.acl('FUNCTION',wrapper['signature'],wrapper['acl'])
    for schema,name in [('public','is_platform_superadmin'),('platform_private','b2b_phase1_partner_visible'),('public','b2b_phase1_partner_visible'),('platform_private','b2b_phase1_order_visible'),('public','b2b_phase1_order_visible')]:
        f=r.captured(schema,name);h.acl('FUNCTION',f['signature'],f['acl'])
    # No complete order fixture is inserted. Trigger carrier tests settings denial
    # directly; full wrapper's origin denial remains source-pinned and NOT RUN.
    anchor='  -- Canonical row-before-receipt order, matching approval and its billing trigger.'
    wrapper_guard=guard.replace('p_partner_id','(SELECT partner_id FROM public.partner_orders WHERE id=p_partner_order_id)')
    transform('generate_b2b_receivable_secure',anchor,'  '+wrapper_guard+'\n'+anchor)
    # Preserve both alternatives with explicit CASE; Boolean OR is not an
    # evaluation-order guarantee and cannot fence the external dependency.
    f=next(f for f in r.live['functions'] if f['name']=='generate_b2b_receivable_secure' and f['schema']=='public')
    current=m.pg.sql("SELECT pg_get_functiondef('generate_b2b_receivable_secure(uuid)'::regprocedure)")
    original="ELSIF NOT (public.b2b_phase1_order_visible(p_partner_order_id) OR EXISTS (\n    SELECT 1 FROM public.partner_orders po WHERE po.id=p_partner_order_id\n      AND platform_private.c2p1_settings_allowed(po.partner_id,true))) THEN"
    replacement="ELSIF NOT (CASE WHEN EXISTS (\n    SELECT 1 FROM public.partner_orders po WHERE po.id=p_partner_order_id\n      AND platform_private.c2p1_settings_allowed(po.partner_id,true)) THEN true ELSE public.b2b_phase1_order_visible(p_partner_order_id) END) THEN"
    assert current.count(original)==1
    reordered=current.replace(original,replacement);m.pg.sql(reordered+';')
    diffs.append(''.join(difflib.unified_diff(current.splitlines(True),reordered.splitlines(True),fromfile='wrapper readiness hypothesis',tofile='same alternatives internal first')))
    for actor,org,partner,label in partners:
        probe=m.uid(903010+(1 if label=='B' else 0))
        h.check('deferred draft carrier '+label,0,h.client(f"INSERT INTO harness.credit_probe(id,partner_id,status,total) VALUES('{probe}','{partner}','rascunho',100);",actor).returncode,mode)
        for status in ['pendente','solicitado','aguardando_ajuste_comercial','aguardando_itens','em_analise_comercial','aprovado','entregue']:
            rejected('deferred credit progression '+status+' '+label,f"UPDATE harness.credit_probe SET status='{status}' WHERE id='{probe}';",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        rejected('deferred credit approved shortcut '+label,f"UPDATE harness.credit_probe SET credit_approved_by='{actor}' WHERE id='{probe}';",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        # Link carrier uses the captured row-locked order lookup, but that order shape
        # is explicitly reduced and has no invented origin or downstream positive.
    m.pg.sql("CREATE TABLE harness.delivery_probe(id uuid PRIMARY KEY, partner_order_id uuid,receivable_id uuid,billing_generated_by uuid); GRANT SELECT,INSERT,UPDATE ON harness.delivery_probe TO authenticated; CREATE TRIGGER link_probe BEFORE UPDATE ON harness.delivery_probe FOR EACH ROW EXECUTE FUNCTION fn_h6c_entrega_ar_b2b_link();")
    h.extra_state_tables.append('harness.delivery_probe')
    m.pg.sql("ALTER TABLE partner_orders ADD COLUMN financial_approval_status text, ADD COLUMN requires_financial_approval boolean; CREATE TABLE harness.eligibility_probe(id uuid PRIMARY KEY,order_id uuid,result jsonb); GRANT SELECT,INSERT,UPDATE ON harness.eligibility_probe TO authenticated; CREATE FUNCTION harness.eligibility_carrier() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN NEW.result:=public.fn_b2b_order_billing_eligibility(NEW.order_id); RETURN NEW; END$$; REVOKE ALL ON FUNCTION harness.eligibility_carrier() FROM PUBLIC,anon,authenticated; CREATE TRIGGER eligibility_probe BEFORE INSERT OR UPDATE ON harness.eligibility_probe FOR EACH ROW EXECUTE FUNCTION harness.eligibility_carrier();")
    h.extra_state_tables.append('harness.eligibility_probe')
    for actor,org,partner,label in partners:
        order=m.uid(904000+(1 if label=='B' else 0));probe=m.uid(904010+(1 if label=='B' else 0))
        m.pg.sql(f"INSERT INTO partner_orders(id,partner_id,status) VALUES('{order}','{partner}','rascunho'); INSERT INTO harness.delivery_probe(id,partner_order_id,billing_generated_by) VALUES('{probe}','{order}','{actor}');")
        h.check('deferred eligibility carrier dispatch '+label,0,h.client(f"INSERT INTO harness.eligibility_probe(id,order_id) VALUES('{probe}','{order}');",actor).returncode,mode)
        h.check('deferred eligibility exact missing '+label,{'eligible':False,'reason_code':'B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'},json.loads(m.pg.sql(f"SELECT result FROM harness.eligibility_probe WHERE id='{probe}'")),mode)
        rejected('deferred delivery link missing settings '+label,f"UPDATE harness.delivery_probe SET receivable_id='{m.uid(904020)}' WHERE id='{probe}';",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        rejected('deferred billing wrapper missing settings '+label,f"SELECT generate_b2b_receivable_secure('{order}');",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        for column,value,marker in [('internal_origin_snapshot',"'{}'::jsonb",'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED'),('c2_external_origin_snapshot',"'{\"contract\":\"C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1\"}'::jsonb",'C2_ACCOUNTING_PENDING')]:
            # Markers are denial-only probes, not valid origin/fiscal tickets.
            m.pg.sql(f"UPDATE partner_orders SET {column}={value} WHERE id='{order}';")
            try:rejected('deferred preserved '+marker+' '+label,f"SELECT generate_b2b_receivable_secure('{order}');",('42501',marker),actor)
            finally:m.pg.sql(f"UPDATE partner_orders SET {column}=NULL WHERE id='{order}';")
    # The auto trigger must reject before generating, while a draft remains possible.
    m.pg.sql("CREATE TABLE harness.auto_probe (LIKE harness.credit_probe INCLUDING ALL); GRANT SELECT,INSERT,UPDATE ON harness.auto_probe TO authenticated; CREATE TRIGGER auto_probe BEFORE UPDATE ON harness.auto_probe FOR EACH ROW EXECUTE FUNCTION tg_auto_b2b_receivable();")
    h.extra_state_tables.append('harness.auto_probe')
    for actor,org,partner,label in partners:
        probe=m.uid(903010+(1 if label=='B' else 0))
        h.check('deferred isolated automatic draft '+label,0,h.client(f"INSERT INTO harness.auto_probe(id,partner_id,status,total) VALUES('{probe}','{partner}','rascunho',100);",actor).returncode,mode)
        rejected('deferred automatic billing absent '+label,f"UPDATE harness.auto_probe SET status='entregue' WHERE id='{probe}';",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
    m.pg.sql('DELETE FROM partner_orders;')
    # All supplied values must be explicit; no defaulted/null credit or fabricated method.
    anchor=" -- Exact canonical name; method row lock prevents concurrent deactivation through commit."
    validation=""" IF newrow.credit_limit IS NULL OR newrow.credit_limit::text IN ('NaN','Infinity','-Infinity') OR newrow.credit_limit<0
 OR EXISTS(SELECT 1 FROM jsonb_each(p_values) e WHERE e.value='null'::jsonb)
 THEN RAISE EXCEPTION 'C2P1_INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;
"""
    transform('c2p1_update_settings',anchor,validation+anchor,schema='platform_private')
    for actor,org,partner,label in partners:
        rejected('deferred absent settings risk '+label,f"SELECT recalc_partner_risk_score('{partner}');",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        other=m.uid(900003) if label=='A' else m.uid(900002)
        rejected('deferred foreign risk '+label,f"SELECT recalc_partner_risk_score('{other}');",('42501','C2P1_FORBIDDEN'),actor)
    values=dict(billing_trigger='manual',payment_terms_days=0,default_payment_method='LOCAL_METHOD',credit_limit=20000,
                block_if_overdue=True,auto_generate_receivable=False,active=True,credit_limit_action='block',
                overdue_tolerance_days=0,credit_alert_threshold_1=80,credit_alert_threshold_2=90)
    methods=[dict(name='LOCAL_METHOD',active=True)]
    for label,settings,loaded,error,expected in [('absent',None,True,False,'pending_configuration'),('loading',None,False,False,'unavailable'),('error',values,True,True,'unavailable'),('complete',values,True,False,'configuration_record_complete_not_operational_authority'),('incomplete',dict(values,credit_limit=None),True,False,'pending_configuration'),('inactive',dict(values,active=False),True,False,'inactive_configuration')]:
        h.check('inactive consumer '+label,expected,proposed_consumer_state(settings,methods,loaded,error),'DEFERRED_CONSUMER_PROPOSAL')
    h.check('inactive consumer inactive method','pending_configuration',proposed_consumer_state(values,[dict(name='LOCAL_METHOD',active=False)]),'DEFERRED_CONSUMER_PROPOSAL')
    h.check('inactive consumer ambiguous method','pending_configuration',proposed_consumer_state(values,methods+methods),'DEFERRED_CONSUMER_PROPOSAL')
    def update(partner,payload,expected=None):
        return 'SELECT rpc_update_partner_financial_settings('+m.q(partner)+','+('NULL' if expected is None else m.q(expected)+'::jsonb')+','+m.q(json.dumps(payload))+'::jsonb);'
    for actor,org,partner,label in partners:
        for field in FIELDS:
            invalid=dict(values);invalid.pop(field)
            rejected('deferred missing '+field+' '+label,update(partner,invalid),('22023','C2P1_INVALID_PAYLOAD'),actor)
        for field in FIELDS:
            invalid=dict(values);invalid[field]=None
            rejected('deferred NULL '+field+' '+label,update(partner,invalid),('22023','C2P1_INVALID_PAYLOAD'),actor)
        for value in [-1,'NaN','Infinity','-Infinity']:
            invalid=dict(values);invalid['credit_limit']=value
            expected=('22003','numeric field overflow') if value in ['Infinity','-Infinity'] else ('22023','C2P1_INVALID_PAYLOAD')
            rejected('deferred invalid credit '+str(value)+' '+label,update(partner,invalid),expected,actor)
        invalid=dict(values);invalid['default_payment_method']='UNKNOWN'
        rejected('deferred invalid method '+label,update(partner,invalid),('22023','C2P1_PAYMENT_METHOD_INVALID'),actor)
        other=m.uid(900003) if label=='A' else m.uid(900002)
        rejected('deferred foreign updater '+label,update(other,values),('42501','C2P1_FORBIDDEN'),actor)
        for target,disable,restore in [('profile',f"UPDATE profiles SET ativo=false WHERE user_id='{actor}';",f"UPDATE profiles SET ativo=true WHERE user_id='{actor}';"),('role',f"DELETE FROM user_roles WHERE user_id='{actor}';",f"INSERT INTO user_roles VALUES('{actor}','financeiro');"),('tenant',f"UPDATE organizations SET ativo=false WHERE id='{org}';",f"UPDATE organizations SET ativo=true WHERE id='{org}';")]:
            m.pg.sql(disable)
            try:rejected('deferred revoked '+target+' updater '+label,update(partner,values),('42501','C2P1_FORBIDDEN'),actor)
            finally:m.pg.sql(restore)
        res=h.client(update(partner,values),actor)
        h.check('deferred complete updater '+label,0,res.returncode,mode)
        h.check('deferred exact eleven values '+label,values,json.loads(m.pg.sql('SELECT to_jsonb(s)-ARRAY[\'id\',\'partner_id\',\'created_at\',\'updated_at\'] FROM partner_financial_settings s WHERE partner_id='+m.q(partner))),mode)
        h.check('deferred canonical audit '+label,'1',m.pg.sql(f"SELECT count(*) FROM financial_governance_audit_log WHERE partner_id='{partner}' AND usuario_id='{actor}' AND acao='partner_financial_settings_insert'"),mode)
        h.check('deferred no remaining ticket '+label,'0',m.pg.sql('SELECT count(*) FROM platform_private.authz_tickets'),mode)
        rejected('deferred stale absence CAS '+label,update(partner,values),('PT409','settings_conflict'),actor)
        res=h.client(f"SELECT recalc_partner_risk_score('{partner}');",actor)
        h.check('deferred configured risk own '+label,0,res.returncode,mode)
        h.check('deferred configured risk legitimate empty history '+label,'0|baixo',m.pg.sql(f"SELECT score,risk_level FROM partner_risk_scores WHERE partner_id='{partner}'"),mode)
        probe=m.uid(903010+(1 if label=='B' else 0))
        h.check('deferred configured credit carrier allowed '+label,0,h.client(f"UPDATE harness.credit_probe SET status='em_analise_comercial' WHERE id='{probe}';",actor).returncode,mode)
        # Method deactivation and active=false must close readiness, even with eleven keys.
        m.pg.sql(f"UPDATE payment_methods SET active=false WHERE id='{m.PM}';")
        try:rejected('deferred deactivated method risk '+label,f"SELECT recalc_partner_risk_score('{partner}');",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        finally:m.pg.sql(f"UPDATE payment_methods SET active=true WHERE id='{m.PM}';")
        expected=m.pg.sql('SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='+m.q(partner))
        inactive=dict(values);inactive['active']=False
        h.check('deferred canonical inactive configuration '+label,0,h.client(update(partner,inactive,expected),actor).returncode,mode)
        rejected('deferred inactive configuration risk '+label,f"SELECT recalc_partner_risk_score('{partner}');",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        expected=m.pg.sql('SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='+m.q(partner))
        h.check('deferred canonical reactivation '+label,0,h.client(update(partner,values,expected),actor).returncode,mode)
        # Fully configured does not discharge internal/accounting origin containment.
        order=m.uid(905000+(1 if label=='B' else 0))
        m.pg.sql(f"INSERT INTO partner_orders(id,partner_id,status) VALUES('{order}','{partner}','rascunho');")
        probe=m.uid(905010+(1 if label=='B' else 0))
        h.check('deferred configured eligibility dispatch '+label,0,h.client(f"INSERT INTO harness.eligibility_probe(id,order_id) VALUES('{probe}','{order}');",actor).returncode,mode)
        h.check('deferred configured eligibility still order denied '+label,{'eligible':False,'reason_code':'ORDER_NOT_APPROVED','status':'rascunho'},json.loads(m.pg.sql(f"SELECT result FROM harness.eligibility_probe WHERE id='{probe}'")),mode)
        for column,value,marker in [('internal_origin_snapshot',"'{}'::jsonb",'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED'),('c2_external_origin_snapshot',"'{\"contract\":\"C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1\"}'::jsonb",'C2_ACCOUNTING_PENDING')]:
            m.pg.sql(f"UPDATE partner_orders SET {column}={value} WHERE id='{order}';")
            try:rejected('deferred configured still '+marker+' '+label,f"SELECT generate_b2b_receivable_secure('{order}');",('42501',marker),actor)
            finally:m.pg.sql(f"UPDATE partner_orders SET {column}=NULL WHERE id='{order}';")
        m.pg.sql(f"DELETE FROM partner_orders WHERE id='{order}';")
    rejected('deferred anonymous updater',update(m.uid(900002),values),('42501','permission denied for function rpc_update_partner_financial_settings'),None,'anon')
    rejected('deferred no direct ticket issuer',"SELECT platform_private.issue_ticket('c2p1_settings_write','"+m.uid(900002)+"');",('42501','permission denied for function issue_ticket'))
    rejected('deferred no direct settings writer',"INSERT INTO partner_financial_settings(partner_id) VALUES('"+m.uid(900002)+"');",('42501','permission denied for table partner_financial_settings'))
    for name in ['fn_b2b_credit_exposure','fn_b2b_order_billing_eligibility','tg_partner_orders_credit_guard','fn_h6c_entrega_ar_b2b_link']:
        signature=next(f['signature'] for f in r.live['functions'] if f['schema']=='public' and f['name']==name)
        h.check('deferred captured service-only ACL '+name,'f',m.pg.sql("SELECT has_function_privilege('authenticated',"+m.q(signature)+",'EXECUTE')"),mode)
    # A legacy incomplete row is created only via the exact captured CAS updater;
    # never insert around the settings fence or invoke its issuer directly.
    hardened=m.pg.sql("SELECT pg_get_functiondef('platform_private.c2p1_update_settings(uuid,jsonb,jsonb)'::regprocedure)")
    for actor,org,partner,label in partners:
        expected=m.pg.sql('SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='+m.q(partner))
        legacy=dict(values);legacy['credit_limit']=None
        f=r.captured('platform_private','c2p1_update_settings');h.acl('FUNCTION',f['signature'],f['acl'])
        try:
            h.check('RED captured updater permits incomplete credit '+label,0,h.client(update(partner,legacy,expected),actor).returncode,'DEFERRED_RED_CAPTURED')
        finally:m.pg.sql(hardened+';')
        rejected('deferred legacy incomplete risk '+label,f"SELECT recalc_partner_risk_score('{partner}');",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        probe=m.uid(903010+(1 if label=='B' else 0))
        rejected('deferred legacy incomplete credit '+label,f"UPDATE harness.credit_probe SET status='aprovado' WHERE id='{probe}';",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        rejected('deferred legacy incomplete automatic '+label,f"UPDATE harness.auto_probe SET status='entregue' WHERE id='{probe}';",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        order=m.uid(906000+(1 if label=='B' else 0));probe=m.uid(906010+(1 if label=='B' else 0))
        m.pg.sql(f"INSERT INTO partner_orders(id,partner_id,status) VALUES('{order}','{partner}','rascunho'); INSERT INTO harness.delivery_probe(id,partner_order_id,billing_generated_by) VALUES('{probe}','{order}','{actor}');")
        rejected('deferred legacy incomplete wrapper '+label,f"SELECT generate_b2b_receivable_secure('{order}');",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        rejected('deferred legacy incomplete link '+label,f"UPDATE harness.delivery_probe SET receivable_id='{m.uid(904020)}' WHERE id='{probe}';",('P0001','B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'),actor)
        h.check('deferred legacy eligibility dispatch '+label,0,h.client(f"INSERT INTO harness.eligibility_probe(id,order_id) VALUES('{probe}','{order}');",actor).returncode,mode)
        h.check('deferred legacy eligibility closed '+label,{'eligible':False,'reason_code':'B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED'},json.loads(m.pg.sql(f"SELECT result FROM harness.eligibility_probe WHERE id='{probe}'")),mode)
        expected=m.pg.sql('SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='+m.q(partner))
        h.check('deferred repair legacy only canonical '+label,0,h.client(update(partner,values,expected),actor).returncode,mode)
        m.pg.sql(f"DELETE FROM partner_orders WHERE id='{order}';")
    # Configuration removes only the risk FK blocker, not the origin/fiscal authority.
    part=h.fixture(2050,'receivable',m.A,b2b=True);money=h.amounts(part,'receivable')
    h.check('deferred B2B-shaped own cancel after risk composition',0,h.client(h.call(part,'receivable')).returncode,mode)
    h.check('deferred B2B-shaped monetary preserved',money,h.amounts(part,'receivable'),mode)
    metadata['deferred']=dict(decision='register first; finance later',values_are_synthetic=True,
        registered_partners=[p for _,_,p,_ in partners],risk_fk_resolved=True,
        limits='B2B-shaped parent uses existing reduced monetary harness, not proven order/origin/fiscal. No positive full billing claim.')
    metadata['deferred']['carriers']='harness.credit_probe/delivery_probe/eligibility_probe are disposable row shapes, not runtime writers, RLS or complete order/entrega integration; only captured financial function boundaries exercised.'
    metadata['blocked']='Full B2B order/origin/fiscal/accounting and billing transitive authority remain unproved; risk FK/registration blocker resolved only in sandbox.'
    (h.OUT/'deferred-settings-sandbox.diff').write_text('\n'.join(diffs))