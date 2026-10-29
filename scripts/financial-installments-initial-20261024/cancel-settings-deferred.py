"""Registration-first decision, disposable transformations only; no installable SQL."""
import json, difflib

FIELDS = ['billing_trigger','payment_terms_days','default_payment_method','credit_limit',
          'block_if_overdue','auto_generate_receivable','active','credit_limit_action',
          'overdue_tolerance_days','credit_alert_threshold_1','credit_alert_threshold_2']

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
    rejected('deferred anonymous registration',"INSERT INTO partner_accounts(razao_social) VALUES('LOCAL ANON');",('42501','permission denied for table partner_accounts'),None,'anon')
    rejected('deferred no registration role',"INSERT INTO partner_accounts(razao_social) VALUES('LOCAL NO ROLE');",('42501','new row violates row-level security policy for table "partner_accounts"'))
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
    def update(partner,payload,expected=None):
        return 'SELECT rpc_update_partner_financial_settings('+m.q(partner)+','+('NULL' if expected is None else m.q(expected)+'::jsonb')+','+m.q(json.dumps(payload))+'::jsonb);'
    for actor,org,partner,label in partners:
        for field in FIELDS:
            invalid=dict(values);invalid.pop(field)
            rejected('deferred missing '+field+' '+label,update(partner,invalid),('22023','C2P1_INVALID_PAYLOAD'),actor)
        for field in ['credit_limit','default_payment_method']:
            invalid=dict(values);invalid[field]=None
            rejected('deferred NULL '+field+' '+label,update(partner,invalid),('22023','C2P1_INVALID_PAYLOAD'),actor)
        invalid=dict(values);invalid['default_payment_method']='UNKNOWN'
        rejected('deferred invalid method '+label,update(partner,invalid),('22023','C2P1_PAYMENT_METHOD_INVALID'),actor)
        other=m.uid(900003) if label=='A' else m.uid(900002)
        rejected('deferred foreign updater '+label,update(other,values),('42501','C2P1_FORBIDDEN'),actor)
        res=h.client(update(partner,values),actor)
        h.check('deferred complete updater '+label,0,res.returncode,mode)
        h.check('deferred exact eleven values '+label,values,json.loads(m.pg.sql('SELECT to_jsonb(s)-ARRAY[\'id\',\'partner_id\',\'created_at\',\'updated_at\'] FROM partner_financial_settings s WHERE partner_id='+m.q(partner))),mode)
        h.check('deferred canonical audit '+label,'1',m.pg.sql(f"SELECT count(*) FROM financial_governance_audit_log WHERE partner_id='{partner}' AND usuario_id='{actor}' AND acao='partner_financial_settings_insert'"),mode)
        h.check('deferred no remaining ticket '+label,'0',m.pg.sql('SELECT count(*) FROM platform_private.authz_tickets'),mode)
        rejected('deferred stale absence CAS '+label,update(partner,values),('PT409','settings_conflict'),actor)
        res=h.client(f"SELECT recalc_partner_risk_score('{partner}');",actor)
        h.check('deferred configured risk own '+label,0,res.returncode,mode)
        h.check('deferred configured risk legitimate empty history '+label,'0|baixo',m.pg.sql(f"SELECT score,risk_level FROM partner_risk_scores WHERE partner_id='{partner}'"),mode)
    rejected('deferred anonymous updater',update(m.uid(900002),values),('42501','permission denied for function rpc_update_partner_financial_settings'),None,'anon')
    # Configuration removes only the risk FK blocker, not the origin/fiscal authority.
    part=h.fixture(2050,'receivable',m.A,b2b=True);money=h.amounts(part,'receivable')
    h.check('deferred B2B-shaped own cancel after risk composition',0,h.client(h.call(part,'receivable')).returncode,mode)
    h.check('deferred B2B-shaped monetary preserved',money,h.amounts(part,'receivable'),mode)
    metadata['deferred']=dict(decision='register first; finance later',values_are_synthetic=True,
        registered_partners=[p for _,_,p,_ in partners],risk_fk_resolved=True,
        limits='B2B-shaped parent uses existing reduced monetary harness, not proven order/origin/fiscal. No positive full billing claim.')
    metadata['blocked']='Full B2B order/origin/fiscal/accounting and billing transitive authority remain unproved; risk FK/registration blocker resolved only in sandbox.'
    (h.OUT/'deferred-settings-sandbox.diff').write_text('\n'.join(diffs))